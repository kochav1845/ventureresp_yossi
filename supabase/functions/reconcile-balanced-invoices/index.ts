import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function padRefNbr(refNbr: string): string {
  if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
    return refNbr.padStart(6, "0");
  }
  return refNbr;
}

async function reconcile(supabase: any, jobId: string) {
  try {
    await supabase
      .from("async_sync_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    const { data: credentials, error: credsError } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error(`Missing Acumatica credentials: ${credsError?.message || "none found"}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const creds = {
      acumaticaUrl,
      username: credentials.username,
      password: credentials.password,
      company: credentials.company || "",
      branch: credentials.branch || "",
    };

    // Step 1: Get all balanced invoices from our DB
    const dbBalanced: { id: string; reference_number: string; type: string }[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
      const { data: page, error: dbErr } = await supabase
        .from("acumatica_invoices")
        .select("id, reference_number, type")
        .eq("status", "Balanced")
        .range(offset, offset + PAGE_SIZE - 1);

      if (dbErr) throw new Error(`DB query failed: ${dbErr.message}`);
      if (page) dbBalanced.push(...page);
      if (!page || page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    console.log(`[reconcile] Found ${dbBalanced.length} balanced invoices in DB`);

    await supabase.from("async_sync_jobs").update({
      progress: { phase: "Fetching balanced invoices from Acumatica", dbCount: dbBalanced.length },
    }).eq("id", jobId);

    if (dbBalanced.length === 0) {
      await supabase.from("async_sync_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        progress: { checked: 0, updated: 0, deleted: 0, updatedList: [], deletedList: [], errors: [] },
      }).eq("id", jobId);
      return;
    }

    // Step 2: Fetch ALL balanced invoices from Acumatica (lightweight list)
    const acumaticaBalancedSet = new Set<string>();
    const listUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=Status eq 'Balanced'&$select=ReferenceNbr,Type`;

    console.log("[reconcile] Fetching balanced invoices from Acumatica...");

    const listResponse = await sessionManager.makeAuthenticatedRequest(creds, listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      throw new Error(`Failed to fetch balanced list from Acumatica (${listResponse.status}): ${errorText.substring(0, 300)}`);
    }

    const listData = await listResponse.json();
    const acumaticaList = Array.isArray(listData) ? listData : [];

    for (const inv of acumaticaList) {
      const refNbr = padRefNbr(inv.ReferenceNbr?.value || "");
      const type = inv.Type?.value || "";
      if (refNbr && type) {
        acumaticaBalancedSet.add(`${type}:${refNbr}`);
      }
    }

    console.log(`[reconcile] Acumatica has ${acumaticaBalancedSet.size} balanced invoices`);

    await supabase.from("async_sync_jobs").update({
      progress: {
        phase: "Comparing and reconciling",
        dbCount: dbBalanced.length,
        acumaticaCount: acumaticaBalancedSet.size,
      },
    }).eq("id", jobId);

    // Step 3: Invoices in our DB that are NO LONGER balanced in Acumatica
    // They were either released (Open/Closed) or deleted
    const noLongerBalanced = dbBalanced.filter(
      (inv) => !acumaticaBalancedSet.has(`${inv.type}:${inv.reference_number}`)
    );

    console.log(`[reconcile] ${noLongerBalanced.length} invoices are no longer balanced in Acumatica`);

    let updated = 0;
    let deleted = 0;
    let processed = 0;
    const updatedList: { ref: string; type: string; newStatus: string }[] = [];
    const deletedList: { ref: string; type: string }[] = [];
    const errors: string[] = [];

    // Step 4: For each no-longer-balanced invoice, check if it now exists as Open/Closed
    for (const dbInv of noLongerBalanced) {
      processed++;

      try {
        // Check if we already have a non-balanced version of this invoice in our DB
        const { data: existingNonBalanced } = await supabase
          .from("acumatica_invoices")
          .select("id, status")
          .eq("reference_number", dbInv.reference_number)
          .eq("type", dbInv.type)
          .neq("status", "Balanced")
          .maybeSingle();

        if (existingNonBalanced) {
          // We already have an Open/Closed version -- the balanced one is stale, delete it
          const { error: deleteErr } = await supabase
            .from("acumatica_invoices")
            .delete()
            .eq("id", dbInv.id);

          if (deleteErr) {
            errors.push(`Delete dup ${dbInv.reference_number}: ${deleteErr.message}`);
          } else {
            deleted++;
            deletedList.push({ ref: dbInv.reference_number, type: dbInv.type });
          }
          continue;
        }

        // Query Acumatica for the current state of this invoice (it should now be Open/Closed)
        const filter = encodeURIComponent(
          `ReferenceNbr eq '${dbInv.reference_number}' and Type eq '${dbInv.type}'`
        );
        const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${filter}&$select=ReferenceNbr,Type,Status,Date,Amount,Balance,DueDate,CustomerID,Customer,Description,CurrencyID,LastModifiedDateTime`;

        const response = await sessionManager.makeAuthenticatedRequest(creds, url, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          // If we get 500/404 for a non-balanced invoice, it was likely deleted
          const { error: deleteErr } = await supabase
            .from("acumatica_invoices")
            .delete()
            .eq("id", dbInv.id);

          if (deleteErr) {
            errors.push(`Delete ${dbInv.reference_number}: ${deleteErr.message}`);
          } else {
            deleted++;
            deletedList.push({ ref: dbInv.reference_number, type: dbInv.type });
          }
          continue;
        }

        const data = await response.json();
        const results = Array.isArray(data) ? data : [];

        if (results.length === 0) {
          // Deleted from Acumatica
          const { error: deleteErr } = await supabase
            .from("acumatica_invoices")
            .delete()
            .eq("id", dbInv.id);

          if (deleteErr) {
            errors.push(`Delete ${dbInv.reference_number}: ${deleteErr.message}`);
          } else {
            deleted++;
            deletedList.push({ ref: dbInv.reference_number, type: dbInv.type });
          }
        } else {
          // Invoice exists with a new status -- update our record
          const acuInv = results[0];
          const newStatus = acuInv.Status?.value || "Open";

          const updateData: Record<string, any> = {
            status: newStatus,
            date: acuInv.Date?.value || null,
            amount: acuInv.Amount?.value || 0,
            balance: acuInv.Balance?.value || 0,
            due_date: acuInv.DueDate?.value || null,
            customer: acuInv.CustomerID?.value || null,
            customer_name: acuInv.Customer?.value || null,
            description: acuInv.Description?.value || null,
            currency: acuInv.CurrencyID?.value || null,
            last_modified_datetime: acuInv.LastModifiedDateTime?.value || null,
            last_sync_timestamp: new Date().toISOString(),
          };

          const { error: updateErr } = await supabase
            .from("acumatica_invoices")
            .update(updateData)
            .eq("id", dbInv.id);

          if (updateErr) {
            errors.push(`Update ${dbInv.reference_number}: ${updateErr.message}`);
          } else {
            updated++;
            updatedList.push({ ref: dbInv.reference_number, type: dbInv.type, newStatus });
          }
        }
      } catch (err: any) {
        errors.push(`Error ${dbInv.reference_number}: ${err.message}`);
      }

      // Update progress every 25 invoices
      if (processed % 25 === 0 || processed === noLongerBalanced.length) {
        await supabase.from("async_sync_jobs").update({
          progress: {
            phase: "Reconciling",
            dbCount: dbBalanced.length,
            acumaticaCount: acumaticaBalancedSet.size,
            toReconcile: noLongerBalanced.length,
            processed,
            updated,
            deleted,
            updatedList: updatedList.slice(0, 200),
            deletedList: deletedList.slice(0, 200),
            errors: errors.slice(0, 20),
          },
        }).eq("id", jobId);
      }
    }

    // Refresh materialized view after changes
    if (updated > 0 || deleted > 0) {
      try {
        await supabase.rpc("refresh_invoice_month_summary");
      } catch (refreshErr: any) {
        console.warn("[reconcile] Matview refresh failed:", refreshErr.message);
      }
    }

    await supabase.from("async_sync_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      progress: {
        phase: "Complete",
        dbCount: dbBalanced.length,
        acumaticaCount: acumaticaBalancedSet.size,
        toReconcile: noLongerBalanced.length,
        processed,
        updated,
        deleted,
        still_balanced: dbBalanced.length - noLongerBalanced.length,
        updatedList: updatedList.slice(0, 200),
        deletedList: deletedList.slice(0, 200),
        errors: errors.slice(0, 20),
      },
    }).eq("id", jobId);

    console.log(`[reconcile] Done: checked=${dbBalanced.length}, reconciled=${noLongerBalanced.length}, updated=${updated}, deleted=${deleted}, errors=${errors.length}`);
  } catch (error: any) {
    console.error(`[reconcile] Job ${jobId} failed:`, error.message);
    await supabase.from("async_sync_jobs").update({
      status: "failed",
      error_message: error.message,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create async job
    const now = new Date().toISOString();
    const { data: job, error: jobError } = await supabase
      .from("async_sync_jobs")
      .insert({
        entity_type: "reconcile-balanced",
        status: "pending",
        start_date: now,
        end_date: now,
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run in background
    EdgeRuntime.waitUntil(reconcile(supabase, job.id));

    return new Response(
      JSON.stringify({ success: true, async: true, jobId: job.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[reconcile] Fatal error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
