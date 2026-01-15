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

    const { payment_reference_number = "025915", payment_type = "Payment" } = await req.json();

    const { data: config } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .single();

    if (!config) {
      return new Response(
        JSON.stringify({ error: "No Acumatica credentials found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let acumaticaUrl = config.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const loginBody: any = {
      name: config.username,
      password: config.password
    };
    if (config.company) loginBody.company = config.company;
    if (config.branch) loginBody.branch = config.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication cookies received" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment_type)}/${encodeURIComponent(payment_reference_number)}?$expand=ApplicationHistory`;
    console.log(`Fetching: ${paymentUrl}`);
    const paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!paymentResponse.ok) {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({ error: `Failed to fetch payment: ${paymentResponse.status}` }),
        { status: paymentResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentData = await paymentResponse.json();

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    const applicationHistory = paymentData.ApplicationHistory || [];

    return new Response(
      JSON.stringify({
        success: true,
        payment_reference: payment_reference_number,
        application_history_count: Array.isArray(applicationHistory) ? applicationHistory.length : 0,
        application_history: applicationHistory,
        raw_payment_keys: Object.keys(paymentData),
        sample_app: Array.isArray(applicationHistory) && applicationHistory.length > 0
          ? applicationHistory[0]
          : null,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error('Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});