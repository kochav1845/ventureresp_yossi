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

    const requestBody = await req.json().catch(() => ({}));
    const { batchSize = 20, skip = 0 } = requestBody;

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

    const { data: allPayments } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, customer_id, payment_amount')
      .order('reference_number', { ascending: true });

    if (!allPayments || allPayments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No payments found in database", processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paymentsToProcess = allPayments.slice(skip, skip + batchSize);

    if (paymentsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All payments processed",
          total: allPayments.length,
          processed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`Logging into Acumatica...`);

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Acumatica login failed: ${loginResponse.status} - ${errorText}`);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No cookies received from Acumatica');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    console.log('Login successful');

    let processed = 0;
    let applicationsFound = 0;
    let filesFound = 0;
    const errors: string[] = [];
    const results: any[] = [];

    for (const payment of paymentsToProcess) {
      try {
        console.log(`Processing payment ${payment.reference_number} (${processed + 1}/${paymentsToProcess.length})...`);

        const detailUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.type}/${payment.reference_number}?$expand=files`;

        const detailResponse = await fetch(detailUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cookie": cookies,
          },
        });

        if (!detailResponse.ok) {
          const errorText = await detailResponse.text();
          errors.push(`Failed to fetch ${payment.reference_number}: ${detailResponse.status}`);
          console.error(`Failed to fetch payment ${payment.reference_number}: ${errorText}`);
          continue;
        }

        const paymentDetail = await detailResponse.json();
        let appsCount = 0;
        let attachCount = 0;

        const applications = paymentDetail.ApplicationHistory;
        if (applications && Array.isArray(applications) && applications.length > 0) {
          console.log(`Found ${applications.length} applications for payment ${payment.reference_number}`);

          const applicationRecords = applications
            .filter((app: any) => {
              const docType = app.DocType?.value || app.AdjustedDocType?.value;
              return docType === 'Invoice';
            })
            .map((app: any) => {
              let invoiceRefNbr = app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;
              if (invoiceRefNbr && /^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
                invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
              }

              return {
                payment_id: payment.id,
                payment_reference_number: payment.reference_number,
                doc_type: app.DocType?.value || app.AdjustedDocType?.value || 'Invoice',
                invoice_reference_number: invoiceRefNbr,
                application_period: app.ApplicationPeriod?.value || null,
                status: app.Status?.value || null,
                amount_paid: app.AmountPaid?.value || 0,
                balance: app.Balance?.value || 0,
                cash_discount_taken: app.CashDiscountTaken?.value || 0,
                post_period: app.PostPeriod?.value || null,
                due_date: app.DueDate?.value || null,
                customer_order: app.CustomerOrder?.value || null,
                application_date: app.ApplicationDate?.value || app.Date?.value || null,
                invoice_date: app.Date?.value || null,
                description: app.Description?.value || null
              };
            });

          if (applicationRecords.length > 0) {
            const { error: appError } = await supabase
              .from('payment_invoice_applications')
              .upsert(applicationRecords, {
                onConflict: 'payment_id,invoice_reference_number'
              });

            if (appError) {
              errors.push(`Failed to save applications for ${payment.reference_number}: ${appError.message}`);
              console.error(`Error saving applications:`, appError);
            } else {
              appsCount = applicationRecords.length;
              applicationsFound += appsCount;

              for (const app of applicationRecords) {
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment_application',
                  p_action_type: 'application_fetched',
                  p_entity_id: payment.id,
                  p_entity_reference: `${payment.reference_number} -> ${app.invoice_reference_number}`,
                  p_entity_name: `Application: Payment ${payment.reference_number} to Invoice ${app.invoice_reference_number}`,
                  p_change_summary: `Backfilled application of $${app.amount_paid} from payment ${payment.reference_number} to invoice ${app.invoice_reference_number}`,
                  p_change_details: {
                    payment_ref: payment.reference_number,
                    invoice_ref: app.invoice_reference_number,
                    amount_paid: app.amount_paid,
                    application_date: app.application_date,
                    source: 'backfill'
                  },
                  p_sync_source: 'manual_backfill'
                });
              }
            }
          }
        }

        const files = paymentDetail.files || paymentDetail.Files || [];
        if (Array.isArray(files) && files.length > 0) {
          console.log(`Found ${files.length} files for payment ${payment.reference_number}`);

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

                  attachCount++;
                  filesFound++;

                  await supabase.rpc('log_sync_change', {
                    p_sync_type: 'payment_attachment',
                    p_action_type: 'attachment_fetched',
                    p_entity_id: payment.id,
                    p_entity_reference: payment.reference_number,
                    p_entity_name: `Attachment: ${cleanFileName}`,
                    p_change_summary: `Backfilled attachment ${cleanFileName} for payment ${payment.reference_number}`,
                    p_change_details: {
                      payment_ref: payment.reference_number,
                      file_name: cleanFileName,
                      file_size: fileBlob.byteLength,
                      is_check_image: isCheckImage,
                      source: 'backfill'
                    },
                    p_sync_source: 'manual_backfill'
                  });
                }
              }
            } catch (fileError: any) {
              console.error(`Failed to process file ${fileName}:`, fileError.message);
              errors.push(`File error for ${payment.reference_number} - ${fileName}: ${fileError.message}`);
            }
          }
        }

        results.push({
          payment: payment.reference_number,
          applications: appsCount,
          files: attachCount
        });

        processed++;

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error: any) {
        errors.push(`Error processing ${payment.reference_number}: ${error.message}`);
        console.error(`Error processing payment ${payment.reference_number}:`, error);
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    const duration = Date.now() - startTime;
    const remaining = allPayments.length - (skip + processed);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        applicationsFound,
        filesFound,
        totalPayments: allPayments.length,
        remaining,
        nextSkip: skip + batchSize,
        batchSize,
        progress: `${skip + processed}/${allPayments.length} (${Math.round(((skip + processed) / allPayments.length) * 100)}%)`,
        errors: errors.slice(0, 10),
        totalErrors: errors.length,
        durationMs: duration,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});