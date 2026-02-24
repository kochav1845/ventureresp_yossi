import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function processSync(jobId: string, startDate: string, endDate: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    await supabase
      .from('async_sync_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId);

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error("Missing Acumatica credentials");
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const loginBody: any = {
      name: credentials.username,
      password: credentials.password
    };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error("Acumatica authentication failed");
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      throw new Error("No authentication cookies received");
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const filterStartDate = new Date(startDate).toISOString().split('.')[0];
    const filterEndDate = new Date(endDate).toISOString().split('.')[0];

    const invoicesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=LastModifiedDateTime ge datetimeoffset'${filterStartDate}' and LastModifiedDateTime le datetimeoffset'${filterEndDate}'`;

    console.log(`Fetching invoices from ${filterStartDate} to ${filterEndDate}`);

    const invoicesResponse = await fetch(invoicesUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      throw new Error(`Failed to fetch invoices: ${errorText}`);
    }

    const responseText = await invoicesResponse.text();
    if (responseText.trim().startsWith('<')) {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      throw new Error("Received HTML response from Acumatica");
    }

    const invoicesData = JSON.parse(responseText);
    const invoices = Array.isArray(invoicesData) ? invoicesData : [];

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const invoice of invoices) {
      try {
        let refNbr = invoice.ReferenceNbr?.value;
        const type = invoice.Type?.value;

        if (!refNbr || !type) {
          continue;
        }

        if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
          refNbr = refNbr.padStart(6, '0');
        }

        const invoiceData: any = {
          reference_number: refNbr,
          type: type,
          status: invoice.Status?.value || null,
          customer_id: invoice.CustomerID?.value || null,
          customer_name: invoice.Customer?.value || null,
          date: invoice.Date?.value || null,
          due_date: invoice.DueDate?.value || null,
          amount: invoice.Amount?.value || 0,
          balance: invoice.Balance?.value || 0,
          description: invoice.Description?.value || null,
          currency_id: invoice.CurrencyID?.value || null,
          last_modified_datetime: invoice.LastModifiedDateTime?.value || null,
          raw_data: invoice,
          last_sync_timestamp: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('acumatica_invoices')
          .select('id')
          .eq('reference_number', refNbr)
          .eq('type', type)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('acumatica_invoices')
            .update(invoiceData)
            .eq('reference_number', refNbr)
            .eq('type', type);

          if (error) {
            errors.push(`Update failed for ${refNbr}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabase
            .from('acumatica_invoices')
            .insert(invoiceData);

          if (error) {
            errors.push(`Insert failed for ${refNbr}: ${error.message}`);
          } else {
            created++;
          }
        }
      } catch (error: any) {
        errors.push(`Error processing invoice: ${error.message}`);
      }
    }

    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { created, updated, total: invoices.length, errors: errors.slice(0, 10) }
      })
      .eq('id', jobId);

  } catch (error: any) {
    console.error('Invoice date range sync error:', error);
    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', jobId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    let userId = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Start date and end date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('async_sync_jobs')
      .insert({
        entity_type: 'invoice',
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
        created_by: userId
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Failed to create sync job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    EdgeRuntime.waitUntil(processSync(job.id, startDate, endDate));

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        message: "Sync job started in background. Check the job status for progress."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Invoice date range sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});