import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function processBackfill(
  supabase: any,
  sessionManager: AcumaticaSessionManager,
  jobId: string,
  startDate: string,
  endDate: string
) {
  await supabase
    .from("async_sync_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: credentials } = await supabase
    .from("acumatica_sync_credentials")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!credentials) throw new Error("No Acumatica credentials found");

  let acumaticaUrl = credentials.acumatica_url;
  if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
    acumaticaUrl = `https://${acumaticaUrl}`;
  }

  const credentialsObj = {
    acumaticaUrl,
    username: credentials.username,
    password: credentials.password,
    company: credentials.company,
    branch: credentials.branch,
  };

  await sessionManager.getSession(credentialsObj);

  const { count: totalMissing } = await supabase
    .from("acumatica_payments")
    .select("*", { count: "exact", head: true })
    .is("doc_date", null)
    .gte("application_date", `${startDate}T00:00:00`)
    .lte("application_date", `${endDate}T23:59:59`);

  console.log(`[backfill-doc-dates] Total missing doc_date in range: ${totalMissing}`);

  let updated = 0;
  let failed = 0;
  let processed = 0;
  const errors: string[] = [];
  const BATCH_SIZE = 200;

  while (true) {
    const { data: job } = await supabase
      .from("async_sync_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();

    if (job?.status === "failed") {
      console.log("[backfill-doc-dates] Job was cancelled");
      return;
    }

    const { data: batch, error: fetchErr } = await supabase
      .from("acumatica_payments")
      .select("reference_number, type")
      .is("doc_date", null)
      .gte("application_date", `${startDate}T00:00:00`)
      .lte("application_date", `${endDate}T23:59:59`)
      .limit(BATCH_SIZE);

    if (fetchErr) {
      errors.push(`DB fetch error: ${fetchErr.message}`);
      break;
    }

    if (!batch || batch.length === 0) {
      console.log("[backfill-doc-dates] No more payments to process");
      break;
    }

    console.log(`[backfill-doc-dates] Processing batch of ${batch.length} (${processed}/${totalMissing} done)`);

    const CONCURRENCY = 10;
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        chunk.map(async (payment) => {
          const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment.type)}/${encodeURIComponent(payment.reference_number)}?$custom=Document.DocDate,Document.FinPeriodID`;

          const response = await sessionManager.makeAuthenticatedRequest(credentialsObj, url);

          if (!response.ok) {
            if (response.status === 404 || response.status === 500) {
              await supabase
                .from("acumatica_payments")
                .update({ doc_date: "1900-01-01" })
                .eq("reference_number", payment.reference_number)
                .eq("type", payment.type);
            } else {
              errors.push(`${payment.type} ${payment.reference_number}: HTTP ${response.status}`);
            }
            return { status: "failed" as const };
          }

          const data = await response.json();
          const docDate = data?.custom?.Document?.DocDate?.value || null;
          const finPeriod = data?.custom?.Document?.FinPeriodID?.value || null;

          if (docDate || finPeriod) {
            const updateData: Record<string, any> = {};
            if (docDate) updateData.doc_date = docDate;
            if (finPeriod) updateData.financial_period = finPeriod;

            const { error: updateErr } = await supabase
              .from("acumatica_payments")
              .update(updateData)
              .eq("reference_number", payment.reference_number)
              .eq("type", payment.type);

            if (updateErr) {
              errors.push(`${payment.reference_number}: DB update failed`);
              return { status: "failed" as const };
            }
            return { status: "updated" as const };
          } else {
            await supabase
              .from("acumatica_payments")
              .update({ doc_date: "1900-01-01" })
              .eq("reference_number", payment.reference_number)
              .eq("type", payment.type);
            return { status: "failed" as const };
          }
        })
      );

      for (const result of results) {
        processed++;
        if (result.status === "fulfilled" && result.value.status === "updated") {
          updated++;
        } else if (result.status === "rejected") {
          errors.push(result.reason?.message || "Unknown error");
          failed++;
        } else {
          failed++;
        }
      }
    }

    await supabase.from("async_sync_jobs").update({
      progress: {
        updated,
        failed,
        processed,
        total: totalMissing,
        errors: errors.slice(-10),
      },
    }).eq("id", jobId);
  }

  await supabase.from("async_sync_jobs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    progress: {
      updated,
      failed,
      processed,
      total: totalMissing,
      errors: errors.slice(-10),
    },
  }).eq("id", jobId);

  console.log(`[backfill-doc-dates] Complete: ${updated} updated, ${failed} failed out of ${processed} processed`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, jobId: existingJobId, pollStatus } = body;

    if (pollStatus && existingJobId) {
      const { data: job } = await supabase
        .from("async_sync_jobs")
        .select("id, status, progress, error_message, completed_at")
        .eq("id", existingJobId)
        .maybeSingle();

      return new Response(
        JSON.stringify({ success: true, job }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resolvedStart = startDate || "2025-01-01";
    const resolvedEnd = endDate || "2025-12-31";

    const { count: totalMissing } = await supabase
      .from("acumatica_payments")
      .select("*", { count: "exact", head: true })
      .is("doc_date", null)
      .gte("application_date", `${resolvedStart}T00:00:00`)
      .lte("application_date", `${resolvedEnd}T23:59:59`);

    if (totalMissing === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "All payments already have doc_date", totalMissing: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingRunning } = await supabase
      .from("async_sync_jobs")
      .select("id")
      .eq("entity_type", "backfill-doc-dates")
      .in("status", ["running", "pending"]);

    if (existingRunning && existingRunning.length > 0) {
      for (const old of existingRunning) {
        await supabase.from("async_sync_jobs").update({
          status: "failed",
          error_message: "Replaced by new backfill request",
          completed_at: new Date().toISOString(),
        }).eq("id", old.id);
      }
    }

    const { data: job, error: jobError } = await supabase
      .from("async_sync_jobs")
      .insert({
        entity_type: "backfill-doc-dates",
        start_date: resolvedStart,
        end_date: resolvedEnd,
        status: "pending",
        progress: { total: totalMissing, processed: 0, updated: 0, failed: 0, errors: [] },
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Failed to create backfill job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const backgroundTask = (async () => {
      try {
        await processBackfill(supabase, sessionManager, job.id, resolvedStart, resolvedEnd);
      } catch (error: any) {
        console.error("[backfill-doc-dates] Background task failed:", error.message);
        await supabase.from("async_sync_jobs").update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);
      }
    })();

    EdgeRuntime.waitUntil(backgroundTask);

    return new Response(
      JSON.stringify({ success: true, jobId: job.id, totalMissing, async: true }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[backfill-doc-dates] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
