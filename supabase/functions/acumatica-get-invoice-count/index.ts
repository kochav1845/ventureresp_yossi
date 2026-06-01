import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestBody = await req.json().catch(() => ({}));
    const { dateFrom, dateTo } = requestBody;

    const { data: config } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!config || !config.acumatica_url || !config.username || !config.password) {
      return new Response(
        JSON.stringify({ error: "Acumatica credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const acumaticaUrl = config.acumatica_url.startsWith('http')
      ? config.acumatica_url
      : `https://${config.acumatica_url}`;

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || '',
      branch: config.branch || ''
    };

    const byType: Record<string, number> = {};
    let totalCount = 0;

    const filters: string[] = [];
    if (dateFrom) filters.push(`Date ge datetimeoffset'${dateFrom}'`);
    if (dateTo) filters.push(`Date le datetimeoffset'${dateTo}'`);

    const filterParam = filters.length > 0 ? `$filter=${filters.join(' and ')}` : '';
    const restUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?${filterParam}&$select=ReferenceNbr,Type`;

    console.log(`Fetching invoice count: ${restUrl}`);

    const response = await sessionManager.makeAuthenticatedRequest(credentials, restUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch invoices: ${response.status} - ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];

    const refs: { ref: string; type: string }[] = [];
    for (const item of items) {
      const t = item.Type?.value || 'Unknown';
      const refNbr = (item.ReferenceNbr?.value || '').trim();
      const paddedRef = refNbr.padStart(6, '0');
      byType[t] = (byType[t] || 0) + 1;
      totalCount++;
      refs.push({ ref: paddedRef, type: t });
    }

    // Check which refs actually exist in the DB (regardless of date)
    let dbExistsCount = 0;
    const dbByType: Record<string, number> = {};
    const missingRefs: { ref: string; type: string }[] = [];
    const BATCH_SIZE = 300;

    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
      const batch = refs.slice(i, i + BATCH_SIZE);
      const batchRefs = batch.map(r => r.ref);
      const { data: found } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type')
        .in('reference_number', batchRefs);

      const foundSet = new Set((found || []).map(f => `${f.type}:${f.reference_number}`));
      for (const r of batch) {
        const key = `${r.type}:${r.ref}`;
        if (foundSet.has(key)) {
          dbExistsCount++;
          dbByType[r.type] = (dbByType[r.type] || 0) + 1;
        } else {
          missingRefs.push(r);
        }
      }
    }

    const missingByType: Record<string, number> = {};
    for (const m of missingRefs) {
      missingByType[m.type] = (missingByType[m.type] || 0) + 1;
    }

    // Also check for extras in DB that Acumatica doesn't report for this date range
    let dbTotalForRange = 0;
    const dbTotalByType: Record<string, number> = {};
    if (dateFrom && dateTo) {
      const startDate = dateFrom.split('T')[0];
      const endDate = dateTo.split('T')[0];
      const { count: rangeCount } = await supabase
        .from('acumatica_invoices')
        .select('*', { count: 'exact', head: true })
        .gte('date', startDate)
        .lte('date', endDate);

      dbTotalForRange = rangeCount || 0;

      const { data: typeCounts } = await supabase
        .rpc('execute_readonly_sql', { sql_query: `SELECT type, COUNT(*)::int as cnt FROM acumatica_invoices WHERE date >= '${startDate}' AND date <= '${endDate}' GROUP BY type` });

      if (typeCounts) {
        for (const row of typeCounts) {
          dbTotalByType[row.type] = row.cnt;
        }
      }
    }

    const extrasInDb = dbTotalForRange - totalCount;

    console.log(`Invoice count: ${totalCount} from Acumatica, ${dbExistsCount} exist in DB, ${missingRefs.length} truly missing, ${extrasInDb > 0 ? extrasInDb : 0} extras in DB`);

    return new Response(
      JSON.stringify({
        success: true,
        count: totalCount,
        byType,
        dbExistsCount,
        dbByType,
        dbTotalForRange,
        dbTotalByType,
        extrasInDb: extrasInDb > 0 ? extrasInDb : 0,
        trulyMissing: missingRefs.length,
        missingByType,
        missingRefs: missingRefs.slice(0, 100),
        filters: { dateFrom, dateTo }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error('Error fetching invoice count:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
