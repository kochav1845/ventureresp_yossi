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
    const paymentRef = url.searchParams.get("paymentRef") || "022543";
    const paymentType = url.searchParams.get("type") || "Payment";

    const { data: credentials, error: credsError } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
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
      const errorText = await loginResponse.text();
      throw new Error(`Acumatica login failed: ${loginResponse.status} - ${errorText}`);
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      throw new Error("No cookies received from Acumatica");
    }

    const cookies = setCookieHeader.split(",").map((cookie) => cookie.split(";")[0]).join("; ");

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${paymentType}/${paymentRef}?$expand=ApplicationHistory`;

    console.log(`Fetching payment from: ${paymentUrl}`);

    const paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
    });

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      throw new Error(`Failed to fetch payment: ${paymentResponse.status} - ${errorText}`);
    }

    const payment = await paymentResponse.json();
    const applicationHistory = payment.ApplicationHistory || [];

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    });

    const diagnosticData = applicationHistory.map((app: any) => {
      return {
        invoice_ref: app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value,
        doc_type: app.DisplayDocType?.value || app.AdjustedDocType?.value,
        amount_paid: app.AmountPaid?.value,

        // All possible date fields from Acumatica
        Date: app.Date?.value,
        DocDate: app.DocDate?.value,
        DueDate: app.DueDate?.value,
        AdjdDocDate: app.AdjdDocDate?.value,
        AdjgDocDate: app.AdjgDocDate?.value,
        ApplicationDate: app.ApplicationDate?.value,

        // All fields for inspection
        all_fields: Object.keys(app).map(key => ({
          field: key,
          value: app[key]?.value,
          has_value: !!app[key]?.value
        }))
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment_reference: paymentRef,
        payment_type: paymentType,
        application_count: applicationHistory.length,
        diagnostic_data: diagnosticData,
        raw_application_history: applicationHistory
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("ERROR:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
