import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_PAYMENTS_PER_RUN = 50;
const REQUEST_TIMEOUT = 55000;

async function getAcumaticaSession(supabase: any, acumaticaUrl: string, credentials: any): Promise<string> {
  const { data: cachedSession } = await supabase
    .from('acumatica_session_cache')
    .select('session_id')
    .eq('is_active', true)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    console.log('Using cached session cookies');
    return cachedSession.session_id;
  }

  console.log('No valid cached session, logging in...');
  const loginBody: any = {
    name: credentials.username,
    password: credentials.password,
  };
  if (credentials.company) loginBody.company = credentials.company;
  if (credentials.branch) loginBody.branch = credentials.branch;

  const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    throw new Error(`Authentication failed: ${errorText}`);
  }

  const setCookieHeader = loginResponse.headers.get('set-cookie');
  if (!setCookieHeader) {
    throw new Error('No authentication cookies received');
  }

  const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 2);

  await supabase
    .from('acumatica_session_cache')
    .update({ is_active: false })
    .eq('is_active', true);

  await supabase
    .from('acumatica_session_cache')
    .insert({
      session_id: cookies,
      expires_at: expiresAt.toISOString(),
      is_active: true,
    });

  console.log('Logged in and cached session');
  return cookies;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: 'Start and end dates are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Resyncing payments from ${startDate} to ${endDate}`);

    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      console.error('Credentials error:', credError);
      throw new Error('Acumatica credentials not configured');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const cookies = await getAcumaticaSession(supabase, acumaticaUrl, credentials);

    console.log(`Querying payments between ${startDate} and ${endDate}...`);

    // First, get the count
    const { count: totalInRange } = await supabase
      .from('acumatica_payments')
      .select('*', { count: 'exact', head: true })
      .gte('application_date', startDate)
      .lte('application_date', endDate);

    console.log(`Found ${totalInRange || 0} total payments in date range`);

    if (!totalInRange || totalInRange === 0) {
      return new Response(
        JSON.stringify({
          totalProcessed: 0,
          successCount: 0,
          errorCount: 0,
          duration: ((Date.now() - startTime) / 1000).toFixed(1) + 's',
          statusChanges: [],
          errors: [],
          message: `No payments found in date range ${startDate} to ${endDate}`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit to prevent timeouts
    const limitedCount = Math.min(totalInRange, MAX_PAYMENTS_PER_RUN);

    const { data: payments, error: queryError } = await supabase
      .from('acumatica_payments')
      .select('reference_number, customer_name, status, application_date')
      .gte('application_date', startDate)
      .lte('application_date', endDate)
      .order('application_date', { ascending: true })
      .limit(limitedCount);

    if (queryError) {
      console.error('Query error:', queryError);
      throw new Error(`Database query failed: ${queryError.message}`);
    }

    console.log(`Processing ${payments?.length || 0} payments (limited from ${totalInRange})`);

    const results = {
      totalProcessed: payments.length,
      successCount: 0,
      errorCount: 0,
      statusChanges: [] as any[],
      errors: [] as any[],
    };

    for (const payment of payments) {
      try {
        const paymentResponse = await fetch(
          `${acumaticaUrl}/entity/Default/22.200.001/Payment/${payment.reference_number}?$expand=ApplicationHistory`,
          {
            method: 'GET',
            headers: {
              'Cookie': cookies,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );

        if (!paymentResponse.ok) {
          throw new Error(`Failed to fetch: ${paymentResponse.status}`);
        }

        const acumaticaPayment = await paymentResponse.json();

        const oldStatus = payment.status;
        const newStatus = acumaticaPayment.Status?.value;

        const updateData = {
          customer_id: acumaticaPayment.CustomerID?.value || null,
          customer_name: acumaticaPayment.Customer?.value || null,
          payment_type: acumaticaPayment.Type?.value || null,
          payment_method: acumaticaPayment.PaymentMethod?.value || null,
          cash_account: acumaticaPayment.CashAccount?.value || null,
          card_account_nbr: acumaticaPayment.CardAccountNbr?.value || null,
          status: newStatus || null,
          application_date: acumaticaPayment.ApplicationDate?.value || null,
          payment_date: acumaticaPayment.PaymentDate?.value || null,
          payment_amount: acumaticaPayment.PaymentAmount?.value || null,
          unapplied_balance: acumaticaPayment.UnappliedBalance?.value || null,
          description: acumaticaPayment.Description?.value || null,
          currency_id: acumaticaPayment.CurrencyID?.value || null,
          hold: acumaticaPayment.Hold?.value || null,
          payment_ref: acumaticaPayment.PaymentRef?.value || null,
          last_modified_date_time: acumaticaPayment.LastModifiedDateTime?.value || null,
          application_history: acumaticaPayment.ApplicationHistory || [],
          last_synced_at: new Date().toISOString(),
        };

        await supabase
          .from('acumatica_payments')
          .update(updateData)
          .eq('reference_number', payment.reference_number);

        if (acumaticaPayment.ApplicationHistory && acumaticaPayment.ApplicationHistory.length > 0) {
          await supabase
            .from('payment_invoice_applications')
            .delete()
            .eq('payment_reference_number', payment.reference_number);

          const applications = acumaticaPayment.ApplicationHistory.map((app: any) => ({
            payment_reference_number: payment.reference_number,
            doc_type: app.DocType?.value || null,
            reference_number: app.ReferenceNbr?.value || null,
            invoice_date: app.Date?.value || null,
            status: app.Status?.value || null,
            amount_paid: parseFloat(app.AmountPaid?.value || '0'),
            balance: parseFloat(app.Balance?.value || '0'),
          }));

          await supabase
            .from('payment_invoice_applications')
            .insert(applications);
        }

        if (oldStatus !== newStatus) {
          results.statusChanges.push({
            paymentRef: payment.reference_number,
            oldStatus,
            newStatus,
            customerName: payment.customer_name,
          });

          await supabase
            .from('sync_change_logs')
            .insert({
              entity_type: 'payment',
              entity_id: payment.reference_number,
              sync_type: 'date_range_resync',
              action_type: 'status_changed',
              old_value: oldStatus,
              new_value: newStatus,
            });
        }

        results.successCount++;
      } catch (error: any) {
        console.error(`Error processing ${payment.reference_number}:`, error.message);
        results.errors.push({
          paymentRef: payment.reference_number,
          error: error.message,
        });
        results.errorCount++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

    await supabase
      .from('sync_change_logs')
      .insert({
        entity_type: 'payment',
        entity_id: `date_range_${startDate}_to_${endDate}`,
        sync_type: 'date_range_resync',
        action_type: 'bulk_resync_completed',
        old_value: null,
        new_value: JSON.stringify(results),
      });

    const responseMessage = totalInRange > MAX_PAYMENTS_PER_RUN
      ? `Processed ${results.totalProcessed} of ${totalInRange} payments (limited to prevent timeout). Run again to process more.`
      : undefined;

    return new Response(
      JSON.stringify({
        ...results,
        duration,
        message: responseMessage,
        totalInRange,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Date range resync error:', error);

    if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
      console.log('Session expired, invalidating cache');
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase
        .from('acumatica_session_cache')
        .update({ is_active: false })
        .eq('is_active', true);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
