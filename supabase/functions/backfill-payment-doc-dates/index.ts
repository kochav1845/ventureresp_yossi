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
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 100;
    const paymentType = body.paymentType || "Payment";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: credentials } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credentials) throw new Error("No Acumatica credentials found");

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const { data: missingPayments, error: fetchErr } = await supabase
      .from("acumatica_payments")
      .select("reference_number, type")
      .is("doc_date", null)
      .eq("type", paymentType)
      .limit(batchSize);

    if (fetchErr) throw new Error(`DB fetch error: ${fetchErr.message}`);
    if (!missingPayments || missingPayments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No payments missing doc_date", updated: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    if (!setCookieHeader) throw new Error("No cookies received");
    const cookies = setCookieHeader.split(",").map((c: string) => c.split(";")[0]).join("; ");

    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const payment of missingPayments) {
      try {
        const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment.type)}/${encodeURIComponent(payment.reference_number)}?$custom=CurrentDocument.DocDate,CurrentDocument.FinPeriodID`;

        const response = await fetch(url, {
          headers: { Cookie: cookies, Accept: "application/json" },
        });

        if (!response.ok) {
          const errText = await response.text();
          errors.push(`${payment.reference_number}: ${response.status} - ${errText.substring(0, 100)}`);
          failed++;
          continue;
        }

        const data = await response.json();
        const docDate = data?.custom?.CurrentDocument?.DocDate?.value || null;
        const finPeriod = data?.custom?.CurrentDocument?.FinPeriodID?.value || null;

        if (docDate || finPeriod) {
          const updateData: Record<string, any> = {};
          if (docDate) updateData.doc_date = docDate;
          if (finPeriod) updateData.financial_period = finPeriod;

          const { error: updateErr } = await supabase
            .from("acumatica_payments")
            .update(updateData)
            .eq("reference_number", payment.reference_number)
            .eq("type", payment.type);

          if (updateErr) {
            errors.push(`${payment.reference_number}: DB update failed - ${updateErr.message}`);
            failed++;
          } else {
            updated++;
          }
        } else {
          errors.push(`${payment.reference_number}: No DocDate returned from Acumatica`);
          failed++;
        }

        await new Promise((r) => setTimeout(r, 100));
      } catch (err: any) {
        errors.push(`${payment.reference_number}: ${err.message}`);
        failed++;
      }
    }

    try {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { Cookie: cookies },
      });
    } catch (_) {}

    const { count: remaining } = await supabase
      .from("acumatica_payments")
      .select("*", { count: "exact", head: true })
      .is("doc_date", null)
      .eq("type", paymentType);

    return new Response(
      JSON.stringify({
        processed: missingPayments.length,
        updated,
        failed,
        remaining,
        errors: errors.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
