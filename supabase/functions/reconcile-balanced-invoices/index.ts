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

    // Step 3: Identify invoices in our DB that are NO LONGER balanced in Acumatica
    const noLongerBalanced = dbBalanced.filter(
      (inv) => !acumaticaBalancedSet.has(`${inv.type}:${inv.reference_number}`)
    );

    console.log(`[reconcile] ${noLongerBalanced.length} invoices are no longer balanced in Acumatica`);

    await supabase.from("async_sync_jobs").update({
      progress: {
        phase: "Updating stale balanced invoices",
        dbCount: dbBalanced.length,
        acumaticaCount: acumaticaBalancedSet.size,
        toReconcile: noLongerBalanced.length,
        processed: 0,
        updated: 0,
        deleted: 0,
      },
    }).eq("id", jobId);

    // Step 4: Update stale balanced invoices directly to "Closed"
    // Since querying Acumatica by ReferenceNbr fails with 500 errors,
    // we update directly based on the authoritative balanced list.
    // The normal incremental sync will correct any status mismatches later.
    let updated = 0;
    let deleted = 0;
    let processed = 0;
    const updatedList: { ref: string; type: string; newStatus: string }[] = [];
    const deletedList: { ref: string; type: string }[] = [];
    const errors: string[] = [];

    const BATCH_SIZE = 50;

    for (let i = 0; i < noLongerBalanced.length; i += BATCH_SIZE) {
      const batch = noLongerBalanced.slice(i, i + BATCH_SIZE);

      // Check if any have a non-balanced duplicate in our DB (delete the balanced one)
      const refNumbers = batch.map(b => b.reference_number);
      const { data: existingNonBalanced } = await supabase
        .from("acumatica_invoices")
        .select("reference_number, type, status")
        .in("reference_number", refNumbers)
        .neq("status", "Balanced");

      const existingMap = new Map<string, string>();
      if (existingNonBalanced) {
        for (const e of existingNonBalanced) {
          existingMap.set(`${e.type}:${e.reference_number}`, e.status);
        }
      }

      for (const dbInv of batch) {
        processed++;
        const key = `${dbInv.type}:${dbInv.reference_number}`;

        if (existingMap.has(key)) {
          // We already have a non-balanced version - delete this balanced duplicate
          const { error: deleteErr } = await supabase
            .from("acumatica_invoices")
            .delete()
            .eq("id", dbInv.id);

          if (!deleteErr) {
            deleted++;
            deletedList.push({ ref: dbInv.reference_number, type: dbInv.type });
          } else {
            errors.push(`Delete dup ${dbInv.reference_number}: ${deleteErr.message}`);
          }
        } else {
          // Update status to Closed (most likely outcome for no-longer-balanced invoices)
          const { error: updateErr } = await supabase
            .from("acumatica_invoices")
            .update({
              status: "Closed",
              balance: 0,
              last_sync_timestamp: new Date().toISOString(),
            })
            .eq("id", dbInv.id);

          if (!updateErr) {
            updated++;
            updatedList.push({ ref: dbInv.reference_number, type: dbInv.type, newStatus: "Closed" });
          } else {
            errors.push(`Update ${dbInv.reference_number}: ${updateErr.message}`);
          }
        }
      }

      // Update progress after each batch
      await supabase.from("async_sync_jobs").update({
        progress: {
          phase: "Updating stale balanced invoices",
          dbCount: dbBalanced.length,
          acumaticaCount: acumaticaBalancedSet.size,
          toReconcile: noLongerBalanced.length,
          processed,
          updated,
          deleted,
          updatedList: updatedList.slice(-100),
          deletedList: deletedList.slice(-100),
          errors: errors.slice(-20),
        },
      }).eq("id", jobId);
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
        updatedList: updatedList.slice(-200),
        deletedList: deletedList.slice(-200),
        errors: errors.slice(-20),
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
