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
    const {
      status,
      type,
      dateFrom,
      dateTo,
      customerId
    } = requestBody;

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

    const filters: string[] = [];

    if (status) {
      filters.push(`Status eq '${status}'`);
    }

    if (type) {
      filters.push(`Type eq '${type}'`);
    } else {
      filters.push(`Type ne 'Credit Memo'`);
    }

    if (dateFrom) {
      filters.push(`ApplicationDate ge datetime'${dateFrom}'`);
    }

    if (dateTo) {
      filters.push(`ApplicationDate le datetime'${dateTo}'`);
    }

    if (customerId) {
      filters.push(`CustomerID eq '${customerId}'`);
    }

    const filterString = filters.length > 0 ? `?$filter=${filters.join(' and ')}` : '';
    const countUrl = `${acumaticaUrl}/odata/Company/Payment/$count${filterString}`;

    console.log(`Fetching payment count from: ${countUrl}`);

    const countResponse = await sessionManager.makeAuthenticatedRequest(
      credentials,
      countUrl
    );

    if (!countResponse.ok) {
      const errorText = await countResponse.text();
      throw new Error(`Failed to fetch payment count: ${countResponse.status} - ${errorText}`);
    }

    const countText = await countResponse.text();
    const count = parseInt(countText, 10);

    console.log(`Payment count result: ${count}`);

    return new Response(
      JSON.stringify({
        success: true,
        count,
        filters: {
          status,
          type,
          dateFrom,
          dateTo,
          customerId
        }
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
