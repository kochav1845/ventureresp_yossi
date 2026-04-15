import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchBulkDocDates(
  sessionManager: AcumaticaSessionManager,
  credentialsObj: any,
  acumaticaUrl: string,
  payments: { type: string; reference_number: string }[],
  attempt = 0
): Promise<{ results: any[]; failed: string[] }> {
  const MAX_RETRIES = 3;
  const failed: string[] = [];

  const grouped: Record<string, { type: string; reference_number: string }[]> = {};
  for (const p of payments) {
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type].push(p);
  }

  const allResults: any[] = [];

  for (const [paymentType, typePayments] of Object.entries(grouped)) {
    const refFilters = typePayments
      .map((p) => `ReferenceNbr eq '${p.reference_number}'`)
      .join(" or ");

    const filter = `Type eq '${paymentType}' and (${refFilters})`;
    const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=${encodeURIComponent(filter)}&$select=Type,ReferenceNbr&$custom=Document.DocDate,Document.FinPeriodID&$top=${typePayments.length}`;

    const response = await sessionManager.makeAuthenticatedRequest(credentialsObj, url);

    if (response.status === 429) {
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[backfill-doc-dates] 429 on bulk fetch, retry ${attempt + 1} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        return fetchBulkDocDates(sessionManager, credentialsObj, acumaticaUrl, payments, attempt + 1);
      }
      for (const p of typePayments) failed.push(`${p.type} ${p.reference_number}: 429 after retries`);
      continue;
    }

    if (!response.ok) {
      const status = response.status;
      for (const p of typePayments) failed.push(`${p.type} ${p.reference_number}: HTTP ${status}`);
      continue;
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      allResults.push(...data);
    }
  }

  return { results: allResults, failed };
}

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
  const DB_BATCH_SIZE = 200;
  const API_CHUNK_SIZE = 25;
  const API_CONCURRENCY = 3;

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
      .limit(DB_BATCH_SIZE);

    if (fetchErr) {
      errors.push(`DB fetch error: ${fetchErr.message}`);
      break;
    }

    if (!batch || batch.length === 0) {
      console.log("[backfill-doc-dates] No more payments to process");
      break;
    }

    console.log(`[backfill-doc-dates] Processing batch of ${batch.length} (${processed}/${totalMissing} done)`);

    const batchLookup = new Map<string, { type: string; reference_number: string }>();
    for (const p of batch) {
      batchLookup.set(`${p.type}|${p.reference_number}`, p);
    }

    const apiChunks: { type: string; reference_number: string }[][] = [];
    for (let i = 0; i < batch.length; i += API_CHUNK_SIZE) {
      apiChunks.push(batch.slice(i, i + API_CHUNK_SIZE));
    }

    const matchedRefs = new Set<string>();

    for (let i = 0; i < apiChunks.length; i += API_CONCURRENCY) {
      const concurrentChunks = apiChunks.slice(i, i + API_CONCURRENCY);

      const chunkResults = await Promise.allSettled(
        concurrentChunks.map((chunk) =>
          fetchBulkDocDates(sessionManager, credentialsObj, acumaticaUrl, chunk)
        )
      );

      for (const result of chunkResults) {
        if (result.status === "rejected") {
          errors.push(result.reason?.message || "Bulk fetch failed");
          continue;
        }

        const { results, failed: chunkFailed } = result.value;
        for (const errMsg of chunkFailed) {
          errors.push(errMsg);
        }

        for (const item of results) {
          const refNbr = item.ReferenceNbr?.value;
          const type = item.Type?.value;
          if (!refNbr || !type) continue;

          matchedRefs.add(`${type}|${refNbr}`);

          const docDate = item?.custom?.Document?.DocDate?.value || null;
          const finPeriod = item?.custom?.Document?.FinPeriodID?.value || null;

          if (docDate || finPeriod) {
            const updateData: Record<string, any> = {};
            if (docDate) updateData.doc_date = docDate;
            if (finPeriod) updateData.financial_period = finPeriod;

            const { error: updateErr } = await supabase
              .from("acumatica_payments")
              .update(updateData)
              .eq("reference_number", refNbr)
              .eq("type", type);

            if (updateErr) {
              errors.push(`${refNbr}: DB update failed`);
              failed++;
            } else {
              updated++;
            }
          } else {
            await supabase
              .from("acumatica_payments")
              .update({ doc_date: "1900-01-01" })
              .eq("reference_number", refNbr)
              .eq("type", type);
            failed++;
          }
          processed++;
        }
      }

      if (i + API_CONCURRENCY < apiChunks.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    for (const [key, payment] of batchLookup.entries()) {
      if (!matchedRefs.has(key)) {
        await supabase
          .from("acumatica_payments")
          .update({ doc_date: "1900-01-01" })
          .eq("reference_number", payment.reference_number)
          .eq("type", payment.type);
        failed++;
        processed++;
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
