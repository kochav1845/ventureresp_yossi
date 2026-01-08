import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

    const { limit = 50, status = 'Open' } = await req.json();

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('acumatica_url, username, password, company, branch')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!credentials) {
      return new Response(
        JSON.stringify({ error: 'No credentials found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const acumaticaUrl = credentials.acumatica_url;
    const loginBody: any = { name: credentials.username, password: credentials.password };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Auth failed', status: loginResponse.status }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    const cookies = setCookieHeader!.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=Status eq '${status}'&$top=${limit}&$orderby=Date desc&$select=ReferenceNbr,Date,Status,Amount,Balance,Customer`;

    console.log('Fetching invoices with filter:', url);

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
    });

    let data;
    const responseText = await response.text();
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = { error: 'Failed to parse response', responseText, status: response.status };
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    const result = {
      filterUsed: { status, limit },
      credentialsUsed: {
        company: credentials.company || 'default',
        branch: credentials.branch || 'default',
        url: acumaticaUrl
      },
      foundCount: Array.isArray(data) ? data.length : 0,
      invoices: Array.isArray(data) ? data.map((inv: any) => ({
        referenceNbr: inv.ReferenceNbr?.value,
        date: inv.Date?.value,
        status: inv.Status?.value,
        amount: inv.Amount?.value,
        balance: inv.Balance?.value,
        customer: inv.Customer?.value
      })) : [],
      rawError: !Array.isArray(data) ? data : undefined
    };

    return new Response(
      JSON.stringify(result, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});