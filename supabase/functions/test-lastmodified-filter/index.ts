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

    const { referenceNumber, filterDateTime } = await req.json();

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

    let acumaticaUrl = credentials.acumatica_url;
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
        JSON.stringify({ error: 'Auth failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    const cookies = setCookieHeader!.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const paddedRef = referenceNumber.padStart(6, '0').replace(/^0+/, '');

    const byRefUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${paddedRef}'`;
    const byRefResponse = await fetch(byRefUrl, {
      headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
    });
    const byRefData = await byRefResponse.json();

    const byDateUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${paddedRef}' and LastModifiedDateTime gt datetimeoffset'${filterDateTime}'`;
    const byDateResponse = await fetch(byDateUrl, {
      headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
    });
    const byDateData = await byDateResponse.json();

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        referenceNumber,
        queryByReference: byRefData,
        queryByDateFilter: byDateData,
        bothReturnedSameCount: byRefData.length === byDateData.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});