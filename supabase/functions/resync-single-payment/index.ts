import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function logoutAcumaticaSession(acumaticaUrl: string, cookies: string): Promise<boolean> {
  try {
    const logoutResponse = await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json',
      },
    });
    return logoutResponse.ok;
  } catch (error) {
    return false;
  }
}

async function forceLogoutAllCachedSessions(supabase: any, acumaticaUrl: string): Promise<number> {
  const { data: allSessions } = await supabase
    .from('acumatica_session_cache')
    .select('id, session_cookie')
    .eq('is_valid', true);

  let loggedOut = 0;
  if (allSessions && allSessions.length > 0) {
    for (const session of allSessions) {
      const success = await logoutAcumaticaSession(acumaticaUrl, session.session_cookie);
      if (success) loggedOut++;
    }
  }

  await supabase
    .from('acumatica_session_cache')
    .update({ is_valid: false })
    .eq('is_valid', true);

  return loggedOut;
}

async function getOrCreateSession(supabase: any, acumaticaUrl: string, credentials: any, forceNew: boolean = false): Promise<string> {
  if (forceNew) {
    console.log('Force new session requested, logging out existing sessions...');
    await forceLogoutAllCachedSessions(supabase, acumaticaUrl);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const { data: cachedSession } = await supabase
    .from('acumatica_session_cache')
    .select('id, session_cookie')
    .eq('is_valid', true)
    .gt('expires_at', new Date().toISOString())
    .order('last_used_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession && !forceNew) {
    console.log('Reusing cached session:', cachedSession.id);
    await supabase
      .from('acumatica_session_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', cachedSession.id);
    return cachedSession.session_cookie;
  }

  console.log('Creating new Acumatica session...');

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

    if (errorText.includes('concurrent API logins') || errorText.includes('API Login Limit')) {
      throw new Error(`LOGIN_LIMIT_REACHED: ${errorText}`);
    }

    throw new Error(`Authentication failed: ${errorText}`);
  }

  const setCookieHeader = loginResponse.headers.get('set-cookie');
  if (!setCookieHeader) {
    throw new Error('No authentication cookies received');
  }

  const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 25);

  await supabase
    .from('acumatica_session_cache')
    .update({ is_valid: false })
    .eq('is_valid', true);

  const { data: newSession } = await supabase
    .from('acumatica_session_cache')
    .insert({
      session_cookie: cookies,
      expires_at: expiresAt.toISOString(),
      is_valid: true
    })
    .select('id')
    .single();

  console.log('New session created and cached:', newSession?.id);
  return cookies;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { paymentRef, forceNewSession } = await req.json();

    if (!paymentRef) {
      return new Response(
        JSON.stringify({ error: 'Payment reference number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      throw new Error('Acumatica credentials not configured');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    let cookies: string;
    try {
      cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials, forceNewSession === true);
    } catch (loginError: any) {
      if (loginError.message?.includes('LOGIN_LIMIT_REACHED')) {
        return new Response(
          JSON.stringify({
            error: 'Acumatica API login limit reached',
            solution: 'Go to Acumatica System Monitor (SM201010) > Active Users tab and terminate stale API sessions, OR go to Apply Updates and click Restart Application',
            details: loginError.message,
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw loginError;
    }

    const paddedRef = paymentRef.padStart(6, '0');
    console.log(`Fetching payment ${paddedRef} from Acumatica...`);

    const typesToTry = ['Payment', 'Voided Payment'];
    const fetchedPayments: any[] = [];

    for (const paymentType of typesToTry) {
      const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(paddedRef)}?$expand=ApplicationHistory`;
      console.log(`Trying ${paymentType}: ${directUrl}`);

      let paymentResponse = await fetch(directUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (paymentResponse.status === 401) {
        console.log('Session issue, getting fresh session...');
        try {
          cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials, true);
        } catch (retryLoginError: any) {
          if (retryLoginError.message?.includes('LOGIN_LIMIT_REACHED')) {
            return new Response(
              JSON.stringify({
                error: 'Acumatica API login limit reached',
                solution: 'Go to Acumatica System Monitor (SM201010) > Active Users tab and terminate stale API sessions',
              }),
              { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          throw retryLoginError;
        }

        paymentResponse = await fetch(directUrl, {
          method: 'GET',
          headers: {
            'Cookie': cookies,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
      }

      if (paymentResponse.ok) {
        const acumaticaPayment = await paymentResponse.json();
        if (acumaticaPayment && acumaticaPayment.ReferenceNbr) {
          console.log(`Found ${paymentType} record for ${paddedRef}`);
          fetchedPayments.push(acumaticaPayment);
        }
      } else {
        console.log(`${paymentType} not found for ${paddedRef} (status: ${paymentResponse.status})`);
      }
    }

    if (fetchedPayments.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Payment not found in Acumatica',
          paymentRef: paddedRef
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalApplications = 0;
    const results: any[] = [];

    for (const acumaticaPayment of fetchedPayments) {
      const paymentType = acumaticaPayment.Type?.value;

      const updateData = {
        reference_number: paddedRef,
        customer_id: acumaticaPayment.CustomerID?.value || null,
        customer_name: acumaticaPayment.CustomerName?.value || acumaticaPayment.Customer?.value || null,
        type: paymentType,
        payment_method: acumaticaPayment.PaymentMethod?.value || null,
        cash_account: acumaticaPayment.CashAccount?.value || null,
        card_account_nbr: acumaticaPayment.CardAccountNbr?.value || null,
        status: acumaticaPayment.Status?.value || null,
        application_date: acumaticaPayment.ApplicationDate?.value || null,
        payment_amount: acumaticaPayment.PaymentAmount?.value || null,
        available_balance: acumaticaPayment.UnappliedBalance?.value || null,
        description: acumaticaPayment.Description?.value || null,
        currency_id: acumaticaPayment.CurrencyID?.value || null,
        hold: acumaticaPayment.Hold?.value || null,
        payment_ref: acumaticaPayment.PaymentRef?.value || null,
        last_modified_datetime: acumaticaPayment.LastModifiedDateTime?.value || null,
        application_history: acumaticaPayment.ApplicationHistory || [],
        last_sync_timestamp: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('acumatica_payments')
        .select('id')
        .eq('reference_number', paddedRef)
        .eq('type', paymentType)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from('acumatica_payments')
          .update(updateData)
          .eq('reference_number', paddedRef)
          .eq('type', paymentType);

        if (updateError) {
          console.error(`Failed to update ${paymentType}: ${updateError.message}`);
        } else {
          results.push({ type: paymentType, action: 'updated', status: updateData.status });
        }
      } else {
        const { error: insertError } = await supabase
          .from('acumatica_payments')
          .insert(updateData);

        if (insertError) {
          console.error(`Failed to insert ${paymentType}: ${insertError.message}`);
        } else {
          results.push({ type: paymentType, action: 'created', status: updateData.status });
        }
      }

      if (acumaticaPayment.ApplicationHistory && acumaticaPayment.ApplicationHistory.length > 0) {
        await supabase
          .from('payment_invoice_applications')
          .delete()
          .eq('payment_reference_number', paddedRef)
          .eq('doc_type', paymentType);

        const applications = acumaticaPayment.ApplicationHistory.map((app: any) => ({
          payment_reference_number: paddedRef,
          doc_type: app.DocType?.value || paymentType,
          reference_number: app.ReferenceNbr?.value || null,
          invoice_date: app.Date?.value || null,
          status: app.Status?.value || null,
          amount_paid: parseFloat(app.AmountPaid?.value || '0'),
          balance: parseFloat(app.Balance?.value || '0'),
        }));

        await supabase
          .from('payment_invoice_applications')
          .insert(applications);

        totalApplications += applications.length;
      }
    }

    await supabase
      .from('sync_change_logs')
      .insert({
        entity_type: 'payment',
        entity_id: paddedRef,
        sync_type: 'manual_resync',
        action_type: 'updated',
        old_value: null,
        new_value: JSON.stringify(results),
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment ${paddedRef} resynced successfully`,
        recordsProcessed: fetchedPayments.length,
        results,
        applicationsCount: totalApplications,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Resync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
