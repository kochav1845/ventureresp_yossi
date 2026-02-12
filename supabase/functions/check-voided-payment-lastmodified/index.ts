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
    const { paymentRef } = await req.json();

    if (!paymentRef) {
      return new Response(
        JSON.stringify({ error: "paymentRef is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const paddedRef = paymentRef.padStart(6, '0');
    const results: any[] = [];

    // Try both Payment and Voided Payment types
    const typesToCheck = ['Payment', 'Voided Payment'];

    for (const type of typesToCheck) {
      try {
        const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(paddedRef)}`;
        console.log(`Checking ${type}: ${url}`);

        const response = await sessionManager.makeAuthenticatedRequest(credentials, url);

        if (response.ok) {
          const data = await response.json();
          results.push({
            type,
            found: true,
            referenceNumber: data.ReferenceNbr?.value,
            status: data.Status?.value,
            paymentAmount: data.PaymentAmount?.value,
            applicationDate: data.ApplicationDate?.value,
            lastModifiedDateTime: data.LastModifiedDateTime?.value,
            createdDateTime: data.CreatedDateTime?.value,
          });
        } else {
          results.push({
            type,
            found: false,
            status: response.status,
            error: await response.text().catch(() => 'Unknown error')
          });
        }
      } catch (error: any) {
        results.push({
          type,
          found: false,
          error: error.message
        });
      }
    }

    // Also get what's in our database
    const { data: dbRecords } = await supabase
      .from('acumatica_payments')
      .select('*')
      .eq('reference_number', paddedRef)
      .order('created_at', { ascending: true });

    return new Response(
      JSON.stringify({
        paymentRef: paddedRef,
        acumaticaRecords: results,
        databaseRecords: dbRecords || [],
        analysis: {
          inAcumatica: results.filter(r => r.found).map(r => r.type),
          inDatabase: (dbRecords || []).map((r: any) => r.type),
          missing: results.filter(r => r.found && !dbRecords?.some((db: any) => db.type === r.type)).map(r => r.type)
        }
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
