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
    console.log(`[payment-sync] Fetching missing invoice ${invoiceRefNbr} from Acumatica...`);
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
      currency_id: invoice.CurrencyID?.value || null,
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

  console.log('[payment-sync] Getting Acumatica session...');
  await sessionManager.getSession(credentialsObj);
  console.log('[payment-sync] Session obtained');

  const filterStartDate = new Date(startDate).toISOString().split('.')[0];
  const filterEndDate = new Date(endDate).toISOString().split('.')[0];

  const paymentsUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=ApplicationDate ge datetimeoffset'${filterStartDate}' and ApplicationDate le datetimeoffset'${filterEndDate}' and Type ne 'Credit Memo'`;

  console.log(`[payment-sync] Fetching payments from ${filterStartDate} to ${filterEndDate}`);

  const paymentsResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, paymentsUrl);

  if (!paymentsResponse.ok) {
    const errorText = await paymentsResponse.text();
    throw new Error(`Failed to fetch payments (${paymentsResponse.status}): ${errorText.substring(0, 500)}`);
  }

  const paymentsData = await paymentsResponse.json();
  const payments = Array.isArray(paymentsData) ? paymentsData : [];

  console.log(`[payment-sync] Found ${payments.length} payments in date range`);

  let created = 0, updated = 0, applicationsSynced = 0, filesSynced = 0;
  const errors: string[] = [];

  await updateProgress(supabase, jobId, { created: 0, updated: 0, applicationsSynced: 0, filesSynced: 0, total: payments.length, errors: [] });

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    try {
      let refNbr = payment.ReferenceNbr?.value;
      const type = payment.Type?.value;
      if (!refNbr || !type) continue;

      if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
        refNbr = refNbr.padStart(6, '0');
      }

      const paymentData: any = {
        reference_number: refNbr,
        type: type,
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
      };

      const { data: existing } = await supabase
        .from('acumatica_payments')
        .select('id, status')
        .eq('reference_number', refNbr)
        .eq('type', type)
        .maybeSingle();

      let paymentDbId: number | null = null;

      if (existing) {
        const oldStatus = existing.status;
        const { error } = await supabase.from('acumatica_payments').update(paymentData).eq('reference_number', refNbr).eq('type', type);
        if (error) {
          errors.push(`Update failed for ${refNbr}: ${error.message}`);
        } else {
          updated++;
          paymentDbId = existing.id;
          try {
            await supabase.rpc('log_sync_change', {
              p_sync_type: 'payment',
              p_action_type: oldStatus !== paymentData.status ? 'status_changed' : 'updated',
              p_entity_id: existing.id,
              p_entity_reference: refNbr,
              p_entity_name: `Payment ${refNbr} - $${paymentData.payment_amount || 0}`,
              p_change_summary: oldStatus !== paymentData.status
                ? `Payment ${refNbr} status changed from ${oldStatus} to ${paymentData.status}`
                : `Payment ${refNbr} was updated`,
              p_change_details: { old_status: oldStatus, new_status: paymentData.status, payment_amount: paymentData.payment_amount, available_balance: paymentData.available_balance },
              p_sync_source: 'date_range_sync'
            });
          } catch (_) {}
        }
      } else {
        const { data: inserted, error } = await supabase.from('acumatica_payments').insert(paymentData).select('id').single();
        if (error) {
          errors.push(`Insert failed for ${refNbr}: ${error.message}`);
        } else {
          created++;
          if (inserted) {
            paymentDbId = inserted.id;
            try {
              await supabase.rpc('log_sync_change', {
                p_sync_type: 'payment',
                p_action_type: 'created',
                p_entity_id: inserted.id,
                p_entity_reference: refNbr,
                p_entity_name: `Payment ${refNbr} - $${paymentData.payment_amount || 0}`,
                p_change_summary: `New payment ${refNbr} was created`,
                p_change_details: { status: paymentData.status, payment_amount: paymentData.payment_amount, available_balance: paymentData.available_balance },
                p_sync_source: 'date_range_sync'
              });
            } catch (_) {}
          }
        }
      }

      if (paymentData.status === 'Voided' && type === 'Payment' && paymentDbId) {
        const { data: voidedExists } = await supabase
          .from('acumatica_payments')
          .select('id')
          .eq('reference_number', refNbr)
          .eq('type', 'Voided Payment')
          .maybeSingle();

        if (!voidedExists) {
          try {
            const voidedPaymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/Voided Payment/${encodeURIComponent(refNbr)}?$expand=ApplicationHistory,files`;
            const voidedResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, voidedPaymentUrl);
            if (voidedResponse.ok) {
              const voidedPayment = await voidedResponse.json();
              const voidedPaymentData: any = {
                reference_number: refNbr,
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
              const { error: voidedError } = await supabase.from('acumatica_payments').insert(voidedPaymentData).select('id').single();
              if (!voidedError) created++;
            }
          } catch (voidedError: any) {
            console.error(`[payment-sync] Error fetching voided payment for ${refNbr}:`, voidedError.message);
          }
        }
      }

      if (paymentDbId) {
        let applicationHistory: any[] = [];
        try {
          const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(refNbr)}?$expand=ApplicationHistory,files`;
          const detailResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, directUrl);

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            if (detailData.ApplicationHistory && Array.isArray(detailData.ApplicationHistory)) {
              applicationHistory = detailData.ApplicationHistory;
            }

            if (detailData.files && Array.isArray(detailData.files) && detailData.files.length > 0) {
              for (const file of detailData.files) {
                const fileId = file.id?.value || file.id;
                const fileName = file.filename?.value || file.filename || file.name?.value || file.name;
                if (!fileId || !fileName) continue;

                try {
                  const fileUrl = `${acumaticaUrl}/(W(2))/Frames/GetFile.ashx?fileID=${fileId}`;
                  const fileResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, fileUrl);
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

                      filesSynced++;

                      try {
                        await supabase.rpc('log_sync_change', {
                          p_sync_type: 'payment_attachment',
                          p_action_type: 'attachment_fetched',
                          p_entity_id: paymentDbId,
                          p_entity_reference: refNbr,
                          p_entity_name: `Attachment: ${cleanFileName}`,
                          p_change_summary: `Fetched attachment ${cleanFileName} for payment ${refNbr}`,
                          p_change_details: { payment_ref: refNbr, file_name: cleanFileName, file_size: fileBlob.byteLength },
                          p_sync_source: 'date_range_sync'
                        });
                      } catch (_) {}
                    }
                  }
                } catch (fileError: any) {
                  console.error(`[payment-sync] File sync error for ${fileName}:`, fileError.message);
                }
              }
            }
          }
        } catch (historyError: any) {
          console.error(`[payment-sync] ApplicationHistory error for ${refNbr}:`, historyError.message);
        }

        if (applicationHistory.length > 0) {
          for (const app of applicationHistory) {
            let invoiceRefNbr = app.DisplayRefNbr?.value || app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;
            const amountPaid = app.AmountPaid?.value;
            const appDate = app.ApplicationDate?.value || app.Date?.value;
            const docType = app.DisplayDocType?.value || app.DocType?.value || app.AdjustedDocType?.value || 'Invoice';

            if (!invoiceRefNbr) continue;

            if (/^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
              invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
            }

            const { data: invoiceExists } = await supabase
              .from('acumatica_invoices')
              .select('id')
              .eq('reference_number', invoiceRefNbr)
              .maybeSingle();

            if (!invoiceExists && docType === 'Invoice') {
              await fetchAndUpsertMissingInvoice(supabase, sessionManager, credentialsObj, invoiceRefNbr);
            }

            try {
              await supabase
                .from('payment_invoice_applications')
                .upsert({
                  payment_id: paymentDbId,
                  payment_reference_number: refNbr,
                  invoice_reference_number: invoiceRefNbr,
                  customer_id: paymentData.customer_id || '',
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

              applicationsSynced++;

              try {
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment_application',
                  p_action_type: 'application_fetched',
                  p_entity_id: paymentDbId,
                  p_entity_reference: `${refNbr} -> ${invoiceRefNbr}`,
                  p_entity_name: `Application: Payment ${refNbr} to Invoice ${invoiceRefNbr}`,
                  p_change_summary: `Synced application of $${amountPaid || 0} from payment ${refNbr} to invoice ${invoiceRefNbr}`,
                  p_change_details: { payment_ref: refNbr, invoice_ref: invoiceRefNbr, amount_applied: amountPaid, doc_type: docType },
                  p_sync_source: 'date_range_sync'
                });
              } catch (_) {}
            } catch (appError: any) {
              errors.push(`Application sync error ${refNbr} -> ${invoiceRefNbr}: ${appError.message}`);
            }
          }
        }
      }
    } catch (error: any) {
      errors.push(`Error processing payment: ${error.message}`);
    }

    if ((i + 1) % 5 === 0 || i === payments.length - 1) {
      await updateProgress(supabase, jobId, {
        created, updated, applicationsSynced, filesSynced,
        total: payments.length,
        errors: errors.slice(0, 10)
      });
    }
  }

  await supabase.from('async_sync_jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    progress: { created, updated, applicationsSynced, filesSynced, total: payments.length, errors: errors.slice(0, 10) }
  }).eq('id', jobId);

  console.log(`[payment-sync] Completed: ${created} created, ${updated} updated, ${applicationsSynced} apps, ${filesSynced} files, ${errors.length} errors`);
  return { created, updated, applicationsSynced, filesSynced, total: payments.length, errors: errors.length };
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

    console.log(`[payment-sync] Processing job ${jobId} synchronously`);

    const result = await processSync(supabase, sessionManager, jobId, startDate, endDate);

    return new Response(
      JSON.stringify({ success: true, jobId, ...result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[payment-sync] Fatal error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
