import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
        JSON.stringify({
          success: false,
          error: 'Reference number is required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let acumaticaUrl = Deno.env.get("ACUMATICA_URL");
    const username = Deno.env.get("ACUMATICA_USERNAME");
    const password = Deno.env.get("ACUMATICA_PASSWORD");
    const company = Deno.env.get("ACUMATICA_COMPANY") || "";
    const branch = Deno.env.get("ACUMATICA_BRANCH") || "";

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Acumatica credentials in server environment'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const loginBody: any = {
      name: username,
      password: password,
    };

    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`Logging into Acumatica...`);
    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.statusText}`);
    }

    const cookies = loginResponse.headers.get("set-cookie");
    if (!cookies) {
      throw new Error("No session cookie received from Acumatica");
    }

    console.log(`Fetching invoice ${referenceNumber} from Acumatica...`);

    // Fetch the invoice with all fields
    const invoiceUrl = `${acumaticaUrl}/entity/Default/23.200.001/Invoice?$filter=ReferenceNbr eq '${referenceNumber}'&$expand=Details`;

    const invoiceResponse = await fetch(invoiceUrl, {
      headers: {
        Cookie: cookies,
        "Accept": "application/json",
      },
    });

    if (!invoiceResponse.ok) {
      throw new Error(`Failed to fetch invoice: ${invoiceResponse.statusText}`);
    }

    const invoices = await invoiceResponse.json();

    if (!invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invoice ${referenceNumber} not found in Acumatica`
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const invoice = invoices[0];

    // Now get the invoice from our database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: dbInvoice, error: dbError } = await supabase
      .from('acumatica_invoices')
      .select('*')
      .eq('reference_number', referenceNumber)
      .maybeSingle();

    if (dbError) {
      console.error('Database error:', dbError);
    }

    // Logout from Acumatica
    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: cookies,
      },
    });

    // Extract all date-related fields from Acumatica
    const acumaticaDates = {
      Date: invoice.Date,
      DueDate: invoice.DueDate,
      DocDate: invoice.DocDate,
      PostPeriod: invoice.PostPeriod,
      FinancialPeriod: invoice.FinancialPeriod,
      CreatedDateTime: invoice.CreatedDateTime,
      LastModifiedDateTime: invoice.LastModifiedDateTime,
      ApprovedDate: invoice.ApprovedDate,
      ReleasedDate: invoice.ReleasedDate,
    };

    const dbDates = dbInvoice ? {
      date: dbInvoice.date,
      due_date: dbInvoice.due_date,
      post_period: dbInvoice.post_period,
      created_datetime: dbInvoice.created_datetime,
      last_modified_datetime: dbInvoice.last_modified_datetime,
      last_sync_timestamp: dbInvoice.last_sync_timestamp,
    } : null;

    return new Response(
      JSON.stringify({
        success: true,
        referenceNumber,
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
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
