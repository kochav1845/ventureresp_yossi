import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

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
    console.log("=== Fetch All Prepayments Started ===");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error(`No active Acumatica credentials found: ${credsError?.message || 'No credentials in database'}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    const username = credentials.username;
    const password = credentials.password;
    const company = credentials.company || "";
    const branch = credentials.branch || "";

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const creds = { acumaticaUrl, username, password, company, branch };

    console.log('Getting Acumatica session...');
    const sessionCookie = await sessionManager.getSession(creds);
    console.log('Session obtained successfully');

    let allPrepayments: any[] = [];
    let skip = 0;
    const batchSize = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$top=${batchSize}&$skip=${skip}&$orderby=CreatedDateTime desc&$filter=Type eq 'Prepayment'`;

      console.log(`Fetching prepayments batch: skip=${skip}, top=${batchSize}...`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': sessionCookie,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch prepayments: ${response.status} - ${errorText}`);
      }

      const prepayments = await response.json();

      if (!Array.isArray(prepayments) || prepayments.length === 0) {
        hasMore = false;
        console.log(`No more prepayments found at skip=${skip}`);
      } else {
        allPrepayments = allPrepayments.concat(prepayments);
        console.log(`Fetched ${prepayments.length} prepayments (total: ${allPrepayments.length})`);
        skip += batchSize;

        if (prepayments.length < batchSize) {
          hasMore = false;
        }
      }
    }

    console.log(`Total prepayments fetched from Acumatica: ${allPrepayments.length}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const payment of allPrepayments) {
      try {
        let refNbr = payment.ReferenceNbr?.value;
        const type = payment.Type?.value;

        if (!refNbr || !type) {
          skipped++;
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
          currency_id: payment.CurrencyID?.value || 'USD',
          last_modified_datetime: payment.LastModifiedDateTime?.value || null,
          raw_data: payment,
          last_sync_timestamp: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('acumatica_payments')
          .select('id')
          .eq('reference_number', refNbr)
          .eq('type', type)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('acumatica_payments')
            .update(paymentData)
            .eq('reference_number', refNbr)
            .eq('type', type);

          if (error) {
            errors.push(`Update failed for ${refNbr}: ${error.message}`);
          } else {
            updated++;
            console.log(`Updated prepayment ${refNbr}`);
          }
        } else {
          const { error } = await supabase
            .from('acumatica_payments')
            .insert(paymentData);

          if (error) {
            errors.push(`Insert failed for ${refNbr}: ${error.message}`);
          } else {
            created++;
            console.log(`Created prepayment ${refNbr}`);
          }
        }

        let paymentDbId: number | null = null;
        const { data: paymentRecord } = await supabase
          .from('acumatica_payments')
          .select('id')
          .eq('reference_number', refNbr)
          .eq('type', type)
          .maybeSingle();

        if (paymentRecord) {
          paymentDbId = paymentRecord.id;
        }

        if (paymentDbId) {
          try {
            const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(refNbr)}?$expand=ApplicationHistory`;
            console.log(`[APP-HISTORY] Fetching ApplicationHistory for Prepayment ${refNbr}`);

            const detailResponse = await sessionManager.makeAuthenticatedRequest(creds, directUrl);

            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              let applicationHistory: any[] = [];

              if (detailData.ApplicationHistory && Array.isArray(detailData.ApplicationHistory)) {
                applicationHistory = detailData.ApplicationHistory;
              }

              if (applicationHistory.length > 0) {
                console.log(`[APP-HISTORY] Found ${applicationHistory.length} applications for ${refNbr}`);

                for (const app of applicationHistory) {
                  let invoiceRefNbr = app.DisplayRefNbr?.value || app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;
                  const amountPaid = app.AmountPaid?.value;
                  const appDate = app.ApplicationDate?.value || app.Date?.value;
                  const docType = app.DisplayDocType?.value || app.DocType?.value || app.AdjustedDocType?.value || 'Invoice';

                  if (!invoiceRefNbr) continue;

                  if (/^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
                    invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
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

                    console.log(`[APP-HISTORY] Linked prepayment ${refNbr} to invoice ${invoiceRefNbr}`);
                  } catch (appError: any) {
                    console.error(`Failed to sync application ${refNbr} -> ${invoiceRefNbr}:`, appError.message);
                  }
                }
              }
            }
          } catch (historyError: any) {
            console.error(`[APP-HISTORY] Error fetching ApplicationHistory for ${refNbr}:`, historyError.message);
          }
        }
      } catch (err: any) {
        errors.push(`Error processing prepayment: ${err.message}`);
        console.error('Prepayment processing error:', err);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`=== Fetch All Prepayments Complete: ${created} created, ${updated} updated, ${skipped} skipped in ${duration}ms ===`);

    return new Response(
      JSON.stringify({
        success: true,
        created,
        updated,
        skipped,
        totalFetched: allPrepayments.length,
        errors: errors.slice(0, 20),
        totalErrors: errors.length,
        durationMs: duration,
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
