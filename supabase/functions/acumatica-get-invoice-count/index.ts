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

    for (const item of items) {
      const t = item.Type?.value || 'Unknown';
      byType[t] = (byType[t] || 0) + 1;
      totalCount++;
    }

    console.log(`Invoice count result: ${totalCount}, byType:`, byType);

    return new Response(
      JSON.stringify({
        success: true,
        count: totalCount,
        byType,
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
