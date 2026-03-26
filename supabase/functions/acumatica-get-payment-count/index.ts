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
    const { status, type, dateFrom, dateTo, customerId } = requestBody;

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

    const nonCmFilters: string[] = [];
    if (status) nonCmFilters.push(`Status eq '${status}'`);
    if (type && type !== 'Credit Memo') nonCmFilters.push(`Type eq '${type}'`);
    if (!type) nonCmFilters.push(`Type ne 'Credit Memo'`);
    if (dateFrom) nonCmFilters.push(`ApplicationDate ge datetimeoffset'${dateFrom}'`);
    if (dateTo) nonCmFilters.push(`ApplicationDate le datetimeoffset'${dateTo}'`);
    if (customerId) nonCmFilters.push(`CustomerID eq '${customerId}'`);

    if (type !== 'Credit Memo') {
      const filterParam = nonCmFilters.length > 0 ? `$filter=${nonCmFilters.join(' and ')}` : '';
      const restUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?${filterParam}&$select=ReferenceNbr,Type`;

      console.log(`Fetching non-CM payment count: ${restUrl}`);

      const response = await sessionManager.makeAuthenticatedRequest(credentials, restUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch payments: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : [];
      for (const item of items) {
        const t = item.Type?.value || 'Unknown';
        byType[t] = (byType[t] || 0) + 1;
        totalCount++;
      }
    }

    if (!type || type === 'Credit Memo') {
      const cmFilters: string[] = [`Type eq 'Credit Memo'`];
      if (status) cmFilters.push(`Status eq '${status}'`);
      if (customerId) cmFilters.push(`CustomerID eq '${customerId}'`);

      const cmFilterParam = `$filter=${cmFilters.join(' and ')}`;
      const cmUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?${cmFilterParam}&$select=ReferenceNbr,Type&$custom=Document.DocDate`;

      console.log(`Fetching Credit Memo count via Payment endpoint with DocDate: ${cmUrl}`);

      const cmResponse = await sessionManager.makeAuthenticatedRequest(credentials, cmUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (cmResponse.ok) {
        const cmData = await cmResponse.json();
        const cmItems = Array.isArray(cmData) ? cmData : [];

        const dateFromStr = dateFrom ? dateFrom.split('T')[0] : null;
        const dateToStr = dateTo ? dateTo.split('T')[0] : null;

        let cmCount = 0;
        for (const item of cmItems) {
          const docDate = item.custom?.Document?.DocDate?.value;
          if (!docDate) continue;
          const docDateStr = docDate.split('T')[0];
          if (dateFromStr && docDateStr < dateFromStr) continue;
          if (dateToStr && docDateStr > dateToStr) continue;
          cmCount++;
        }

        byType['Credit Memo'] = cmCount;
        totalCount += cmCount;
        console.log(`Credit Memo count (by DocDate): ${cmCount} out of ${cmItems.length} total CMs`);
      } else {
        const errorText = await cmResponse.text();
        console.error(`Failed to fetch credit memos from Payment endpoint: ${cmResponse.status} - ${errorText.substring(0, 200)}`);
        byType['Credit Memo'] = 0;
      }
    }

    console.log(`Payment count result: ${totalCount}, byType:`, byType);

    return new Response(
      JSON.stringify({
        success: true,
        count: totalCount,
        byType,
        filters: { status, type, dateFrom, dateTo, customerId }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error('Error fetching payment count:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
