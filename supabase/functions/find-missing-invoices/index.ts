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

    const body = await req.json().catch(() => ({}));
    const type = body.type || "Invoice";
    const status = body.status || "Open";

    const { data: config } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!config?.acumatica_url || !config?.username || !config?.password) {
      return new Response(
        JSON.stringify({ error: "Acumatica credentials not configured" }),
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

    const filter = `Type eq '${type}' and Status eq '${status}'`;
    let skip = 0;
    const top = 1000;
    const acumaticaInvoices: Record<string, any> = {};
    let hasMore = true;

    while (hasMore) {
      const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Date,Amount,Balance,Customer,Status&$top=${top}&$skip=${skip}&$orderby=ReferenceNbr asc`;

      const response = await sessionManager.makeAuthenticatedRequest(credentials, url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : [];

      for (const item of items) {
        const ref = item.ReferenceNbr?.value;
        if (ref) {
          acumaticaInvoices[ref] = {
            referenceNumber: ref,
            date: item.Date?.value,
            amount: item.Amount?.value,
            balance: item.Balance?.value,
            customer: item.Customer?.value,
            status: item.Status?.value,
          };
        }
      }

      hasMore = items.length >= top;
      skip += top;
    }

    const acumaticaRefs = Object.keys(acumaticaInvoices);
    console.log(`Fetched ${acumaticaRefs.length} ${type}/${status} from Acumatica`);

    const batchSize = 500;
    const dbRefs = new Set<string>();
    for (let i = 0; i < acumaticaRefs.length; i += batchSize) {
      const batch = acumaticaRefs.slice(i, i + batchSize);
      const { data: dbRows } = await supabase
        .from("acumatica_invoices")
        .select("reference_number")
        .eq("type", type)
        .in("reference_number", batch);

      if (dbRows) {
        for (const row of dbRows) {
          dbRefs.add(row.reference_number);
        }
      }
    }

    const missingFromDb = acumaticaRefs
      .filter(ref => !dbRefs.has(ref))
      .map(ref => acumaticaInvoices[ref]);

    const { data: dbOnlyRows } = await supabase
      .from("acumatica_invoices")
      .select("reference_number, date, amount, balance, customer, customer_name, status")
      .eq("type", type)
      .eq("status", status);

    const dbOnlyRefs = (dbOnlyRows || [])
      .filter(row => !acumaticaInvoices[row.reference_number])
      .map(row => ({
        referenceNumber: row.reference_number,
        date: row.date,
        amount: row.amount,
        balance: row.balance,
        customer: row.customer,
        customerName: row.customer_name,
        status: row.status,
      }));

    return new Response(
      JSON.stringify({
        success: true,
        type,
        status,
        acumaticaCount: acumaticaRefs.length,
        dbCount: dbRefs.size + dbOnlyRefs.length,
        missingFromDb: {
          count: missingFromDb.length,
          invoices: missingFromDb,
        },
        extraInDb: {
          count: dbOnlyRefs.length,
          invoices: dbOnlyRefs,
        },
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error finding missing invoices:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
