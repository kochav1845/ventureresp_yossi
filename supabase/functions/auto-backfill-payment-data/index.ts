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

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current backfill progress
    const { data: progress, error: progressError } = await supabase
      .from('backfill_progress')
      .select('*')
      .eq('backfill_type', 'payment_data')
      .maybeSingle();

    if (progressError || !progress) {
      throw new Error(`Failed to get backfill progress: ${progressError?.message || 'No progress record'}`);
    }

    // Check if already completed
    if (progress.completed_at) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'already_completed',
          message: 'Backfill already completed',
          completedAt: progress.completed_at,
          totalProcessed: progress.items_processed,
          applicationsFound: progress.applications_found,
          attachmentsFound: progress.attachments_found
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Acumatica credentials
    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error(`No active Acumatica credentials found: ${credsError?.message || 'No credentials'}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    const username = credentials.username;
    const password = credentials.password;
    const company = credentials.company || "";
    const branch = credentials.branch || "";

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      throw new Error("Missing Acumatica credentials");
    }

    // Get total count on first run
    if (progress.total_items === 0) {
      const { count } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true });

      await supabase
        .from('backfill_progress')
        .update({
          total_items: count || 0,
          is_running: true,
          started_at: new Date().toISOString()
        })
        .eq('backfill_type', 'payment_data');
    } else {
      // Mark as running
      await supabase
        .from('backfill_progress')
        .update({ is_running: true })
        .eq('backfill_type', 'payment_data');
    }

    // Get payments for this batch - use cursor-based pagination for reliability
    let query = supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, customer_id, payment_amount')
      .order('id', { ascending: true })
      .limit(progress.batch_size);

    // If we have a last processed ID, start after it (cursor-based)
    if (progress.last_processed_id) {
      query = query.gt('id', progress.last_processed_id);
    }

    const { data: allPayments } = await query;

    if (!allPayments || allPayments.length === 0) {
      // No more payments to process - mark as completed
      await supabase
        .from('backfill_progress')
        .update({
          is_running: false,
          completed_at: new Date().toISOString()
        })
        .eq('backfill_type', 'payment_data');

      return new Response(
        JSON.stringify({
          success: true,
          status: 'completed',
          message: "Backfill completed - no more payments to process",
          totalProcessed: progress.items_processed,
          applicationsFound: progress.applications_found,
          attachmentsFound: progress.attachments_found
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Login to Acumatica
    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`[Batch] Logging into Acumatica...`);

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      const errorMsg = `Acumatica login failed: ${loginResponse.status} - ${errorText}`;

      await supabase
        .from('backfill_progress')
        .update({
          is_running: false,
          errors_count: progress.errors_count + 1,
          last_error: errorMsg
        })
        .eq('backfill_type', 'payment_data');

      throw new Error(errorMsg);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No cookies received from Acumatica');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    // Process this batch
    let batchProcessed = 0;
    let batchApps = 0;
    let batchFiles = 0;
    const errors: string[] = [];

    for (const payment of allPayments) {
      try {
        console.log(`[Auto-backfill] Processing payment ${payment.reference_number} (${payment.type})...`);

        // FIRST API CALL: Fetch payment with ApplicationHistory expanded
        const applicationUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.type}/${payment.reference_number}?$expand=ApplicationHistory`;

        console.log(`[Auto-backfill] Fetching applications for ${payment.reference_number}...`);
        const applicationResponse = await fetch(applicationUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cookie": cookies,
          },
        });

        if (!applicationResponse.ok) {
          errors.push(`Failed to fetch applications for ${payment.reference_number}: ${applicationResponse.status}`);
          continue;
        }

        const paymentWithApplications = await applicationResponse.json();

        // Process applications - use ApplicationHistory for closed payments, DocumentsToApply for open ones
        const applications = paymentWithApplications.ApplicationHistory || paymentWithApplications.DocumentsToApply || [];
        console.log(`[Auto-backfill] Found ${applications.length} application(s) for payment ${payment.reference_number}`);
        if (applications && Array.isArray(applications) && applications.length > 0) {
          const applicationRecords = applications
            .filter((app: any) => {
              const docType = app.DocType?.value || app.AdjustedDocType?.value;
              return docType === 'Invoice';
            })
            .map((app: any) => {
              // Handle reference number from either ReferenceNbr or RefNbr
              let invoiceRefNbr = app.ReferenceNbr?.value || app.RefNbr?.value || app.AdjustedRefNbr?.value;
              if (invoiceRefNbr && /^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
                invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
              }

              return {
                payment_id: payment.id,
                payment_reference_number: payment.reference_number,
                customer_id: payment.customer_id,
                doc_type: app.DocType?.value || app.AdjustedDocType?.value || 'Invoice',
                invoice_reference_number: invoiceRefNbr,
                application_period: app.ApplicationPeriod?.value || null,
                amount_paid: app.AmountPaid?.value || 0,
                balance: app.Balance?.value || 0,
                cash_discount_taken: app.CashDiscountTaken?.value || 0,
                post_period: app.PostPeriod?.value || null,
                due_date: app.DueDate?.value || null,
                customer_order: app.CustomerOrder?.value || null,
                // Use ApplicationDate or AdjgDocDate for application date, DocDate for invoice date
                application_date: app.ApplicationDate?.value || app.AdjgDocDate?.value || app.Date?.value || null,
                invoice_date: app.DocDate?.value || app.Date?.value || null,
                description: app.Description?.value || null
              };
            });

          if (applicationRecords.length > 0) {
            const { error: appError } = await supabase
              .from('payment_invoice_applications')
              .upsert(applicationRecords, {
                onConflict: 'payment_id,invoice_reference_number'
              });

            if (!appError) {
              batchApps += applicationRecords.length;
              console.log(`[Auto-backfill] ✓ Saved ${applicationRecords.length} application(s) for payment ${payment.reference_number}`);

              for (const app of applicationRecords) {
                console.log(`[Auto-backfill]   - Invoice ${app.invoice_reference_number}: $${app.amount_paid}`);
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment_application',
                  p_action_type: 'application_fetched',
                  p_entity_id: payment.id,
                  p_entity_reference: `${payment.reference_number} -> ${app.invoice_reference_number}`,
                  p_entity_name: `Auto-backfill: Payment ${payment.reference_number} to Invoice ${app.invoice_reference_number}`,
                  p_change_summary: `Auto-backfilled application of $${app.amount_paid}`,
                  p_change_details: {
                    payment_ref: payment.reference_number,
                    invoice_ref: app.invoice_reference_number,
                    amount_paid: app.amount_paid,
                    application_date: app.application_date,
                    source: 'auto_backfill'
                  },
                  p_sync_source: 'auto_backfill'
                });
              }
            } else {
              console.log(`[Auto-backfill] ✗ Error saving applications for ${payment.reference_number}: ${appError.message}`);
              errors.push(`Failed to save applications for ${payment.reference_number}: ${appError.message}`);
            }
          }
        } else {
          console.log(`[Auto-backfill] No applications found for payment ${payment.reference_number}`);
        }

        // SECOND API CALL: Fetch payment attachments with files expanded
        console.log(`[Auto-backfill] Fetching attachments for ${payment.reference_number}...`);
        const filesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.type}/${payment.reference_number}?$expand=files`;

        const filesResponse = await fetch(filesUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cookie": cookies,
          },
        });

        if (!filesResponse.ok) {
          console.log(`[Auto-backfill] Failed to fetch files for ${payment.reference_number}: ${filesResponse.status}`);
          errors.push(`Failed to fetch files for ${payment.reference_number}: ${filesResponse.status}`);
          batchProcessed++;
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }

        const paymentWithFiles = await filesResponse.json();

        // Process attachments
        const files = paymentWithFiles.files || paymentWithFiles.Files || [];
        console.log(`[Auto-backfill] Found ${files.length} attachment(s) for payment ${payment.reference_number}`);
        if (Array.isArray(files) && files.length > 0) {
          for (const file of files) {
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
                const storagePath = `payments/${payment.reference_number}/${new Date().toISOString().replace(/[:.]/g, '-')}-${cleanFileName}`;

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
                      payment_reference_number: payment.reference_number,
                      file_name: cleanFileName,
                      file_type: fileResponse.headers.get('content-type') || 'application/octet-stream',
                      file_size: fileBlob.byteLength,
                      storage_path: storagePath,
                      file_id: fileId,
                      is_check_image: isCheckImage,
                    }, {
                      onConflict: 'payment_reference_number,file_id'
                    });

                  batchFiles++;
                  console.log(`[Auto-backfill] ✓ Saved attachment ${cleanFileName} (${fileBlob.byteLength} bytes)`);

                  await supabase.rpc('log_sync_change', {
                    p_sync_type: 'payment_attachment',
                    p_action_type: 'attachment_fetched',
                    p_entity_id: payment.id,
                    p_entity_reference: payment.reference_number,
                    p_entity_name: `Auto-backfill: ${cleanFileName}`,
                    p_change_summary: `Auto-backfilled attachment ${cleanFileName}`,
                    p_change_details: {
                      payment_ref: payment.reference_number,
                      file_name: cleanFileName,
                      file_size: fileBlob.byteLength,
                      is_check_image: isCheckImage,
                      source: 'auto_backfill'
                    },
                    p_sync_source: 'auto_backfill'
                  });
                } else {
                  console.log(`[Auto-backfill] ✗ Failed to upload ${cleanFileName}: ${uploadError.message}`);
                  errors.push(`Upload error for ${cleanFileName}: ${uploadError.message}`);
                }
              } else {
                console.log(`[Auto-backfill] ✗ Failed to download file from Acumatica (status: ${fileResponse.status})`);
              }
            } catch (fileError: any) {
              console.log(`[Auto-backfill] ✗ File error for ${payment.reference_number}: ${fileError.message}`);
              errors.push(`File error for ${payment.reference_number}: ${fileError.message}`);
            }
          }
        } else {
          console.log(`[Auto-backfill] No attachments found for payment ${payment.reference_number}`);
        }

        batchProcessed++;
        console.log(`[Auto-backfill] ✓ Completed processing payment ${payment.reference_number}\n`);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error: any) {
        console.log(`[Auto-backfill] ✗ Error processing ${payment.reference_number}: ${error.message}`);
        errors.push(`Error processing ${payment.reference_number}: ${error.message}`);
      }
    }

    // Logout from Acumatica
    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    // Update progress with cursor tracking
    const newProcessed = progress.items_processed + batchProcessed;
    const newApps = progress.applications_found + batchApps;
    const newFiles = progress.attachments_found + batchFiles;
    const lastProcessedId = allPayments[allPayments.length - 1].id;

    console.log(`\n[Auto-backfill] ========== BATCH SUMMARY ==========`);
    console.log(`[Auto-backfill] Payments processed: ${batchProcessed}`);
    console.log(`[Auto-backfill] Applications found: ${batchApps}`);
    console.log(`[Auto-backfill] Attachments found: ${batchFiles}`);
    console.log(`[Auto-backfill] Errors: ${errors.length}`);
    console.log(`[Auto-backfill] Overall progress: ${newProcessed}/${progress.total_items} (${Math.round((newProcessed / progress.total_items) * 100)}%)`);
    console.log(`[Auto-backfill] Last processed ID: ${lastProcessedId}`);
    console.log(`[Auto-backfill] ===================================\n`);

    await supabase
      .from('backfill_progress')
      .update({
        items_processed: newProcessed,
        applications_found: newApps,
        attachments_found: newFiles,
        last_processed_id: lastProcessedId,
        errors_count: progress.errors_count + errors.length,
        last_error: errors.length > 0 ? errors[errors.length - 1] : null,
        last_batch_at: new Date().toISOString(),
        is_running: false
      })
      .eq('backfill_type', 'payment_data');

    const duration = Date.now() - startTime;
    const percentComplete = Math.round((newProcessed / progress.total_items) * 100);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'in_progress',
        batch: {
          processed: batchProcessed,
          applicationsFound: batchApps,
          filesFound: batchFiles,
          errors: errors.length
        },
        overall: {
          totalItems: progress.total_items,
          itemsProcessed: newProcessed,
          applicationsFound: newApps,
          attachmentsFound: newFiles,
          percentComplete,
          remaining: progress.total_items - newProcessed
        },
        timing: {
          durationMs: duration
        },
        nextRun: 'Will run again in 1 minute'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Fatal error:', err);

    // Try to update progress with error
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from('backfill_progress')
        .update({
          is_running: false,
          last_error: err.message
        })
        .eq('backfill_type', 'payment_data');
    } catch {}

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
