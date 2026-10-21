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

    // ── AuthZ: admin only ───────────────────────────────────────────────
    // This endpoint rewrites every payment-to-invoice link in the database and
    // had NO caller check with verify_jwt off, so an unauthenticated POST could
    // destroy all 29,326 rows. Same guard the other hardened functions use.
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data: { user: caller } } = await anonClient.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: callerProfile } = await supabase
      .from("user_profiles").select("role, account_status").eq("id", caller.id).maybeSingle();
    if (!callerProfile || callerProfile.account_status !== "approved" || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const requestBody = await req.json().catch(() => ({}));
    const {
      batchSize = 50,
      skip = 0
    } = requestBody;

    // `clearFirst` is gone on purpose. It deleted EVERY row of
    // payment_invoice_applications up front, then this run rebuilt only the
    // payments in its own batch -- so a single call left the table almost
    // empty and reported success. It bought nothing either: the batch loop
    // below already deletes each payment's own rows immediately before
    // reinserting them, which is the correct, non-destructive scope.

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

    // Paginated: PostgREST caps a response at 1000 rows and there are ~48,836
    // payments, so the unpaged select made totalPayments read 1000 and the
    // run report "complete" after covering 2% of the book.
    const allPayments: any[] = [];
    {
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error: paymentsError } = await supabase
          .from('acumatica_payments')
          .select('id, reference_number, type, customer_id')
          .order('reference_number', { ascending: true })
          .range(from, from + PAGE - 1);
        if (paymentsError) {
          throw new Error(`Failed to fetch payments: ${paymentsError.message}`);
        }
        const batch = data || [];
        allPayments.push(...batch);
        if (batch.length < PAGE) break;
      }
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

          const applicationRecords = [];
          for (const app of applications) {
            let refNbr = app.ReferenceNbr?.value || app.AdjustedRefNbr?.value || app.DisplayRefNbr?.value;
            let wasPadded = false;
            if (refNbr && /^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
              refNbr = refNbr.padStart(6, '0');
              wasPadded = true;
            }

            const docType = app.DocType?.value || app.AdjustedDocType?.value || app.DisplayDocType?.value || 'Unknown';
            const appCustomerId = app.Customer?.value || payment.customer_id || '';

            // Check for reference number collision only when padding occurred
            if (wasPadded && refNbr && appCustomerId) {
              const { data: inv } = await supabase
                .from('acumatica_invoices')
                .select('customer')
                .eq('reference_number', refNbr)
                .maybeSingle();
              if (inv && inv.customer && inv.customer !== appCustomerId) {
                console.warn(`[RESYNC] Skipping collision: payment ${payment.reference_number} (customer ${appCustomerId}) -> invoice ${refNbr} (customer ${inv.customer})`);
                continue;
              }
            }

            if (docType === 'Invoice') invoiceCount++;
            else if (docType === 'Credit Memo' || docType === 'CreditMemo') creditMemoCount++;
            else otherCount++;

            applicationRecords.push({
              payment_id: payment.id,
              payment_reference_number: payment.reference_number,
              customer_id: appCustomerId,
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
            });
          }

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