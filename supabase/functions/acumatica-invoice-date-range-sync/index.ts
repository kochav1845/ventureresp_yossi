import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

  const loginBody: any = { name: credentials.username, password: credentials.password };
  if (credentials.company) loginBody.company = credentials.company;
  if (credentials.branch) loginBody.branch = credentials.branch;

  console.log(`[invoice-sync] Logging into Acumatica at ${acumaticaUrl}...`);

  const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginBody),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    throw new Error(`Acumatica authentication failed (${loginResponse.status}): ${errorText}`);
  }

  const setCookieHeader = loginResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No authentication cookies received from Acumatica");
  }

  const cookies = setCookieHeader.split(',').map((cookie: string) => cookie.split(';')[0]).join('; ');
  console.log(`[invoice-sync] Authenticated successfully`);

  const filterStartDate = new Date(startDate).toISOString().split('.')[0];
  const filterEndDate = new Date(endDate).toISOString().split('.')[0];

  const invoicesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=LastModifiedDateTime ge datetimeoffset'${filterStartDate}' and LastModifiedDateTime le datetimeoffset'${filterEndDate}'`;

  console.log(`[invoice-sync] Fetching invoices from ${filterStartDate} to ${filterEndDate}`);
  console.log(`[invoice-sync] URL: ${invoicesUrl}`);

  const invoicesResponse = await fetch(invoicesUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json", "Cookie": cookies },
  });

  console.log(`[invoice-sync] Response status: ${invoicesResponse.status}`);

  if (!invoicesResponse.ok) {
    const errorText = await invoicesResponse.text();
    await fetch(`${acumaticaUrl}/entity/auth/logout`, { method: "POST", headers: { "Cookie": cookies } }).catch(() => {});
    throw new Error(`Failed to fetch invoices (${invoicesResponse.status}): ${errorText.substring(0, 500)}`);
  }

  const responseText = await invoicesResponse.text();
  if (responseText.trim().startsWith('<')) {
    await fetch(`${acumaticaUrl}/entity/auth/logout`, { method: "POST", headers: { "Cookie": cookies } }).catch(() => {});
    throw new Error("Received HTML response instead of JSON from Acumatica (session may have expired)");
  }

  const invoicesData = JSON.parse(responseText);
  const invoices = Array.isArray(invoicesData) ? invoicesData : [];

  console.log(`[invoice-sync] Found ${invoices.length} invoices in date range`);

  await fetch(`${acumaticaUrl}/entity/auth/logout`, { method: "POST", headers: { "Cookie": cookies } }).catch(() => {});

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
        currency: invoice.CurrencyID?.value || null,
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

    if ((i + 1) % 10 === 0 || i === invoices.length - 1) {
      await updateProgress(supabase, jobId, {
        created,
        updated,
        total: invoices.length,
        errors: errors.slice(0, 10)
      });
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

  console.log(`[invoice-sync] Completed: ${created} created, ${updated} updated, ${errors.length} errors`);
  return { created, updated, total: invoices.length, errors: errors.length };
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
    const { startDate, endDate, jobId: existingJobId } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Start date and end date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let jobId = existingJobId;

    if (!jobId) {
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
      jobId = job.id;
    }

    console.log(`[invoice-sync] Processing job ${jobId} synchronously`);

    const result = await processSync(supabase, jobId, startDate, endDate);

    return new Response(
      JSON.stringify({ success: true, jobId, ...result }),
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
