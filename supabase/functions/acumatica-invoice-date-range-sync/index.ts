import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function updateProgress(supabase: any, jobId: string, progress: any) {
  await supabase
    .from('async_sync_jobs')
    .update({ progress })
    .eq('id', jobId);
}

async function processSync(supabase: any, jobId: string, startDate: string, endDate: string) {
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
      throw new Error(`Missing Acumatica credentials: ${credsError?.message || 'none found'}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const creds = {
      acumaticaUrl,
      username: credentials.username,
      password: credentials.password,
      company: credentials.company || '',
      branch: credentials.branch || '',
    };

    const dateFrom = `${startDate}T00:00:00`;
    const dateTo = `${endDate}T23:59:59`;
    const filterParam = `$filter=Date ge datetimeoffset'${dateFrom}' and Date le datetimeoffset'${dateTo}'`;
    const invoicesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?${filterParam}`;

    console.log(`[invoice-sync] Fetching invoices dated ${startDate} to ${endDate}`);

    const invoicesResponse = await sessionManager.makeAuthenticatedRequest(creds, invoicesUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      throw new Error(`Failed to fetch invoices (${invoicesResponse.status}): ${errorText.substring(0, 500)}`);
    }

    const invoicesData = await invoicesResponse.json();
    const invoices = Array.isArray(invoicesData) ? invoicesData : [];

    console.log(`[invoice-sync] Found ${invoices.length} invoices in date range`);

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    await updateProgress(supabase, jobId, { created: 0, updated: 0, total: invoices.length, errors: [] });

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      try {
        let refNbr = invoice.ReferenceNbr?.value;
        const type = invoice.Type?.value;

        if (!refNbr || !type) continue;

        if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
          refNbr = refNbr.padStart(6, '0');
        }

        const invoiceRow: any = {
          reference_number: refNbr,
          type,
          status: invoice.Status?.value || null,
          customer: invoice.CustomerID?.value || null,
          customer_name: invoice.Customer?.value || null,
          date: invoice.Date?.value || null,
          due_date: invoice.DueDate?.value || null,
          amount: invoice.Amount?.value || 0,
          balance: invoice.Balance?.value || 0,
          description: invoice.Description?.value || null,
          currency: invoice.CurrencyID?.value || null,
          last_modified_datetime: invoice.LastModifiedDateTime?.value || null,
          raw_data: invoice,
          last_sync_timestamp: new Date().toISOString(),
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
            .update(invoiceRow)
            .eq('reference_number', refNbr)
            .eq('type', type);

          if (error) {
            errors.push(`Update ${refNbr}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabase
            .from('acumatica_invoices')
            .insert(invoiceRow);

          if (error) {
            errors.push(`Insert ${refNbr}: ${error.message}`);
          } else {
            created++;
          }
        }
      } catch (error: any) {
        errors.push(`Error ${invoice.ReferenceNbr?.value}: ${error.message}`);
      }

      if ((i + 1) % 10 === 0 || i === invoices.length - 1) {
        await updateProgress(supabase, jobId, {
          created,
          updated,
          total: invoices.length,
          processed: created + updated,
          errors: errors.slice(0, 10),
        });
      }
    }

    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { created, updated, total: invoices.length, errors: errors.slice(0, 10) },
      })
      .eq('id', jobId);

    // Refresh the invoice month summary materialized view
    try {
      await supabase.rpc('refresh_invoice_month_summary');
    } catch (refreshErr: any) {
      console.warn('[invoice-sync] Matview refresh failed:', refreshErr.message);
    }

    console.log(`[invoice-sync] Completed: ${created} created, ${updated} updated, ${errors.length} errors`);
  } catch (error: any) {
    console.error(`[invoice-sync] Job ${jobId} failed:`, error.message);
    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
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
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Start date and end date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    const { data: job, error: jobError } = await supabase
      .from('async_sync_jobs')
      .insert({
        entity_type: 'invoice',
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
        created_by: userId,
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create sync job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run processing in background so request returns immediately
    EdgeRuntime.waitUntil(processSync(supabase, job.id, startDate, endDate));

    return new Response(
      JSON.stringify({ success: true, async: true, jobId: job.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[invoice-sync] Fatal error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
