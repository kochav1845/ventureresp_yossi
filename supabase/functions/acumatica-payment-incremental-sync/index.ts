import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

    const requestBody = await req.json().catch(() => ({}));
    const {
      lookbackMinutes = 2,
      acumaticaUrl: urlFromRequest,
      username: usernameFromRequest,
      password: passwordFromRequest,
      company: companyFromRequest,
      branch: branchFromRequest
    } = requestBody;

    let acumaticaUrl = urlFromRequest;
    let username = usernameFromRequest;
    let password = passwordFromRequest;
    let company = companyFromRequest || "";
    let branch = branchFromRequest || "";

    if (!acumaticaUrl || !username || !password) {
      console.log('Credentials not provided in request, loading from database...');

      const { data: config, error: configError } = await supabase
        .from('acumatica_sync_credentials')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (configError) {
        console.error('Error loading credentials from database:', configError);
      }

      if (config) {
        acumaticaUrl = acumaticaUrl || config.acumatica_url;
        username = username || config.username;
        password = password || config.password;
        company = company || config.company || "";
        branch = branch || config.branch || "";
        console.log('Loaded credentials from database');
      }
    }

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials. Please configure sync settings first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      return new Response(
        JSON.stringify({ error: `Authentication failed: ${errorText}` }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication cookies received" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const filterDate = cutoffTime.toISOString().split('.')[0];

    const paymentsUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$expand=files&$filter=LastModifiedDateTime gt datetimeoffset'${filterDate}' and Type ne 'Credit Memo'`;

    console.log(`Fetching payments modified after ${filterDate} (last ${lookbackMinutes} minutes)`);

    const paymentsResponse = await fetch(paymentsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      },
    });

    if (!paymentsResponse.ok) {
      const errorText = await paymentsResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({ error: `Failed to fetch payments: ${errorText}` }),
        { status: paymentsResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentsData = await paymentsResponse.json();

    const payments = Array.isArray(paymentsData) ? paymentsData : [];

    let created = 0;
    let updated = 0;
    let applicationsSynced = 0;
    let filesSynced = 0;
    const errors: string[] = [];

    console.log(`Processing ${payments.length} payments...`);

    if (payments && payments.length > 0) {
      for (const payment of payments) {
        try {
          let refNbr = payment.ReferenceNbr?.value;
          const type = payment.Type?.value;

          if (!refNbr || !type) {
            continue;
          }

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
            const { error } = await supabase
              .from('acumatica_payments')
              .update(paymentData)
              .eq('reference_number', refNbr)
              .eq('type', type);

            if (error) {
              errors.push(`Update failed for ${refNbr}: ${error.message}`);
            } else {
              updated++;
              paymentDbId = existing.id;
              let actionType = 'updated';
              let changeSummary = `Payment ${refNbr} was updated`;

              if (oldStatus !== paymentData.status) {
                actionType = 'status_changed';
                changeSummary = `Payment ${refNbr} status changed from ${oldStatus} to ${paymentData.status}`;
              }

              await supabase.rpc('log_sync_change', {
                p_sync_type: 'payment',
                p_action_type: actionType,
                p_entity_id: existing.id,
                p_entity_reference: refNbr,
                p_entity_name: `Payment ${refNbr} - $${paymentData.payment_amount || 0}`,
                p_change_summary: changeSummary,
                p_change_details: {
                  old_status: oldStatus,
                  new_status: paymentData.status,
                  payment_amount: paymentData.payment_amount,
                  available_balance: paymentData.available_balance
                },
                p_sync_source: 'scheduled_sync'
              });
            }
          } else {
            const { data: inserted, error } = await supabase
              .from('acumatica_payments')
              .insert(paymentData)
              .select('id')
              .single();

            if (error) {
              errors.push(`Insert failed for ${refNbr}: ${error.message}`);
            } else {
              created++;
              if (inserted) {
                paymentDbId = inserted.id;
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment',
                  p_action_type: 'created',
                  p_entity_id: inserted.id,
                  p_entity_reference: refNbr,
                  p_entity_name: `Payment ${refNbr} - $${paymentData.payment_amount || 0}`,
                  p_change_summary: `New payment ${refNbr} was created`,
                  p_change_details: {
                    status: paymentData.status,
                    payment_amount: paymentData.payment_amount,
                    available_balance: paymentData.available_balance
                  },
                  p_sync_source: 'scheduled_sync'
                });
              }
            }
          }

          let applicationHistory: any[] = [];
          if (paymentDbId) {
            try {
              const paymentDetailUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$expand=ApplicationHistory&$filter=ReferenceNbr eq '${refNbr}' and Type eq '${type}'`;
              const detailResponse = await fetch(paymentDetailUrl, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  "Accept": "application/json",
                  "Cookie": cookies,
                },
              });

              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (Array.isArray(detailData) && detailData.length > 0 && detailData[0].ApplicationHistory) {
                  applicationHistory = detailData[0].ApplicationHistory;
                }
              }
            } catch (historyError: any) {
              console.error(`Failed to fetch ApplicationHistory for ${refNbr}:`, historyError.message);
            }
          }

          if (paymentDbId && applicationHistory.length > 0) {
            const applications = applicationHistory;

            console.log(`Processing ${applications.length} applications for payment ${refNbr}`);

            for (const app of applications) {
              let invoiceRefNbr = app.DisplayRefNbr?.value || app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;
              const amountPaid = app.AmountPaid?.value;
              const appDate = app.ApplicationDate?.value || app.Date?.value;
              const docType = app.DisplayDocType?.value || app.DocType?.value || app.AdjustedDocType?.value || 'Invoice';

              if (!invoiceRefNbr) {
                console.warn(`[PAYMENT-SYNC] Skipping application with no reference number for payment ${refNbr}`);
                continue;
              }

              const originalInvoiceRef = invoiceRefNbr;
              if (/^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
                invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
                console.log(`[PAYMENT-SYNC] Normalized invoice ref: ${originalInvoiceRef} -> ${invoiceRefNbr}`);
              }

              const { data: invoiceExists } = await supabase
                .from('acumatica_invoices')
                .select('id, reference_number')
                .eq('reference_number', invoiceRefNbr)
                .maybeSingle();

              if (!invoiceExists && docType === 'Invoice') {
                console.warn(`[PAYMENT-SYNC] WARNING: Invoice ${invoiceRefNbr} does not exist in database yet! Payment ${refNbr} is trying to link to a missing invoice. This may cause display issues.`);
                errors.push(`Invoice ${invoiceRefNbr} not found for payment ${refNbr} application - possible race condition`);
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
                  }, {
                    onConflict: 'payment_id,invoice_reference_number'
                  });

                applicationsSynced++;

                if (invoiceExists) {
                  console.log(`[PAYMENT-SYNC] ✓ Linked payment ${refNbr} to existing invoice ${invoiceRefNbr}`);
                } else {
                  console.log(`[PAYMENT-SYNC] ⚠ Stored application ${refNbr} -> ${invoiceRefNbr}, but invoice not in DB yet`);
                }

                console.log(`Logging application_fetched for ${refNbr} -> ${invoiceRefNbr}`);
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment_application',
                  p_action_type: 'application_fetched',
                  p_entity_id: paymentDbId,
                  p_entity_reference: `${refNbr} -> ${invoiceRefNbr}`,
                  p_entity_name: `Application: Payment ${refNbr} to Invoice ${invoiceRefNbr}`,
                  p_change_summary: `Fetched and synced application of $${amountPaid || 0} from payment ${refNbr} to invoice ${invoiceRefNbr}`,
                  p_change_details: {
                    payment_ref: refNbr,
                    invoice_ref: invoiceRefNbr,
                    amount_applied: amountPaid,
                    application_date: appDate,
                    doc_type: app.DocType?.value || app.AdjustedDocType?.value
                  },
                  p_sync_source: 'scheduled_sync'
                });
                console.log(`Successfully logged application_fetched`);
              } catch (appError: any) {
                console.error(`Failed to sync application ${refNbr} -> ${invoiceRefNbr}:`, appError.message);
                errors.push(`Application sync error for ${refNbr} -> ${invoiceRefNbr}: ${appError.message}`);
              }
            }
          } else if (paymentDbId) {
            try {
              const { data: existingApps } = await supabase
                .from('payment_invoice_applications')
                .select('invoice_reference_number, amount_paid, application_date')
                .eq('payment_id', paymentDbId);

              if (existingApps && existingApps.length > 0) {
                console.log(`Found ${existingApps.length} existing applications for payment ${refNbr}, logging them`);
                for (const app of existingApps) {
                  await supabase.rpc('log_sync_change', {
                    p_sync_type: 'payment_application',
                    p_action_type: 'application_fetched',
                    p_entity_id: paymentDbId,
                    p_entity_reference: `${refNbr} -> ${app.invoice_reference_number}`,
                    p_entity_name: `Application: Payment ${refNbr} to Invoice ${app.invoice_reference_number}`,
                    p_change_summary: `Synced existing application of $${app.amount_paid || 0} from payment ${refNbr} to invoice ${app.invoice_reference_number}`,
                    p_change_details: {
                      payment_ref: refNbr,
                      invoice_ref: app.invoice_reference_number,
                      amount_paid: app.amount_paid,
                      application_date: app.application_date,
                      source: 'existing_db_record'
                    },
                    p_sync_source: 'scheduled_sync'
                  });
                  applicationsSynced++;
                }
              }
            } catch (dbAppError: any) {
              console.error(`Failed to log existing applications for ${refNbr}:`, dbAppError.message);
            }
          }

          if (payment.files && Array.isArray(payment.files) && payment.files.length > 0) {
            console.log(`Processing ${payment.files.length} files for payment ${refNbr}`);

            for (const file of payment.files) {
              const fileId = file.id?.value || file.id;
              const fileName = file.filename?.value || file.filename || file.name?.value || file.name;

              if (!fileId || !fileName) continue;

              try {
                const fileUrl = `${acumaticaUrl}/(W(2))/Frames/GetFile.ashx?fileID=${fileId}`;
                const fileResponse = await fetch(fileUrl, {
                  headers: { "Cookie": cookies },
                });

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
                      }, {
                        onConflict: 'payment_reference_number,file_id'
                      });

                    filesSynced++;
                    console.log(`Synced file ${cleanFileName} for payment ${refNbr}`);

                    console.log(`Logging attachment_fetched for ${refNbr} - ${cleanFileName}`);
                    await supabase.rpc('log_sync_change', {
                      p_sync_type: 'payment_attachment',
                      p_action_type: 'attachment_fetched',
                      p_entity_id: paymentDbId,
                      p_entity_reference: refNbr,
                      p_entity_name: `Attachment: ${cleanFileName}`,
                      p_change_summary: `Fetched and synced attachment ${cleanFileName} for payment ${refNbr}`,
                      p_change_details: {
                        payment_ref: refNbr,
                        file_name: cleanFileName,
                        file_size: fileBlob.byteLength,
                        file_type: fileResponse.headers.get('content-type') || 'application/octet-stream',
                        is_check_image: isCheckImage,
                        storage_path: storagePath
                      },
                      p_sync_source: 'scheduled_sync'
                    });
                    console.log(`Successfully logged attachment_fetched`);
                  }
                }
              } catch (fileError: any) {
                console.error(`Failed to sync file ${fileName} for payment ${refNbr}:`, fileError.message);
                errors.push(`File sync error for ${refNbr} - ${fileName}: ${fileError.message}`);
              }
            }
          }
        } catch (error: any) {
          errors.push(`Error processing payment: ${error.message}`);
        }
      }
    }

    try {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
    } catch (logoutError) {
      console.error('Logout error (non-critical):', logoutError);
    }

    const syncResultData = {
      entity_type: 'payment',
      last_successful_sync: new Date().toISOString(),
      status: errors.length === 0 ? 'completed' : 'completed',
      records_synced: payments.length,
      records_updated: updated,
      records_created: created,
      errors: errors.slice(0, 150),
      last_error: errors.length > 0 ? errors[0] : null,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('sync_status')
      .update(syncResultData)
      .eq('entity_type', 'payment');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment sync completed. Found ${payments.length} payments, created ${created}, updated ${updated}, synced ${applicationsSynced} applications, synced ${filesSynced} files`,
        created,
        updated,
        applicationsSynced,
        filesSynced,
        totalFetched: payments.length,
        errors: errors.slice(0, 10),
        totalErrors: errors.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Payment sync error:', error);

    await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
      .from('sync_status')
      .update({
        status: 'failed',
        last_error: error.message,
        retry_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('entity_type', 'payment');

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});