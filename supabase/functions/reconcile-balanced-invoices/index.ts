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

async function reconcile(supabase: any) {
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
  const allBalanced: { id: string; reference_number: string; type: string }[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;

  while (true) {
    const { data: page, error: dbErr } = await supabase
      .from("acumatica_invoices")
      .select("id, reference_number, type")
      .eq("status", "Balanced")
      .range(offset, offset + PAGE_SIZE - 1);

    if (dbErr) throw new Error(`DB query failed: ${dbErr.message}`);
    if (page) allBalanced.push(...page);
    if (!page || page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[reconcile] Found ${allBalanced.length} balanced invoices to check`);

  if (allBalanced.length === 0) {
    return { checked: 0, updated: 0, deleted: 0, errors: [] };
  }

  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];
  const BATCH_SIZE = 50;

  for (let batchStart = 0; batchStart < allBalanced.length; batchStart += BATCH_SIZE) {
    const batch = allBalanced.slice(batchStart, batchStart + BATCH_SIZE);

    // Build OR filter for this batch
    const refFilters = batch.map((inv) => {
      return `(ReferenceNbr eq '${inv.reference_number}' and Type eq '${inv.type}')`;
    });

    const batchFilter = refFilters.join(" or ");
    const batchUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${batchFilter}&$select=ReferenceNbr,Type,Status,Date,Amount,Balance,DueDate,CustomerID,Customer,Description,CurrencyID,LastModifiedDateTime`;

    console.log(`[reconcile] Checking batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(allBalanced.length / BATCH_SIZE)} (${batch.length} invoices)`);

    try {
      const response = await sessionManager.makeAuthenticatedRequest(creds, batchUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        errors.push(`Batch fetch failed (${response.status}): ${errorText.substring(0, 200)}`);
        continue;
      }

      const acumaticaData = await response.json();
      const acumaticaInvoices = Array.isArray(acumaticaData) ? acumaticaData : [];

      // Build a map of what Acumatica returned
      const acumaticaMap = new Map<string, any>();
      for (const inv of acumaticaInvoices) {
        const refNbr = padRefNbr(inv.ReferenceNbr?.value || "");
        const type = inv.Type?.value || "";
        if (refNbr && type) {
          acumaticaMap.set(`${type}:${refNbr}`, inv);
        }
      }

      // Process each balanced invoice in this batch
      for (const dbInv of batch) {
        const key = `${dbInv.type}:${dbInv.reference_number}`;
        const acuInv = acumaticaMap.get(key);

        if (acuInv) {
          const newStatus = acuInv.Status?.value || "Balanced";

          if (newStatus !== "Balanced") {
            // Status changed in Acumatica -- update our record
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
              console.log(`[reconcile] Updated ${dbInv.reference_number} from Balanced to ${newStatus}`);
            }
          }
          // If still Balanced in Acumatica, leave it as-is
        } else {
          // Invoice not found in Acumatica -- delete from our DB
          const { error: deleteErr } = await supabase
            .from("acumatica_invoices")
            .delete()
            .eq("id", dbInv.id);

          if (deleteErr) {
            errors.push(`Delete ${dbInv.reference_number}: ${deleteErr.message}`);
          } else {
            deleted++;
            console.log(`[reconcile] Deleted ${dbInv.reference_number} (no longer in Acumatica)`);
          }
        }
      }
    } catch (batchErr: any) {
      errors.push(`Batch error: ${batchErr.message}`);
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

  const result = {
    checked: allBalanced.length,
    updated,
    deleted,
    still_balanced: allBalanced.length - updated - deleted - errors.length,
    errors: errors.slice(0, 20),
  };

  console.log(`[reconcile] Done: checked=${result.checked}, updated=${result.updated}, deleted=${result.deleted}, errors=${errors.length}`);
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const result = await reconcile(supabase);

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[reconcile] Fatal error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
