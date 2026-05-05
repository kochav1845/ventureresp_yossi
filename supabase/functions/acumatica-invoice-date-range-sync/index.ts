import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function padRefNbr(refNbr: string): string {
  if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
    return refNbr.padStart(6, '0');
  }
  return refNbr;
}

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
    const dateFilter = `Date ge datetimeoffset'${dateFrom}' and Date le datetimeoffset'${dateTo}'`;

    // Step 1: Get lightweight list of all invoice refs from Acumatica
    const listUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${dateFilter}&$select=ReferenceNbr,Type`;
    console.log(`[invoice-sync] Fetching invoice list for ${startDate} to ${endDate}`);

    const listResponse = await sessionManager.makeAuthenticatedRequest(creds, listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      throw new Error(`Failed to fetch invoice list (${listResponse.status}): ${errorText.substring(0, 500)}`);
    }

    const listData = await listResponse.json();
    const acumaticaInvoices = Array.isArray(listData) ? listData : [];

    // Step 2: Get ALL existing invoice refs from our DB (paginate past 1000-row default limit)
    const dbSet = new Set<string>();
    const PAGE_SIZE = 1000;
    let offset = 0;
    while (true) {
      const { data: page, error: dbError } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(offset, offset + PAGE_SIZE - 1);

      if (dbError) {
        throw new Error(`Failed to query DB invoices: ${dbError.message}`);
      }

      for (const inv of (page || [])) {
        dbSet.add(`${inv.type}:${inv.reference_number}`);
      }

      if (!page || page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Step 3: Find which invoices are missing from our DB
    const missingInvoices = acumaticaInvoices.filter((inv: any) => {
      const refNbr = padRefNbr(inv.ReferenceNbr?.value || '');
      const type = inv.Type?.value || '';
      if (!refNbr || !type) return false;
      return !dbSet.has(`${type}:${refNbr}`);
    });

    console.log(`[invoice-sync] Acumatica has ${acumaticaInvoices.length}, DB has ${dbSet.size}, missing: ${missingInvoices.length}`);

    if (missingInvoices.length === 0) {
      await supabase
        .from('async_sync_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: { created: 0, updated: 0, total: 0, skipped: acumaticaInvoices.length, errors: [] },
        })
        .eq('id', jobId);

      console.log('[invoice-sync] No missing invoices, nothing to sync');
      return;
    }

    await updateProgress(supabase, jobId, { created: 0, updated: 0, total: missingInvoices.length, errors: [] });

    // Step 4: Fetch full details only for missing invoices, in batches
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 50;

    for (let batchStart = 0; batchStart < missingInvoices.length; batchStart += BATCH_SIZE) {
      const batch = missingInvoices.slice(batchStart, batchStart + BATCH_SIZE);

      // Build OR filter for this batch of missing invoices
      const refFilters = batch.map((inv: any) => {
        const refNbr = inv.ReferenceNbr?.value;
        const type = inv.Type?.value;
        return `(ReferenceNbr eq '${refNbr}' and Type eq '${type}')`;
      });

      const batchFilter = refFilters.join(' or ');
      const batchUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${batchFilter}`;

      console.log(`[invoice-sync] Fetching batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (${batch.length} invoices)`);

      const batchResponse = await sessionManager.makeAuthenticatedRequest(creds, batchUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!batchResponse.ok) {
        const errorText = await batchResponse.text();
        errors.push(`Batch fetch failed (${batchResponse.status}): ${errorText.substring(0, 200)}`);
        continue;
      }

      const batchData = await batchResponse.json();
      const invoices = Array.isArray(batchData) ? batchData : [];

      for (const invoice of invoices) {
        try {
          let refNbr = invoice.ReferenceNbr?.value;
          const type = invoice.Type?.value;
          if (!refNbr || !type) continue;

          refNbr = padRefNbr(refNbr);

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

          const { error, count } = await supabase
            .from('acumatica_invoices')
            .upsert(invoiceRow, {
              onConflict: 'reference_number,type',
              count: 'exact',
            });

          if (error) {
            errors.push(`Upsert ${type} ${refNbr}: ${error.message}`);
          } else {
            created++;
          }
        } catch (error: any) {
          errors.push(`Error ${invoice.ReferenceNbr?.value}: ${error.message}`);
        }
      }

      await updateProgress(supabase, jobId, {
        created,
        updated,
        total: missingInvoices.length,
        processed: created + updated + errors.length,
        errors: errors.slice(0, 10),
      });
    }

    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          created,
          updated,
          total: missingInvoices.length,
          skipped: acumaticaInvoices.length - missingInvoices.length,
          errors: errors.slice(0, 10),
        },
      })
      .eq('id', jobId);

    try {
      await supabase.rpc('refresh_invoice_month_summary');
    } catch (refreshErr: any) {
      console.warn('[invoice-sync] Matview refresh failed:', refreshErr.message);
    }

    console.log(`[invoice-sync] Completed: ${created} created, ${updated} updated, ${errors.length} errors (skipped ${acumaticaInvoices.length - missingInvoices.length} existing)`);
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
