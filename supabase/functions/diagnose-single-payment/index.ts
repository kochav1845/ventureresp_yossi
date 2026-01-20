import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    console.log("[SESSION] Using cached session from", new Date(cachedSession.created_at).toISOString());
    await supabase
      .from("acumatica_session_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", cachedSession.id);

    return cachedSession.session_cookie;
  }

  console.log("[SESSION] No valid cached session, creating new one...");

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
    console.error(`[SESSION] Login failed: ${loginResponse.status} - ${errorText}`);
    throw new Error(`Acumatica login failed: ${loginResponse.status}`);
  }

  const setCookieHeader = loginResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No cookies received from Acumatica");
  }

  const cookies = setCookieHeader.split(",").map((cookie) => cookie.split(";")[0]).join("; ");

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

  console.log("[SESSION] New session created and cached");
  return cookies;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { paymentRef } = await req.json();

    if (!paymentRef) {
      return new Response(
        JSON.stringify({ error: "paymentRef is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get Acumatica credentials
    const { data: credentials, error: credError } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credError) {
      throw new Error(`Failed to get credentials: ${credError.message}`);
    }

    if (!credentials) {
      throw new Error("No Acumatica credentials found");
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    console.log(`Fetching payment ${paymentRef} from Acumatica...`);

    // Get or create session
    const cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials);

    // First get our stored data to know the payment type
    const { data: storedPayment } = await supabase
      .from("acumatica_payments")
      .select("*")
      .eq("reference_number", paymentRef)
      .maybeSingle();

    const paymentType = storedPayment?.type || "Payment";

    // Fetch the payment from Acumatica using the correct endpoint format
    const paymentResponse = await fetch(
      `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(
        paymentType
      )}/${encodeURIComponent(paymentRef)}?$expand=ApplicationHistory`,
      {
        headers: {
          Cookie: cookies,
          Accept: "application/json",
        },
      }
    );

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      throw new Error(
        `Failed to fetch payment: ${paymentResponse.status} - ${errorText}`
      );
    }

    const paymentData = await paymentResponse.json();

    // Get payment applications from database
    const { data: dbApplications } = await supabase
      .from("payment_invoice_applications")
      .select("*")
      .eq("payment_id", storedPayment?.id)
      .order("created_at", { ascending: true });

    return new Response(
      JSON.stringify(
        {
          acumaticaData: paymentData,
          storedData: storedPayment,
          dbApplications: dbApplications || [],
          comparison: {
            acumaticaStatus: paymentData?.Status?.value,
            storedStatus: storedPayment?.status,
            acumaticaLastModified: paymentData?.LastModifiedDateTime?.value,
            storedLastSync: storedPayment?.last_sync_timestamp,
            statusMismatch:
              paymentData?.Status?.value !== storedPayment?.status,
            acumaticaApplicationCount:
              paymentData?.ApplicationHistory?.length || 0,
            dbApplicationCount: dbApplications?.length || 0,
            applicationCountMismatch:
              (paymentData?.ApplicationHistory?.length || 0) !==
              (dbApplications?.length || 0),
          },
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
