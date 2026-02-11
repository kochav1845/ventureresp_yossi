import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_PAYMENTS_PER_RUN = 20; // Reduced to prevent timeout (each payment can have 2 API calls)

async function logoutAcumaticaSession(acumaticaUrl: string, cookies: string): Promise<boolean> {
  try {
    console.log('Attempting to logout Acumatica session...');
    const logoutResponse = await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json',
      },
    });
    console.log(`Logout response status: ${logoutResponse.status}`);
    return logoutResponse.ok;
  } catch (error) {
    console.warn('Logout failed:', error);
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
    console.log(`Found ${allSessions.length} cached sessions to logout`);
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
    console.log('Force new session requested, logging out all existing sessions...');
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

  const startTime = Date.now();
  const syncId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { startDate, endDate, forceNewSession } = await req.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: 'Start and end dates are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Resyncing payments from ${startDate} to ${endDate} (syncId: ${syncId})`);

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

    const limitedCount = Math.min(totalInRange, MAX_PAYMENTS_PER_RUN);

    const { data: paymentRefs, error: queryError } = await supabase
      .from('acumatica_payments')
      .select('reference_number')
      .gte('application_date', startDate)
      .lte('application_date', endDate)
      .order('application_date', { ascending: true })
      .limit(limitedCount);

    if (queryError) {
      throw new Error(`Database query failed: ${queryError.message}`);
    }

    const uniqueRefs = [...new Set(paymentRefs.map(p => p.reference_number))];
    console.log(`Processing ${uniqueRefs.length} unique payment references`);

    // Initialize progress tracking
    await supabase.from('sync_progress').insert({
      sync_id: syncId,
      operation_type: 'payment_date_range_resync',
      total_items: uniqueRefs.length,
      processed_items: 0,
      status: 'running',
      metadata: { startDate, endDate }
    });

    const results = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      statusChanges: [] as any[],
      errors: [] as any[],
    };

    let sessionRetried = false;
    const typesToTry = ['Payment', 'Voided Payment'];

    for (let i = 0; i < uniqueRefs.length; i++) {
      const refNumber = uniqueRefs[i];

      // Update progress
      await supabase.from('sync_progress')
        .update({
          processed_items: i,
          current_item: refNumber,
          last_updated_at: new Date().toISOString()
        })
        .eq('sync_id', syncId);
      try {
        const fetchedPayments: any[] = [];

        for (const paymentType of typesToTry) {
          const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(refNumber)}?$expand=ApplicationHistory`;

          let paymentResponse = await fetch(directUrl, {
            method: 'GET',
            headers: {
              'Cookie': cookies,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          });

          if (paymentResponse.status === 401 && !sessionRetried) {
            console.log('Session issue detected, getting fresh session...');
            sessionRetried = true;

            try {
              cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials, true);
            } catch (retryLoginError: any) {
              if (retryLoginError.message?.includes('LOGIN_LIMIT_REACHED')) {
                return new Response(
                  JSON.stringify({
                    error: 'Acumatica API login limit reached during resync',
                    solution: 'Go to Acumatica System Monitor (SM201010) > Active Users tab and terminate stale API sessions',
                    partialResults: results,
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
              fetchedPayments.push(acumaticaPayment);
            }
          }
        }

        if (fetchedPayments.length === 0) {
          results.errors.push({
            paymentRef: refNumber,
            error: 'Payment not found in Acumatica (tried both Payment and Voided Payment types)'
          });
          results.errorCount++;
          continue;
        }

        for (const acumaticaPayment of fetchedPayments) {
          const paymentType = acumaticaPayment.Type?.value;

          const { data: existingPayment } = await supabase
            .from('acumatica_payments')
            .select('status, id')
            .eq('reference_number', refNumber)
            .eq('type', paymentType)
            .maybeSingle();

          const oldStatus = existingPayment?.status;
          const newStatus = acumaticaPayment.Status?.value;

          const updateData = {
            reference_number: refNumber,
            customer_id: acumaticaPayment.CustomerID?.value || null,
            customer_name: acumaticaPayment.CustomerName?.value || acumaticaPayment.Customer?.value || null,
            type: paymentType,
            payment_method: acumaticaPayment.PaymentMethod?.value || null,
            cash_account: acumaticaPayment.CashAccount?.value || null,
            card_account_nbr: acumaticaPayment.CardAccountNbr?.value || null,
            status: newStatus || null,
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

          if (existingPayment) {
            await supabase
              .from('acumatica_payments')
              .update(updateData)
              .eq('reference_number', refNumber)
              .eq('type', paymentType);
          } else {
            await supabase
              .from('acumatica_payments')
              .insert(updateData);
          }

          if (acumaticaPayment.ApplicationHistory && acumaticaPayment.ApplicationHistory.length > 0) {
            await supabase
              .from('payment_invoice_applications')
              .delete()
              .eq('payment_reference_number', refNumber)
              .eq('doc_type', paymentType);

            const applications = acumaticaPayment.ApplicationHistory.map((app: any) => ({
              payment_reference_number: refNumber,
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
          }

          if (oldStatus && oldStatus !== newStatus) {
            results.statusChanges.push({
              paymentRef: refNumber,
              type: paymentType,
              oldStatus,
              newStatus,
              customerName: acumaticaPayment.CustomerName?.value,
            });

            await supabase
              .from('sync_change_logs')
              .insert({
                entity_type: 'payment',
                entity_id: `${refNumber}_${paymentType}`,
                sync_type: 'date_range_resync',
                action_type: 'status_changed',
                old_value: oldStatus,
                new_value: newStatus,
              });
          }

          results.totalProcessed++;
          results.successCount++;
        }
      } catch (error: any) {
        console.error(`Error processing ${refNumber}:`, error.message);
        results.errors.push({
          paymentRef: refNumber,
          error: error.message,
        });
        results.errorCount++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

    // Mark sync as completed
    await supabase.from('sync_progress')
      .update({
        processed_items: uniqueRefs.length,
        status: 'completed',
        completed_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        metadata: {
          startDate,
          endDate,
          duration,
          successCount: results.successCount,
          errorCount: results.errorCount
        }
      })
      .eq('sync_id', syncId);

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
      ? `Processed ${results.totalProcessed} of ${totalInRange} payments. Run again to process more.`
      : undefined;

    return new Response(
      JSON.stringify({
        ...results,
        duration,
        message: responseMessage,
        totalInRange,
        syncId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Date range resync error:', error);

    // Mark sync as failed
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      await supabase.from('sync_progress')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString()
        })
        .eq('sync_id', syncId);
    } catch (updateError) {
      console.error('Failed to update sync progress:', updateError);
    }

    return new Response(
      JSON.stringify({ error: error.message, syncId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
