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
    console.log("=== Payment Bulk Fetch Started ===");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let body;
    try {
      body = await req.json();
    } catch (e) {
      throw new Error("Invalid JSON in request body");
    }

    const {
      count = 50,
      skip = 0,
      docType = 'Payment',
      fetchNewestFirst = true,
      fetchApplicationHistory = true
    } = body;

    // Block fetching credit memos
    if (docType === 'Credit Memo') {
      throw new Error("Credit memos are not supported. Only 'Payment' and 'Prepayment' types are allowed.");
    }

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

    console.log('Using credentials from database:', {
      url: acumaticaUrl,
      username,
      hasPassword: !!password
    });

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    console.log(`Config: count=${count}, skip=${skip}, type=${docType}, fetchHistory=${fetchApplicationHistory}`);

    if (!acumaticaUrl || !username || !password) {
      throw new Error("Missing Acumatica credentials");
    }

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`Logging into Acumatica at ${acumaticaUrl}...`);

    let loginResponse;
    let loginAttempts = 0;
    const maxLoginAttempts = 3;

    while (loginAttempts < maxLoginAttempts) {
      try {
        loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loginBody),
        });

        if (loginResponse.ok) {
          break;
        }

        const errorText = await loginResponse.text();
        console.warn(`Login attempt ${loginAttempts + 1} failed: ${loginResponse.status} - ${errorText}`);

        if (loginResponse.status === 500 && loginAttempts < maxLoginAttempts - 1) {
          const waitTime = Math.pow(2, loginAttempts) * 1000;
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          loginAttempts++;
          continue;
        }

        throw new Error(`Acumatica login failed: ${loginResponse.status} - ${errorText}`);
      } catch (error) {
        if (loginAttempts >= maxLoginAttempts - 1) {
          throw error;
        }
        console.warn(`Login attempt ${loginAttempts + 1} error:`, error);
        const waitTime = Math.pow(2, loginAttempts) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        loginAttempts++;
      }
    }

    if (!loginResponse || !loginResponse.ok) {
      throw new Error(`Acumatica login failed after ${maxLoginAttempts} attempts`);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No cookies received from Acumatica');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    console.log('Login successful');

    const orderBy = fetchNewestFirst ? 'CreatedDateTime desc' : 'CreatedDateTime';
    const url = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$top=${count}&$skip=${skip}&$orderby=${orderBy}&$expand=DocumentsToApply&$filter=Type eq '${docType}'`;

    console.log(`Fetching ${count} payments (skip ${skip})...`);

    const fetchResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      throw new Error(`Failed to fetch payments: ${fetchResponse.status} - ${errorText}`);
    }

    const payments = await fetchResponse.json();
    console.log(`Fetched ${Array.isArray(payments) ? payments.length : 0} payments from Acumatica`);

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    });

    if (!Array.isArray(payments) || payments.length === 0) {
      console.log('No payments to process');
      return new Response(
        JSON.stringify({ success: true, created: 0, updated: 0, skipped: 0, totalFetched: 0, errors: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    const paymentsToProcess: any[] = [];

    for (const payment of payments) {
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

        const paymentData = {
          reference_number: refNbr,
          type: type,
          status: payment.Status?.value || null,
          hold: payment.Hold?.value || false,
          application_date: payment.ApplicationDate?.value || payment.PaymentDate?.value || null,
          payment_amount: payment.PaymentAmount?.value || 0,
          available_balance: payment.UnappliedBalance?.value || 0,
          customer_id: payment.CustomerID?.value || null,
          payment_method: payment.PaymentMethod?.value || null,
          cash_account: payment.CashAccount?.value || null,
          payment_ref: payment.PaymentRef?.value || null,
          description: payment.Description?.value || null,
          currency_id: payment.CurrencyID?.value || 'USD',
          last_modified_datetime: payment.LastModifiedDateTime?.value || null,
          application_history: null,
          applied_to_documents: payment.DocumentsToApply || null,
          raw_data: payment,
        };

        paymentsToProcess.push(paymentData);
      } catch (err: any) {
        errors.push(`Error processing payment: ${err.message}`);
        console.error('Payment processing error:', err);
      }
    }

    if (paymentsToProcess.length > 0) {
      console.log(`Processing ${paymentsToProcess.length} payments...`);

      const referenceNumbers = paymentsToProcess.map(p => p.reference_number);

      const { data: existingPayments } = await supabase
        .from('acumatica_payments')
        .select('reference_number, type')
        .in('reference_number', referenceNumbers);

      const existingSet = new Set(
        (existingPayments || []).map(p => `${p.reference_number}|${p.type}`)
      );

      const newPayments = paymentsToProcess.filter(p =>
        !existingSet.has(`${p.reference_number}|${p.type}`)
      );

      skipped += paymentsToProcess.length - newPayments.length;
      console.log(`Found ${existingSet.size} existing payments, skipping them`);
      console.log(`Inserting ${newPayments.length} new payments`);

      if (newPayments.length > 0) {
        const { data: insertedData, error: insertError } = await supabase
          .from('acumatica_payments')
          .insert(newPayments)
          .select('id');

        if (insertError) {
          console.error('Insert error:', insertError);
          errors.push(`Bulk insert failed: ${insertError.message}`);
        } else {
          const insertedCount = insertedData?.length || 0;
          console.log(`Successfully inserted ${insertedCount} new payments`);
          created = insertedCount;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`=== Bulk Fetch Complete: ${created} created, ${updated} updated, ${skipped} skipped in ${duration}ms ===`);

    return new Response(
      JSON.stringify({
        success: true,
        created,
        updated,
        skipped,
        totalFetched: payments.length,
        errors,
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