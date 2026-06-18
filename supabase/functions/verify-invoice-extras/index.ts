import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

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

    const { startDate, endDate, deleteExtras = false } = await req.json().catch(() => ({}));

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ success: false, error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: config } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!config?.acumatica_url || !config?.username || !config?.password) {
      return new Response(
        JSON.stringify({ success: false, error: "Acumatica credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const acumaticaUrl = config.acumatica_url.startsWith("http")
      ? config.acumatica_url
      : `https://${config.acumatica_url}`;

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);
    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || "",
      branch: config.branch || "",
    };

    const dateFrom = `${startDate}T00:00:00`;
    const dateTo = `${endDate}T23:59:59`;
    const filterParam = `$filter=Date ge datetimeoffset'${dateFrom}' and Date le datetimeoffset'${dateTo}'`;
    const restUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?${filterParam}&$select=ReferenceNbr,Type`;

    const response = await sessionManager.makeAuthenticatedRequest(credentials, restUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Acumatica API error: ${response.status} - ${errorText.substring(0, 500)}`);
    }

    const acumaticaData = await response.json();
    const acumaticaItems = Array.isArray(acumaticaData) ? acumaticaData : [];

    // Only include 6-digit reference numbers from Acumatica
    const acumatica6Digit = acumaticaItems.filter((item: any) => {
      const ref = (item.ReferenceNbr?.value || '').trim();
      return ref.length >= 6;
    });

    const acumaticaSet = new Set(
      acumatica6Digit.map((item: any) => `${item.Type?.value || ""}:${(item.ReferenceNbr?.value || "").trim()}`)
    );

    // Only query DB invoices with 6-digit refs (exclude padded 5-digit ones starting with '0')
    const { data: dbInvoices, error: dbError } = await supabase
      .from("acumatica_invoices")
      .select("reference_number, type, customer, customer_name, amount, balance, status")
      .gte("date", startDate)
      .lte("date", endDate)
      .not('reference_number', 'like', '0%');

    if (dbError) throw new Error(`DB query error: ${dbError.message}`);

    const extras = (dbInvoices || []).filter(
      (inv) => !acumaticaSet.has(`${inv.type}:${inv.reference_number}`)
    );

    let deletedInvoices: { reference_number: string; type: string; customer_name: string }[] = [];

    if (deleteExtras && extras.length > 0) {
      for (const inv of extras) {
        const { data: deleted } = await supabase.rpc("delete_extra_invoice", {
          p_reference_number: inv.reference_number,
          p_type: inv.type,
        });
        if (deleted && deleted > 0) {
          deletedInvoices.push({
            reference_number: inv.reference_number,
            type: inv.type,
            customer_name: inv.customer_name || inv.customer || "",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        acumaticaCount: acumatica6Digit.length,
        dbCount: (dbInvoices || []).length,
        extraCount: extras.length,
        extras: extras.map((inv) => ({
          reference_number: inv.reference_number,
          type: inv.type,
          customer: inv.customer,
          customer_name: inv.customer_name,
          amount: inv.amount,
          balance: inv.balance,
          status: inv.status,
        })),
        deletedInvoices,
        deletedCount: deletedInvoices.length,
        dateRange: { startDate, endDate },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error verifying invoice extras:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
