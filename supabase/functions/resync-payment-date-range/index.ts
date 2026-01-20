import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
      .from('acumatica_credentials')
      .select('*')
      .single();

    if (credError || !credentials) {
      console.error('Credentials error:', credError);
      throw new Error('Acumatica credentials not configured');
    }

    const { data: existingSession } = await supabase
      .from('acumatica_session_cache')
      .select('session_id')
      .eq('is_active', true)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId: string;

    if (existingSession) {
      sessionId = existingSession.session_id;
      console.log('Using cached session');
    } else {
      console.log('Creating new session');
      const loginResponse = await fetch(`${credentials.instance_url}/entity/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: credentials.username,
          password: credentials.password,
          company: credentials.company,
        }),
      });

      if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status}`);
      }

      const setCookieHeader = loginResponse.headers.get('set-cookie');
      if (!setCookieHeader) {
        throw new Error('No session cookie received from Acumatica');
      }

      const match = setCookieHeader.match(/ASP\.NET_SessionId=([^;]+)/);
      if (!match) {
        throw new Error('Could not extract session ID from cookie');
      }

      sessionId = match[1];

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      await supabase
        .from('acumatica_session_cache')
        .update({ is_active: false })
        .eq('is_active', true);

      await supabase
        .from('acumatica_session_cache')
        .insert({
          session_id: sessionId,
          expires_at: expiresAt.toISOString(),
          is_active: true,
        });
    }

    const { data: payments } = await supabase
      .from('acumatica_payments')
      .select('reference_number, customer_name, status')
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)
      .order('payment_date', { ascending: true });

    if (!payments || payments.length === 0) {
      return new Response(
        JSON.stringify({
          totalProcessed: 0,
          successCount: 0,
          errorCount: 0,
          duration: '0s',
          statusChanges: [],
          errors: [],
          message: 'No payments found in date range'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${payments.length} payments to resync`);

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
          `${credentials.instance_url}/entity/Default/22.200.001/Payment/${payment.reference_number}?$expand=ApplicationHistory`,
          {
            method: 'GET',
            headers: {
              'Cookie': `ASP.NET_SessionId=${sessionId}; CompanyID=${credentials.company}`,
              'Accept': 'application/json',
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

    return new Response(
      JSON.stringify({
        ...results,
        duration,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Date range resync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
