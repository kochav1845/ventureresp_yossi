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

    const requestBody = await req.json();
    const { month, year } = requestBody;

    if (!month || !year) {
      throw new Error("Month and year are required");
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

    if (!acumaticaUrl || !username || !password) {
      throw new Error("Missing Acumatica credentials");
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    console.log(`Fetching payments for ${month}/${year} (${startDate.toISOString()} to ${endDate.toISOString()})`);

    const { count, error: countError } = await supabase
      .from('acumatica_payments')
      .select('*', { count: 'exact', head: true })
      .gte('application_date', startDate.toISOString())
      .lte('application_date', endDate.toISOString());

    const totalPayments = count || 0;

    const { data: payments, error: paymentsError } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, customer_id, customer_name, payment_amount, application_date')
      .gte('application_date', startDate.toISOString())
      .lte('application_date', endDate.toISOString())
      .eq('applications_fetched', false)
      .order('application_date', { ascending: true });

    if (paymentsError) {
      throw new Error(`Failed to fetch payments: ${paymentsError.message}`);
    }

    if (!payments || payments.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "All payments for this month have been processed",
          total_payments: totalPayments,
          processed: 0,
          applicationsFound: 0,
          remaining: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${payments.length} unprocessed payments out of ${totalPayments} total for ${month}/${year}`);

    const TIMEOUT_MS = 120000;
    const timeoutThreshold = startTime + TIMEOUT_MS;

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
    const errors: string[] = [];
    const results: any[] = [];
    let timedOut = false;

    console.log(`Processing all ${payments.length} unprocessed payments...`);

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      if (Date.now() > timeoutThreshold) {
        console.log(`Approaching timeout limit, stopping at ${processed} processed`);
        timedOut = true;
        break;
      }
      try {
        const detailUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.type}/${payment.reference_number}?$expand=ApplicationHistory`;

        console.log(`Fetching details for payment ${payment.reference_number}...`);

        const detailResponse = await fetch(detailUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        if (detailResponse.ok) {
          const paymentDetail = await detailResponse.json();
          const applications = paymentDetail.ApplicationHistory;

          if (applications && Array.isArray(applications) && applications.length > 0) {
            console.log(`Found ${applications.length} applications for payment ${payment.reference_number}`);

            const { error: deleteError } = await supabase
              .from('payment_invoice_applications')
              .delete()
              .eq('payment_id', payment.id);

            if (deleteError) {
              console.error(`Error deleting old applications for ${payment.reference_number}:`, deleteError);
            }

            const applicationRecords = applications.map((app: any) => {
              let refNbr = app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value || app.ReferenceNbr?.value || null;

              if (refNbr && /^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
                refNbr = refNbr.padStart(6, '0');
              }

              const docType = app.DisplayDocType?.value || app.AdjustedDocType?.value || app.DocType?.value || null;

              return {
                payment_id: payment.id,
                payment_reference_number: payment.reference_number,
                doc_type: docType,
                invoice_reference_number: refNbr,
                customer_id: app.Customer?.value || payment.customer_id,
                application_date: app.Date?.value || null,
                application_period: app.ApplicationPeriod?.value || null,
                amount_paid: app.AmountPaid?.value !== undefined ? parseFloat(app.AmountPaid.value) : null,
                balance: app.Balance?.value !== undefined ? parseFloat(app.Balance.value) : null,
                cash_discount_taken: app.CashDiscountTaken?.value !== undefined ? parseFloat(app.CashDiscountTaken.value) : null,
                post_period: app.PostPeriod?.value || null,
                due_date: app.DueDate?.value || null,
                customer_order: app.CustomerOrder?.value || null,
                description: app.Description?.value || null,
                invoice_date: app.Date?.value || null,
              };
            });

            const { error: appError } = await supabase
              .from('payment_invoice_applications')
              .insert(applicationRecords);

            if (appError) {
              errors.push(`Failed to save applications for ${payment.reference_number}: ${appError.message}`);
              console.error(`Error saving applications:`, appError);
            } else {
              applicationsFound += applicationRecords.length;
              results.push({
                payment_ref: payment.reference_number,
                applications_found: applicationRecords.length,
                status: 'success'
              });
            }
          } else {
            console.log(`No applications found for payment ${payment.reference_number}`);
            results.push({
              payment_ref: payment.reference_number,
              applications_found: 0,
              status: 'no_applications'
            });
          }

          await supabase
            .from('acumatica_payments')
            .update({
              applications_fetched: true,
              applications_fetched_at: new Date().toISOString()
            })
            .eq('id', payment.id);

          processed++;
        } else {
          const errorText = await detailResponse.text();
          const errorMsg = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
          errors.push(`Failed to fetch ${payment.reference_number}: ${detailResponse.status} - ${errorMsg}`);
          console.error(`Failed to fetch payment ${payment.reference_number}: ${detailResponse.status} - ${errorText}`);
          results.push({
            payment_ref: payment.reference_number,
            status: 'error',
            error: `HTTP ${detailResponse.status}: ${errorMsg}`
          });

          await supabase
            .from('acumatica_payments')
            .update({
              applications_fetched: true,
              applications_fetched_at: new Date().toISOString()
            })
            .eq('id', payment.id);

          processed++;
        }

        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error: any) {
        errors.push(`Error processing ${payment.reference_number}: ${error.message}`);
        console.error(`Error processing payment ${payment.reference_number}:`, error);
        results.push({
          payment_ref: payment.reference_number,
          status: 'error',
          error: error.message
        });
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    });

    const duration = Date.now() - startTime;

    const { count: remainingCount } = await supabase
      .from('acumatica_payments')
      .select('*', { count: 'exact', head: true })
      .gte('application_date', startDate.toISOString())
      .lte('application_date', endDate.toISOString())
      .eq('applications_fetched', false);

    const remaining = remainingCount || 0;

    return new Response(
      JSON.stringify({
        success: true,
        month,
        year,
        total_payments: totalPayments,
        processed,
        applicationsFound,
        timedOut,
        remaining: remaining,
        errors,
        results,
        durationMs: duration,
        message: remaining > 0
          ? `Processed ${processed} payments. ${remaining} remaining - click button again to continue.`
          : `All ${totalPayments} payments processed successfully!`
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