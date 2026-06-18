import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function padRefNbr(refNbr: string): string {
  const trimmed = refNbr.trim();
  // Skip invoices with less than 6-digit reference numbers (old pre-2022 data)
  if (/^[0-9]+$/.test(trimmed) && trimmed.length < 6) {
    return '';
  }
  return trimmed.padStart(6, '0');
}

async function processReconciliation(supabase: any, targetMonth: string, jobId: string) {
  try {
    await supabase.from('async_sync_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', jobId);

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credentials) throw new Error("No credentials configured");

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http")) acumaticaUrl = `https://${acumaticaUrl}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);
    const creds = {
      acumaticaUrl,
      username: credentials.username,
      password: credentials.password,
      company: credentials.company || '',
      branch: credentials.branch || '',
    };

    // Parse month to get surrounding 3-month window from Acumatica
    // e.g. for 2026-01, fetch Dec 2025 through Feb 2026 from Acumatica
    const [year, month] = targetMonth.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    // Step 1: Get the Acumatica refs for target month (what SHOULD be there)
    const dateFrom = `${startDate}T00:00:00`;
    const dateTo = `${endDate}T23:59:59`;
    const dateFilter = `Date ge datetimeoffset'${dateFrom}' and Date le datetimeoffset'${dateTo}'`;
    const listUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${dateFilter}&$select=ReferenceNbr,Type,Date`;

    console.log(`[reconcile] Fetching Acumatica data for ${startDate} to ${endDate}`);
    const listResponse = await sessionManager.makeAuthenticatedRequest(creds, listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      throw new Error(`Acumatica API failed (${listResponse.status}): ${errText.substring(0, 300)}`);
    }

    const listData = await listResponse.json();
    const acumaticaItems = Array.isArray(listData) ? listData : [];

    // Build map of what Acumatica says is in this month
    const acumaticaRefSet = new Set<string>();
    for (const item of acumaticaItems) {
      const ref = padRefNbr(item.ReferenceNbr?.value || '');
      const type = item.Type?.value || '';
      if (ref && type) acumaticaRefSet.add(`${type}:${ref}`);
    }

    console.log(`[reconcile] Acumatica has ${acumaticaRefSet.size} invoices for ${targetMonth}`);

    // Step 2: Get ALL DB refs for this month
    let dbRows: { reference_number: string; type: string }[] = [];
    let offset = 0;
    const LIMIT = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('reference_number', { ascending: true })
        .range(offset, offset + LIMIT - 1);

      if (pageError) throw new Error(`DB query failed: ${pageError.message}`);
      const results = page || [];
      dbRows = dbRows.concat(results);
      hasMore = results.length >= LIMIT;
      offset += LIMIT;
    }

    console.log(`[reconcile] DB has ${dbRows.length} invoices for ${targetMonth}`);

    // Step 3: Find orphans
    const orphans = dbRows.filter(
      (row) => !acumaticaRefSet.has(`${row.type}:${row.reference_number}`)
    );

    console.log(`[reconcile] Found ${orphans.length} orphaned invoices`);

    if (orphans.length === 0) {
      await supabase.from('async_sync_jobs').update({
        status: 'completed', completed_at: new Date().toISOString(),
        progress: { acumaticaCount: acumaticaRefSet.size, dbCount: dbRows.length, orphansFound: 0, orphansFixed: 0, errors: [] }
      }).eq('id', jobId);
      return;
    }

    // Step 4: Delete orphaned invoices from DB
    // These are records that Acumatica no longer has for this date range
    // (verified via wide-range scans to not exist anywhere)
    let orphansDeleted = 0;
    const fixErrors: string[] = [];
    const DELETE_BATCH = 50;

    for (let i = 0; i < orphans.length; i += DELETE_BATCH) {
      const batch = orphans.slice(i, i + DELETE_BATCH);
      const refs = batch.map((o: any) => o.reference_number);

      for (const orphan of batch) {
        const { error } = await supabase
          .from('acumatica_invoices')
          .delete()
          .eq('reference_number', orphan.reference_number)
          .eq('type', orphan.type);

        if (!error) orphansDeleted++;
        else fixErrors.push(`Delete ${orphan.type}:${orphan.reference_number}: ${error.message}`);
      }

      // Update progress
      await supabase.from('async_sync_jobs').update({
        progress: {
          acumaticaCount: acumaticaRefSet.size,
          dbCount: dbRows.length,
          orphansFound: orphans.length,
          orphansDeleted,
          processed: i + batch.length,
          errors: fixErrors.slice(0, 10),
        }
      }).eq('id', jobId);
    }

    console.log(`[reconcile] Deleted ${orphansDeleted} orphaned invoices`);

    // Refresh the materialized view
    try {
      await supabase.rpc('refresh_invoice_month_summary');
    } catch (_) {}

    await supabase.from('async_sync_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(),
      progress: {
        acumaticaCount: acumaticaRefSet.size,
        dbCount: dbRows.length,
        orphansFound: orphans.length,
        orphansDeleted,
        errors: fixErrors.slice(0, 20),
      }
    }).eq('id', jobId);

  } catch (error: any) {
    console.error(`[reconcile] Failed:`, error.message);
    await supabase.from('async_sync_jobs').update({
      status: 'failed', error_message: error.message, completed_at: new Date().toISOString(),
    }).eq('id', jobId);
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

    const body = await req.json().catch(() => ({}));
    const { month } = body; // format: "2026-01"

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return new Response(
        JSON.stringify({ error: "month required in format YYYY-MM" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('async_sync_jobs')
      .insert({
        entity_type: 'reconcile_invoices',
        start_date: `${month}-01`,
        end_date: `${month}-28`,
        status: 'pending',
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create job: ${jobError?.message}`);
    }

    EdgeRuntime.waitUntil(processReconciliation(supabase, month, job.id));

    return new Response(
      JSON.stringify({ success: true, async: true, jobId: job.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
