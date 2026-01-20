import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const { paymentRef } = await req.json();

    if (!paymentRef) {
      return new Response(JSON.stringify({ error: 'paymentRef is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get Acumatica credentials
    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError) {
      throw new Error(`Failed to get credentials: ${credError.message}`);
    }

    if (!credentials) {
      throw new Error('No Acumatica credentials found');
    }

    console.log(`Fetching payment ${paymentRef} from Acumatica...`);

    // Login to Acumatica
    const loginResponse = await fetch(`${credentials.acumatica_url}/entity/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: credentials.username,
        password: credentials.password,
        company: credentials.company,
        branch: credentials.branch
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const cookies = loginResponse.headers.get('set-cookie');

    // Fetch the payment
    const paymentResponse = await fetch(
      `${credentials.acumatica_url}/entity/Default/23.200.001/Payment?$filter=ReferenceNbr eq '${paymentRef}'&$expand=ApplicationHistory`,
      {
        headers: {
          'Cookie': cookies || '',
          'Accept': 'application/json'
        }
      }
    );

    if (!paymentResponse.ok) {
      throw new Error(`Failed to fetch payment: ${paymentResponse.status}`);
    }

    const paymentData = await paymentResponse.json();

    // Logout
    await fetch(`${credentials.acumatica_url}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies || '' }
    });

    // Also get our stored data
    const { data: storedPayment } = await supabase
      .from('acumatica_payments')
      .select('*')
      .eq('reference_number', paymentRef)
      .maybeSingle();

    return new Response(JSON.stringify({
      acumaticaData: paymentData,
      storedData: storedPayment,
      comparison: {
        acumaticaStatus: paymentData[0]?.Status?.value,
        storedStatus: storedPayment?.status,
        acumaticaLastModified: paymentData[0]?.LastModifiedDateTime?.value,
        storedLastSync: storedPayment?.last_sync_timestamp,
        statusMismatch: paymentData[0]?.Status?.value !== storedPayment?.status
      }
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: error.message,
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
