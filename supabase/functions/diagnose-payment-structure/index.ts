import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const url = new URL(req.url);
    let paymentRef = url.searchParams.get("paymentRef") || "000001";
    const paymentType = url.searchParams.get("type") || "Payment";

    if (/^[0-9]+$/.test(paymentRef) && paymentRef.length < 6) {
      paymentRef = paymentRef.padStart(6, '0');
    }

    const { data: credentials } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credentials) {
      throw new Error("No active Acumatica credentials found");
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const loginBody: any = {
      name: credentials.username,
      password: credentials.password,
    };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      throw new Error("No cookies received");
    }

    const cookies = setCookieHeader.split(",").map((cookie) => cookie.split(";")[0]).join("; ");

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${paymentType}/${paymentRef}?$expand=ApplicationHistory`;

    const paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
    });

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookies },
      });
      throw new Error(`Failed to fetch payment: ${paymentResponse.status} - ${errorText}`);
    }

    const payment = await paymentResponse.json();

    const analysis = {
      paymentRef,
      paymentType,
      allKeys: Object.keys(payment),
      applicationHistoryExists: !!payment.ApplicationHistory,
      applicationHistoryType: Array.isArray(payment.ApplicationHistory) ? 'array' : typeof payment.ApplicationHistory,
      applicationHistoryLength: payment.ApplicationHistory?.length || 0,
      documentsToApplyExists: !!payment.DocumentsToApply,
      documentsToApplyType: Array.isArray(payment.DocumentsToApply) ? 'array' : typeof payment.DocumentsToApply,
      documentsToApplyLength: payment.DocumentsToApply?.length || 0,
      sampleFields: {} as any,
      fullPaymentObject: payment
    };

    const interestingFields = ['ApplicationHistory', 'DocumentsToApply', 'Type', 'ReferenceNbr', 'Status', 'PaymentAmount'];
    for (const field of interestingFields) {
      if (payment[field] !== undefined) {
        analysis.sampleFields[field] = payment[field];
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookies },
    });

    return new Response(
      JSON.stringify(analysis, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Diagnostic error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
