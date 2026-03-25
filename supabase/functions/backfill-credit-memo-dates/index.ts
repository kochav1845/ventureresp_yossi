import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: creds } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!creds) {
      return new Response(
        JSON.stringify({ error: "No Acumatica credentials found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);
    const credentials = {
      acumaticaUrl: creds.acumatica_url,
      username: creds.username,
      password: creds.password,
      company: creds.company || "",
      branch: creds.branch || "",
    };

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limit = body.limit || 500;

    const { data: creditMemos, error: fetchError } = await supabase
      .from("acumatica_payments")
      .select("id, reference_number, type, application_date, doc_date")
      .eq("type", "Credit Memo")
      .is("doc_date", null)
      .order("reference_number", { ascending: true })
      .limit(limit);

    if (fetchError) throw new Error(fetchError.message);

    if (!creditMemos || creditMemos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No credit memos need backfill", total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = {
      total: creditMemos.length,
      updated: 0,
      errors: [] as string[],
      samples: [] as { ref: string; oldDate: string; newDocDate: string; period: string }[],
    };

    for (let i = 0; i < creditMemos.length; i++) {
      const cm = creditMemos[i];
      try {
        const url = `${creds.acumatica_url}/entity/Default/24.200.001/Payment/Credit Memo/${encodeURIComponent(cm.reference_number)}?$select=ReferenceNbr&$custom=Document.DocDate,Document.FinPeriodID`;

        const resp = await sessionManager.makeAuthenticatedRequest(credentials, url);

        if (!resp.ok) {
          results.errors.push(`${cm.reference_number}: HTTP ${resp.status}`);
          continue;
        }

        const data = await resp.json();
        const docDate = data.custom?.Document?.DocDate?.value || null;
        const finPeriod = data.custom?.Document?.FinPeriodID?.value || null;

        if (!docDate) {
          results.errors.push(`${cm.reference_number}: No DocDate returned`);
          continue;
        }

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("acumatica_payments")
            .update({ doc_date: docDate, financial_period: finPeriod })
            .eq("id", cm.id);

          if (updateError) {
            results.errors.push(`${cm.reference_number}: Update failed - ${updateError.message}`);
            continue;
          }
        }

        results.updated++;
        if (results.samples.length < 20) {
          results.samples.push({
            ref: cm.reference_number,
            oldDate: cm.application_date,
            newDocDate: docDate,
            period: finPeriod || "",
          });
        }

        if ((i + 1) % 10 === 0) {
          console.log(`[backfill] Processed ${i + 1}/${creditMemos.length}`);
        }
      } catch (err: any) {
        results.errors.push(`${cm.reference_number}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, dryRun, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
