import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getOrCreateSession(supabase: any, acumaticaUrl: string, credentials: any): Promise<string> {
  const { data: cachedSession } = await supabase
    .from("acumatica_session_cache")
    .select("*")
    .eq("is_valid", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    await supabase
      .from("acumatica_session_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", cachedSession.id);
    return cachedSession.session_cookie;
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
  if (!setCookieHeader) throw new Error("No cookies received from Acumatica");

  const cookies = setCookieHeader.split(",").map((c) => c.split(";")[0]).join("; ");

  await supabase
    .from("acumatica_session_cache")
    .update({ is_valid: false })
    .eq("is_valid", true);

  await supabase
    .from("acumatica_session_cache")
    .insert({
      session_cookie: cookies,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      is_valid: true,
    });

  return cookies;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { paymentRef, paymentType } = await req.json();

    if (!paymentRef) {
      return new Response(
        JSON.stringify({ error: "paymentRef is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const type = paymentType || "Payment";

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

    const cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials);

    const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(paymentRef)}`;

    const response = await fetch(url, {
      headers: { Cookie: cookies, Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Acumatica API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const docDate = data?.DocDate?.value || null;
    const financialPeriod = data?.FinancialPeriod?.value || null;
    const createdDateTime = data?.CreatedDateTime?.value || null;

    if (docDate || financialPeriod) {
      const updateData: any = {};
      if (docDate) updateData.doc_date = docDate;
      if (financialPeriod) updateData.financial_period = financialPeriod;

      const { error: updateError } = await supabase
        .from("acumatica_payments")
        .update(updateData)
        .eq("reference_number", paymentRef)
        .eq("type", type);

      if (updateError) {
        console.error("Failed to update DB:", updateError);
      }
    }

    const allFields: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === "object" && "value" in (val as any)) {
        allFields[key] = (val as any).value;
      }
    }

    return new Response(
      JSON.stringify({
        allFields,
        dbUpdated: !!(docDate || financialPeriod),
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
