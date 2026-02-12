import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: credentials } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!credentials) {
      throw new Error("No Acumatica credentials found");
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const sessionManager = new AcumaticaSessionManager(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Test filter that would have been used on Feb 2
    const testDate = '2026-02-02T16:00:00';
    const filterUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=LastModifiedDateTime gt datetimeoffset'${testDate}' and Type ne 'Credit Memo'&$top=20`;

    console.log('Testing filter:', filterUrl);

    const response = await sessionManager.makeAuthenticatedRequest(credentials, filterUrl);

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const payments = Array.isArray(data) ? data : [];

    const summary = {
      totalReturned: payments.length,
      paymentTypes: payments.reduce((acc: any, p: any) => {
        const type = p.Type?.value || 'Unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
      has026464Voided: payments.some((p: any) =>
        p.ReferenceNbr?.value === '026464' && p.Type?.value === 'Voided Payment'
      ),
      sample: payments.slice(0, 5).map((p: any) => ({
        ref: p.ReferenceNbr?.value,
        type: p.Type?.value,
        lastModified: p.LastModifiedDateTime?.value
      }))
    };

    return new Response(
      JSON.stringify({
        filterUsed: filterUrl,
        summary,
        allPayments: payments.map((p: any) => ({
          referenceNumber: p.ReferenceNbr?.value,
          type: p.Type?.value,
          lastModifiedDateTime: p.LastModifiedDateTime?.value,
          status: p.Status?.value
        }))
      }, null, 2),
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
