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
    const {
      batchSize = 50,
      skip = 0,
      clearFirst = false
    } = requestBody;

    if (clearFirst && skip === 0) {
      console.log("Clearing all existing payment_invoice_applications...");
      const { error: deleteError } = await supabase
        .from('payment_invoice_applications')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) {
        console.error("Error clearing applications:", deleteError.message);
      } else {
        console.log("Cleared all existing applications");
      }
    }

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

    const { data: allPayments, error: paymentsError } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, customer_id')
      .order('reference_number', { ascending: true });

    if (paymentsError || !allPayments) {
      throw new Error(`Failed to fetch payments: ${paymentsError?.message}`);
    }

    const totalPayments = allPayments.length;
    const paymentsToProcess = allPayments.slice(skip, skip + batchSize);

    if (paymentsToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All payments processed",
          totalPayments,
          processed: 0,
          skip,
          complete: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`Logging into Acumatica to process ${paymentsToProcess.length} payments (skip=${skip})...`);

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error(`Acumatica login failed: ${loginResponse.status}`);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No cookies received from Acumatica');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    let processed = 0;
    let totalApplications = 0;
    let invoiceCount = 0;
    let creditMemoCount = 0;
    let otherCount = 0;
    const errors: string[] = [];

    for (const payment of paymentsToProcess) {
      try {
        const detailUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.type}/${payment.reference_number}?$expand=ApplicationHistory`;

        const detailResponse = await fetch(detailUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        if (!detailResponse.ok) {
          errors.push(`Failed to fetch ${payment.reference_number}: ${detailResponse.status}`);
          continue;
        }

        const paymentDetail = await detailResponse.json();
        const applications = paymentDetail.ApplicationHistory || [];

        if (applications.length > 0) {
          await supabase
            .from('payment_invoice_applications')
            .delete()
            .eq('payment_id', payment.id);

          const applicationRecords = applications.map((app: any) => {
            let refNbr = app.ReferenceNbr?.value || app.AdjustedRefNbr?.value || app.DisplayRefNbr?.value;
            if (refNbr && /^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
              refNbr = refNbr.padStart(6, '0');
            }

            const docType = app.DocType?.value || app.AdjustedDocType?.value || app.DisplayDocType?.value || 'Unknown';

            if (docType === 'Invoice') invoiceCount++;
            else if (docType === 'Credit Memo' || docType === 'CreditMemo') creditMemoCount++;
            else otherCount++;

            return {
              payment_id: payment.id,
              payment_reference_number: payment.reference_number,
              customer_id: app.Customer?.value || payment.customer_id || '',
              doc_type: docType,
              invoice_reference_number: refNbr || 'Unknown',
              application_period: app.ApplicationPeriod?.value || null,
              status: app.Status?.value || null,
              amount_paid: app.AmountPaid?.value !== undefined ? parseFloat(app.AmountPaid.value) : 0,
              balance: app.Balance?.value !== undefined ? parseFloat(app.Balance.value) : 0,
              cash_discount_taken: app.CashDiscountTaken?.value !== undefined ? parseFloat(app.CashDiscountTaken.value) : 0,
              post_period: app.PostPeriod?.value || null,
              due_date: app.DueDate?.value || null,
              customer_order: app.CustomerOrder?.value || null,
              application_date: app.ApplicationDate?.value || app.AdjgDocDate?.value || app.Date?.value || null,
              invoice_date: app.DocDate?.value || app.Date?.value || null,
              description: app.Description?.value || null
            };
          });

          const { error: insertError } = await supabase
            .from('payment_invoice_applications')
            .upsert(applicationRecords, {
              onConflict: 'payment_id,invoice_reference_number'
            });

          if (insertError) {
            errors.push(`Insert error for ${payment.reference_number}: ${insertError.message}`);
          } else {
            totalApplications += applicationRecords.length;
          }
        }

        processed++;

        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error: any) {
        errors.push(`Error processing ${payment.reference_number}: ${error.message}`);
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    });

    const duration = Date.now() - startTime;
    const remaining = totalPayments - (skip + processed);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processed} payments, found ${totalApplications} applications`,
        processed,
        totalApplications,
        breakdown: {
          invoices: invoiceCount,
          creditMemos: creditMemoCount,
          other: otherCount
        },
        totalPayments,
        remaining,
        nextSkip: skip + batchSize,
        complete: remaining <= 0,
        durationMs: duration,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined
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