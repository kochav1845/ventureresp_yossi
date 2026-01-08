import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function binarySearchCount(acumaticaUrl: string, cookies: string): Promise<number> {
  let low = 0;
  let high = 100000;
  let lastValidCount = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    const testUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$top=1&$skip=${mid}&$select=ReferenceNbr`;

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
    });

    if (!response.ok) {
      console.log(`Binary search failed at skip=${mid}`);
      high = mid - 1;
      continue;
    }

    const data = await response.json();
    const hasData = Array.isArray(data) && data.length > 0;

    if (hasData) {
      lastValidCount = mid + 1;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return lastValidCount;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error(`No active Acumatica credentials found: ${credsError?.message || 'No credentials in database'}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    const username = credentials.username;
    const password = credentials.password;
    const company = credentials.company || "";
    const branch = credentials.branch || "";

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      throw new Error("Missing Acumatica credentials");
    }

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`Logging into Acumatica at ${acumaticaUrl}...`);

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Acumatica login failed: ${loginResponse.status} - ${errorText}`);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No cookies received from Acumatica');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    console.log('Login successful');

    console.log('Starting binary search for payment count...');
    const acumaticaCount = await binarySearchCount(acumaticaUrl, cookies);
    console.log(`Binary search found approximately ${acumaticaCount} payments`);

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    });

    const { count: databaseCount, error: dbCountError } = await supabase
      .from('acumatica_payments')
      .select('*', { count: 'exact', head: true });

    if (dbCountError) {
      throw new Error(`Failed to get database count: ${dbCountError.message}`);
    }

    console.log(`Acumatica: ${acumaticaCount}, Database: ${databaseCount}`);

    const dbCount = databaseCount || 0;

    return new Response(
      JSON.stringify({
        success: true,
        acumatica_count: acumaticaCount,
        database_count: dbCount,
        difference: acumaticaCount - dbCount,
        sync_percentage: acumaticaCount > 0 ? ((dbCount / acumaticaCount) * 100).toFixed(2) : 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});