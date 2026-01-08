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
    const {
      batchSize = 50,
      skip = 0,
      onlyWithoutApplications = true,
      syncedAfter = null,
      syncedToday = false
    } = requestBody;

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

    let query = supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, customer_id, customer_name, payment_amount, last_sync_timestamp');

    if (syncedToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('last_sync_timestamp', today.toISOString());
    } else if (syncedAfter) {
      query = query.gte('last_sync_timestamp', syncedAfter);
    }

    if (onlyWithoutApplications) {
      const { data: paymentsWithApps } = await supabase
        .from('payment_invoice_applications')
        .select('payment_id');

      const paymentIdsWithApps = new Set(paymentsWithApps?.map(p => p.payment_id) || []);

      const { data: allPayments } = await query;
      const paymentsWithoutApps = allPayments?.filter(p => !paymentIdsWithApps.has(p.id)) || [];

      console.log(`Found ${paymentsWithoutApps.length} payments without applications`);

      const paymentsToProcess = paymentsWithoutApps.slice(skip, skip + batchSize);

      if (paymentsToProcess.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "No payments to process",
            processed: 0,
            total_without_apps: paymentsWithoutApps.length,
            skip,
            batchSize
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
      const errors: string[] = [];

      for (const payment of paymentsToProcess) {
        try {
          const detailUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.type}/${payment.reference_number}`;

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

              const applicationRecords = applications.map((app: any) => ({
                payment_id: payment.id,
                payment_reference_number: payment.reference_number,
                doc_type: app.DocType?.value || null,
                invoice_reference_number: app.ReferenceNbr?.value || null,
                application_period: app.ApplicationPeriod?.value || null,
                status: app.Status?.value || null,
                amount_paid: app.AmountPaid?.value !== undefined ? parseFloat(app.AmountPaid.value) : null,
                balance: app.Balance?.value !== undefined ? parseFloat(app.Balance.value) : null,
                customer_order: app.CustomerOrder?.value || null,
                invoice_date: app.Date?.value || null,
                raw_data: app,
              }));

              const { error: appError } = await supabase
                .from('payment_invoice_applications')
                .upsert(applicationRecords, {
                  onConflict: 'payment_id,invoice_reference_number',
                  ignoreDuplicates: false
                });

              if (appError) {
                errors.push(`Failed to save applications for ${payment.reference_number}: ${appError.message}`);
                console.error(`Error saving applications:`, appError);
              } else {
                applicationsFound += applicationRecords.length;
              }
            } else {
              console.log(`No applications found for payment ${payment.reference_number}`);
            }

            processed++;
          } else {
            const errorText = await detailResponse.text();
            errors.push(`Failed to fetch ${payment.reference_number}: ${detailResponse.status}`);
            console.error(`Failed to fetch payment ${payment.reference_number}: ${detailResponse.status} - ${errorText}`);
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          errors.push(`Error processing ${payment.reference_number}: ${error.message}`);
          console.error(`Error processing payment ${payment.reference_number}:`, error);
        }
      }

      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': cookies },
      });

      const duration = Date.now() - startTime;

      return new Response(
        JSON.stringify({
          success: true,
          processed,
          applicationsFound,
          total_without_apps: paymentsWithoutApps.length,
          remaining: paymentsWithoutApps.length - (skip + processed),
          nextSkip: skip + batchSize,
          batchSize,
          errors,
          durationMs: duration
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: "Invalid configuration" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Fatal error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});