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
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { referenceNumber } = await req.json();

    if (!referenceNumber) {
      return new Response(
        JSON.stringify({ success: false, error: 'Reference number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load credentials from database (same as working sync functions)
    const { data: config, error: configError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: 'No Acumatica credentials configured in database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let acumaticaUrl = config.acumatica_url;
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || "",
      branch: config.branch || "",
    };

    // Use the session manager like working sync functions
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    console.log(`Fetching invoice ${referenceNumber} from Acumatica...`);

    // Try both Invoice and DebitMemo types
    let invoice = null;
    let invoiceType = '';

    for (const type of ['Invoice', 'DebitMemo', 'CreditMemo']) {
      const invoiceUrl = `${acumaticaUrl}/entity/Default/23.200.001/${type}?$filter=ReferenceNbr eq '${referenceNumber}'&$expand=Details`;
      const response = await sessionManager.makeAuthenticatedRequest(credentials, invoiceUrl, {
        headers: { "Accept": "application/json" },
      });

      if (response.ok) {
        const invoices = await response.json();
        if (invoices && invoices.length > 0) {
          invoice = invoices[0];
          invoiceType = type;
          break;
        }
      }
    }

    if (!invoice) {
      return new Response(
        JSON.stringify({ success: false, error: `Invoice ${referenceNumber} not found in Acumatica (tried Invoice, DebitMemo, CreditMemo)` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get from our database
    const { data: dbInvoice, error: dbError } = await supabase
      .from('acumatica_invoices')
      .select('*')
      .eq('reference_number', referenceNumber)
      .maybeSingle();

    if (dbError) {
      console.error('Database error:', dbError);
    }

    const acumaticaDates = {
      Date: invoice.Date,
      DueDate: invoice.DueDate,
      DocDate: invoice.DocDate,
      PostPeriod: invoice.PostPeriod,
      FinancialPeriod: invoice.FinancialPeriod,
      CreatedDateTime: invoice.CreatedDateTime,
      LastModifiedDateTime: invoice.LastModifiedDateTime,
    };

    const dbDates = dbInvoice ? {
      date: dbInvoice.date,
      due_date: dbInvoice.due_date,
      post_period: dbInvoice.post_period,
      last_modified_datetime: dbInvoice.last_modified_datetime,
      last_sync_timestamp: dbInvoice.last_sync_timestamp,
    } : null;

    return new Response(
      JSON.stringify({
        success: true,
        referenceNumber,
        foundAsType: invoiceType,
        acumatica: {
          dates: acumaticaDates,
          fullData: invoice,
        },
        database: {
          dates: dbDates,
          exists: !!dbInvoice,
          fullData: dbInvoice,
        },
        comparison: {
          dateMatch: acumaticaDates.Date?.value === dbInvoice?.date,
          dueDateMatch: acumaticaDates.DueDate?.value === dbInvoice?.due_date,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
