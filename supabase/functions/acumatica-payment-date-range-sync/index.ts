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

async function fetchAndUpsertMissingInvoice(
  supabase: any,
  sessionManager: AcumaticaSessionManager,
  credentials: any,
  invoiceRefNbr: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    const invoiceUrl = `${credentials.acumaticaUrl}/entity/Default/24.200.001/Invoice/${invoiceRefNbr}`;
    const response = await sessionManager.makeAuthenticatedRequest(credentials, invoiceUrl);

    if (!response.ok) {
      if (response.status === 404 || response.status === 500) {
        return { success: false, error: 'Invoice not found in Acumatica' };
      }
      throw new Error(`Failed to fetch invoice: ${response.status}`);
    }

    const invoice = await response.json();
    const invoiceData = {
      type: invoice.Type?.value || 'Invoice',
      reference_number: invoice.ReferenceNbr?.value,
      customer_id: invoice.CustomerID?.value,
      customer_name: invoice.Customer?.value,
      status: invoice.Status?.value,
      date: invoice.Date?.value,
      due_date: invoice.DueDate?.value,
      invoice_amount: parseFloat(invoice.Amount?.value || 0),
      balance: parseFloat(invoice.Balance?.value || 0),
      description: invoice.Description?.value || null,
      customer_order: invoice.CustomerOrder?.value || null,
      terms: invoice.Terms?.value || null,
      location_id: invoice.LocationID?.value || null,
      currency: invoice.CurrencyID?.value || null,
      post_period: invoice.PostPeriod?.value || null,
      last_modified_date_time: invoice.LastModifiedDateTime?.value || new Date().toISOString(),
      created_date_time: invoice.CreatedDateTime?.value || null,
      last_sync_timestamp: new Date().toISOString(),
    };

    const { data: upsertedInvoice, error: upsertError } = await supabase
      .from('acumatica_invoices')
      .upsert(invoiceData, { onConflict: 'reference_number', ignoreDuplicates: false })
      .select('id')
      .single();

    if (upsertError) {
      return { success: false, error: upsertError.message };
    }

    return { success: true, invoiceId: upsertedInvoice.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function normalizeRefNbr(refNbr: string): string {
  if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
    return refNbr.padStart(6, '0');
  }
  return refNbr;
}

function extractPaymentData(payment: any) {
  const refNbr = normalizeRefNbr(payment.ReferenceNbr?.value || '');
  const type = payment.Type?.value;
  return {
    refNbr,
    type,
    data: {
      reference_number: refNbr,
      type,
      status: payment.Status?.value || null,
      hold: payment.Hold?.value || false,
      application_date: payment.ApplicationDate?.value || payment.PaymentDate?.value || null,
      payment_amount: payment.PaymentAmount?.value || 0,
      available_balance: payment.UnappliedBalance?.value || 0,
      customer_id: payment.CustomerID?.value || null,
      customer_name: payment.CustomerName?.value || null,
      payment_method: payment.PaymentMethod?.value || null,
      cash_account: payment.CashAccount?.value || null,
      payment_ref: payment.PaymentRef?.value || null,
      description: payment.Description?.value || null,
      currency_id: payment.CurrencyID?.value || null,
      last_modified_datetime: payment.LastModifiedDateTime?.value || null,
      raw_data: payment,
      last_sync_timestamp: new Date().toISOString()
    }
  };
}

async function fetchPaymentDetails(
  supabase: any,
  sessionManager: AcumaticaSessionManager,
  credentials: any,
  paymentDbId: number,
  refNbr: string,
  type: string,
  customerIdVal: string | null,
  stats: { applicationsSynced: number; filesSynced: number; errors: string[] }
) {
  try {
    const directUrl = `${credentials.acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(refNbr)}?$expand=ApplicationHistory,files`;
    const detailResponse = await sessionManager.makeAuthenticatedRequest(credentials, directUrl);

    if (!detailResponse.ok) return;

    const detailData = await detailResponse.json();

    if (detailData.files && Array.isArray(detailData.files) && detailData.files.length > 0) {
      for (const file of detailData.files) {
        const fileId = file.id?.value || file.id;
        const fileName = file.filename?.value || file.filename || file.name?.value || file.name;
        if (!fileId || !fileName) continue;

        try {
          const fileUrl = `${credentials.acumaticaUrl}/(W(2))/Frames/GetFile.ashx?fileID=${fileId}`;
          const fileResponse = await sessionManager.makeAuthenticatedRequest(credentials, fileUrl);
          if (fileResponse.ok) {
            const fileBlob = await fileResponse.arrayBuffer();
            const cleanFileName = (fileName.split('\\').pop() || fileName).replace(/[#?&]/g, '_');
            const storagePath = `payments/${refNbr}/${new Date().toISOString().replace(/[:.]/g, '-')}-${cleanFileName}`;

            const { error: uploadError } = await supabase.storage
              .from('payment-check-images')
              .upload(storagePath, new Uint8Array(fileBlob), {
                contentType: fileResponse.headers.get('content-type') || 'application/octet-stream',
                upsert: true
              });

            if (!uploadError) {
              const isCheckImage = cleanFileName.toLowerCase().includes('check') ||
                cleanFileName.toLowerCase().includes('.jpg') ||
                cleanFileName.toLowerCase().includes('.jpeg') ||
                cleanFileName.toLowerCase().includes('.png');

              await supabase
                .from('payment_attachments')
                .upsert({
                  payment_reference_number: refNbr,
                  file_name: cleanFileName,
                  file_type: fileResponse.headers.get('content-type') || 'application/octet-stream',
                  file_size: fileBlob.byteLength,
                  storage_path: storagePath,
                  file_id: fileId,
                  is_check_image: isCheckImage,
                }, { onConflict: 'payment_reference_number,file_id' });

              stats.filesSynced++;
            }
          }
        } catch (fileError: any) {
          console.error(`[payment-sync] File sync error for ${fileName}:`, fileError.message);
        }
      }
    }

    if (detailData.ApplicationHistory && Array.isArray(detailData.ApplicationHistory)) {
      for (const app of detailData.ApplicationHistory) {
        let invoiceRefNbr = app.DisplayRefNbr?.value || app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;
        const amountPaid = app.AmountPaid?.value;
        const appDate = app.ApplicationDate?.value || app.Date?.value;
        const docType = app.DisplayDocType?.value || app.DocType?.value || app.AdjustedDocType?.value || 'Invoice';

        if (!invoiceRefNbr) continue;
        invoiceRefNbr = normalizeRefNbr(invoiceRefNbr);

        const { data: invoiceExists } = await supabase
          .from('acumatica_invoices')
          .select('id')
          .eq('reference_number', invoiceRefNbr)
          .maybeSingle();

        if (!invoiceExists && docType === 'Invoice') {
          await fetchAndUpsertMissingInvoice(supabase, sessionManager, credentials, invoiceRefNbr);
        }

        try {
          await supabase
            .from('payment_invoice_applications')
            .upsert({
              payment_id: paymentDbId,
              payment_reference_number: refNbr,
              invoice_reference_number: invoiceRefNbr,
              customer_id: customerIdVal || '',
              amount_paid: amountPaid || 0,
              application_date: appDate || null,
              doc_type: docType,
              balance: app.Balance?.value || 0,
              cash_discount_taken: app.CashDiscountTaken?.value || 0,
              post_period: app.PostPeriod?.value || null,
              application_period: app.ApplicationPeriod?.value || null,
              due_date: app.DueDate?.value || null,
              customer_order: app.CustomerOrder?.value || null,
              description: app.Description?.value || null,
              invoice_date: app.Date?.value || null
            }, { onConflict: 'payment_id,invoice_reference_number' });

          stats.applicationsSynced++;
        } catch (appError: any) {
          stats.errors.push(`Application sync error ${refNbr} -> ${invoiceRefNbr}: ${appError.message}`);
        }
      }
    }
  } catch (historyError: any) {
    console.error(`[payment-sync] Detail fetch error for ${refNbr}:`, historyError.message);
  }
}

async function processSync(supabase: any, sessionManager: AcumaticaSessionManager, jobId: string, startDate: string, endDate: string) {
  await supabase
    .from('async_sync_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);

  const { data: credentials } = await supabase
    .from('acumatica_sync_credentials')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!credentials) throw new Error("Missing Acumatica credentials");

  let acumaticaUrl = credentials.acumatica_url;
  if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
    acumaticaUrl = `https://${acumaticaUrl}`;
  }

  const credentialsObj = {
    acumaticaUrl,
    username: credentials.username,
    password: credentials.password,
    company: credentials.company,
    branch: credentials.branch
  };

  await sessionManager.getSession(credentialsObj);

  const filterStartDate = new Date(startDate).toISOString().split('.')[0];
  const filterEndDate = new Date(endDate).toISOString().split('.')[0];

  const paymentsUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=ApplicationDate ge datetimeoffset'${filterStartDate}' and ApplicationDate le datetimeoffset'${filterEndDate}' and Type ne 'Credit Memo'`;

  console.log(`[payment-sync] Fetching payment list from ${filterStartDate} to ${filterEndDate}`);

  const paymentsResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, paymentsUrl);

  if (!paymentsResponse.ok) {
    const errorText = await paymentsResponse.text();
    throw new Error(`Failed to fetch payments (${paymentsResponse.status}): ${errorText.substring(0, 500)}`);
  }

  const paymentsData = await paymentsResponse.json();
  const payments = Array.isArray(paymentsData) ? paymentsData : [];

  console.log(`[payment-sync] Found ${payments.length} payments in Acumatica`);

  const acumaticaPayments = payments
    .map((p: any) => extractPaymentData(p))
    .filter((p: any) => p.refNbr && p.type);

  const acumaticaKeys = new Set(acumaticaPayments.map((p: any) => `${p.type}::${p.refNbr}`));

  const { data: dbPayments } = await supabase
    .from('acumatica_payments')
    .select('id, reference_number, type, status, last_modified_datetime')
    .gte('application_date', `${startDate}T00:00:00`)
    .lte('application_date', `${endDate}T23:59:59`)
    .neq('type', 'Credit Memo');

  const dbKeyMap = new Map<string, { id: number; status: string; last_modified_datetime: string }>();
  if (dbPayments) {
    for (const p of dbPayments) {
      dbKeyMap.set(`${p.type}::${p.reference_number}`, {
        id: p.id,
        status: p.status,
        last_modified_datetime: p.last_modified_datetime
      });
    }
  }

  const missingPayments: typeof acumaticaPayments = [];
  const existingPayments: typeof acumaticaPayments = [];

  for (const payment of acumaticaPayments) {
    const key = `${payment.type}::${payment.refNbr}`;
    if (dbKeyMap.has(key)) {
      existingPayments.push(payment);
    } else {
      missingPayments.push(payment);
    }
  }

  console.log(`[payment-sync] ${missingPayments.length} missing, ${existingPayments.length} already in DB`);

  let created = 0, updated = 0;
  const stats = { applicationsSynced: 0, filesSynced: 0, errors: [] as string[] };
  const totalToProcess = missingPayments.length;

  await updateProgress(supabase, jobId, {
    created: 0, updated: 0,
    applicationsSynced: 0, filesSynced: 0,
    total: totalToProcess,
    totalInAcumatica: payments.length,
    alreadyInDb: existingPayments.length,
    missing: missingPayments.length,
    errors: []
  });

  if (existingPayments.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < existingPayments.length; i += BATCH_SIZE) {
      const batch = existingPayments.slice(i, i + BATCH_SIZE);
      for (const payment of batch) {
        const dbEntry = dbKeyMap.get(`${payment.type}::${payment.refNbr}`);
        if (!dbEntry) continue;

        const acumaticaModified = payment.data.last_modified_datetime;
        const dbModified = dbEntry.last_modified_datetime;

        if (acumaticaModified && dbModified && acumaticaModified === dbModified) continue;

        const { error } = await supabase
          .from('acumatica_payments')
          .update(payment.data)
          .eq('reference_number', payment.refNbr)
          .eq('type', payment.type);

        if (!error) updated++;
      }
    }
    console.log(`[payment-sync] Quick-updated ${updated} existing payments`);
  }

  for (let i = 0; i < missingPayments.length; i++) {
    const payment = missingPayments[i];
    try {
      const { data: job } = await supabase
        .from('async_sync_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();

      if (job?.status === 'failed') {
        console.log('[payment-sync] Job was cancelled, stopping');
        return { created, updated, applicationsSynced: stats.applicationsSynced, filesSynced: stats.filesSynced, total: totalToProcess, cancelled: true };
      }

      const { data: inserted, error } = await supabase
        .from('acumatica_payments')
        .insert(payment.data)
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('acumatica_payments')
            .select('id')
            .eq('reference_number', payment.refNbr)
            .eq('type', payment.type)
            .maybeSingle();

          if (existing) {
            await supabase.from('acumatica_payments').update(payment.data).eq('id', existing.id);
            updated++;
            await fetchPaymentDetails(supabase, sessionManager, credentialsObj, existing.id, payment.refNbr, payment.type, payment.data.customer_id, stats);
          }
        } else {
          stats.errors.push(`Insert failed for ${payment.refNbr}: ${error.message}`);
        }
      } else if (inserted) {
        created++;

        await fetchPaymentDetails(supabase, sessionManager, credentialsObj, inserted.id, payment.refNbr, payment.type, payment.data.customer_id, stats);

        if (payment.data.status === 'Voided' && payment.type === 'Payment') {
          const { data: voidedExists } = await supabase
            .from('acumatica_payments')
            .select('id')
            .eq('reference_number', payment.refNbr)
            .eq('type', 'Voided Payment')
            .maybeSingle();

          if (!voidedExists) {
            try {
              const voidedPaymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/Voided Payment/${encodeURIComponent(payment.refNbr)}?$expand=ApplicationHistory,files`;
              const voidedResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, voidedPaymentUrl);
              if (voidedResponse.ok) {
                const voidedPayment = await voidedResponse.json();
                const voidedData = {
                  reference_number: payment.refNbr,
                  type: 'Voided Payment',
                  status: voidedPayment.Status?.value || null,
                  hold: voidedPayment.Hold?.value || false,
                  application_date: voidedPayment.ApplicationDate?.value || voidedPayment.PaymentDate?.value || null,
                  payment_amount: voidedPayment.PaymentAmount?.value || 0,
                  available_balance: voidedPayment.UnappliedBalance?.value || 0,
                  customer_id: voidedPayment.CustomerID?.value || null,
                  customer_name: voidedPayment.CustomerName?.value || null,
                  payment_method: voidedPayment.PaymentMethod?.value || null,
                  cash_account: voidedPayment.CashAccount?.value || null,
                  payment_ref: voidedPayment.PaymentRef?.value || null,
                  description: voidedPayment.Description?.value || null,
                  currency_id: voidedPayment.CurrencyID?.value || null,
                  last_modified_datetime: voidedPayment.LastModifiedDateTime?.value || null,
                  raw_data: voidedPayment,
                  last_sync_timestamp: new Date().toISOString()
                };
                const { error: voidedError } = await supabase.from('acumatica_payments').insert(voidedData);
                if (!voidedError) created++;
              }
            } catch (voidedError: any) {
              console.error(`[payment-sync] Error fetching voided payment for ${payment.refNbr}:`, voidedError.message);
            }
          }
        }
      }
    } catch (error: any) {
      stats.errors.push(`Error processing ${payment.refNbr}: ${error.message}`);
    }

    if ((i + 1) % 3 === 0 || i === missingPayments.length - 1) {
      await updateProgress(supabase, jobId, {
        created, updated,
        applicationsSynced: stats.applicationsSynced,
        filesSynced: stats.filesSynced,
        total: totalToProcess,
        totalInAcumatica: payments.length,
        alreadyInDb: existingPayments.length,
        missing: missingPayments.length,
        processed: i + 1,
        errors: stats.errors.slice(0, 10)
      });
    }
  }

  await supabase.from('async_sync_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    progress: {
      created, updated,
      applicationsSynced: stats.applicationsSynced,
      filesSynced: stats.filesSynced,
      total: totalToProcess,
      totalInAcumatica: payments.length,
      alreadyInDb: existingPayments.length,
      missing: missingPayments.length,
      errors: stats.errors.slice(0, 10)
    }
  }).eq('id', jobId);

  console.log(`[payment-sync] Done: ${created} created, ${updated} updated, ${stats.applicationsSynced} apps, ${stats.filesSynced} files`);
  return { created, updated, applicationsSynced: stats.applicationsSynced, filesSynced: stats.filesSynced, total: totalToProcess };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

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
    const { startDate, endDate, jobId: existingJobId, pollStatus } = body;

    if (pollStatus && existingJobId) {
      const { data: job } = await supabase
        .from('async_sync_jobs')
        .select('id, status, progress, error_message, completed_at')
        .eq('id', existingJobId)
        .maybeSingle();

      return new Response(
        JSON.stringify({ success: true, job }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Start date and end date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let jobId = existingJobId;

    if (!jobId) {
      const { data: existingRunning } = await supabase
        .from('async_sync_jobs')
        .select('id, status, created_at')
        .eq('entity_type', 'payment')
        .in('status', ['running', 'pending'])
        .eq('start_date', startDate)
        .eq('end_date', endDate)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingRunning && existingRunning.length > 0) {
        const existing = existingRunning[0];
        const minutesAgo = (Date.now() - new Date(existing.created_at).getTime()) / 60000;

        if (minutesAgo < 30) {
          return new Response(
            JSON.stringify({ success: true, jobId: existing.id, async: true, reused: true }),
            { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase.from('async_sync_jobs').update({
          status: 'failed',
          error_message: 'Auto-expired: replaced by new job',
          completed_at: new Date().toISOString()
        }).eq('id', existing.id);
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
          entity_type: 'payment',
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

    const backgroundTask = (async () => {
      try {
        await processSync(supabase, sessionManager, jobId, startDate, endDate);
      } catch (error: any) {
        console.error('[payment-sync] Background task failed:', error.message);
        await supabase.from('async_sync_jobs').update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        }).eq('id', jobId);
      }
    })();

    EdgeRuntime.waitUntil(backgroundTask);

    return new Response(
      JSON.stringify({ success: true, jobId, async: true }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[payment-sync] Fatal error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
