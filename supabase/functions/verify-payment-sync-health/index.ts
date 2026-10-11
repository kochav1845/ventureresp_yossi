import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getAcumaticaSession(supabase: any, acumaticaUrl: string, credentials: any): Promise<string> {
  // acumatica_session_cache columns are session_cookie / is_valid
  // (it never had session_id / is_active -- every call here 400'd).
  const { data: cachedSession } = await supabase
    .from('acumatica_session_cache')
    .select('session_cookie')
    .eq('is_valid', true)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    console.log('Using cached session cookies');
    return cachedSession.session_cookie;
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
    .update({ is_valid: false })
    .eq('is_valid', true);

  await supabase
    .from('acumatica_session_cache')
    .insert({
      session_cookie: cookies,
      expires_at: expiresAt.toISOString(),
      is_valid: true,
    });

  console.log('Logged in and cached session');
  return cookies;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  // Declared outside try so the catch block below can use it.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {

    const { sampleSize = 50 } = await req.json().catch(() => ({}));

    console.log(`Running payment sync health check (sample size: ${sampleSize})`);

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

    let cookies = await getAcumaticaSession(supabase, acumaticaUrl, credentials);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentPayments } = await supabase
      .from('acumatica_payments')
      .select('reference_number, type, customer_name, status')
      // acumatica_payments has no payment_date column; application_date is the payment date
      .gte('application_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('created_at', { ascending: false })
      .limit(sampleSize);

    if (!recentPayments || recentPayments.length === 0) {
      return new Response(
        JSON.stringify({
          healthStatus: 'no_data',
          message: 'No recent payments to verify',
          duration: ((Date.now() - startTime) / 1000).toFixed(1) + 's',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking ${recentPayments.length} payments for sync accuracy`);

    const results = {
      totalChecked: recentPayments.length,
      inSync: 0,
      outOfSync: 0,
      mismatches: [] as any[],
      errors: [] as any[],
    };

    for (const payment of recentPayments) {
      try {
        let paymentResponse = await fetch(
          `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment.type)}/${encodeURIComponent(payment.reference_number)}`,
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
          if (paymentResponse.status === 404) {
            results.errors.push({
              paymentRef: payment.reference_number,
              error: 'Payment not found in Acumatica',
            });
            continue;
          }

          const errorText = await paymentResponse.text();
          console.error(`Acumatica API error for ${payment.reference_number}: ${paymentResponse.status} - ${errorText}`);

          if (paymentResponse.status === 401 || errorText.includes('API Login Limit') || errorText.includes('PX.Data.PXException')) {
            console.log('Session invalid or login limit hit, getting fresh session...');
            await supabase
              .from('acumatica_session_cache')
              .update({ is_valid: false })
              .eq('is_valid', true);

            cookies = await getAcumaticaSession(supabase, acumaticaUrl, credentials);

            paymentResponse = await fetch(
              `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment.type)}/${encodeURIComponent(payment.reference_number)}`,
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
              const retryError = await paymentResponse.text();
              throw new Error(`Failed after retry: ${paymentResponse.status} - ${retryError}`);
            }
          } else {
            throw new Error(`Failed to fetch: ${paymentResponse.status} - ${errorText}`);
          }
        }

        const acumaticaPayment = await paymentResponse.json();
        const acumaticaStatus = acumaticaPayment.Status?.value;

        if (acumaticaStatus !== payment.status) {
          results.outOfSync++;
          results.mismatches.push({
            paymentRef: payment.reference_number,
            customerName: payment.customer_name,
            dbStatus: payment.status,
            acumaticaStatus,
            acumaticaLastModified: acumaticaPayment.LastModifiedDateTime?.value,
          });

          console.log(`Mismatch found: ${payment.reference_number} - DB: ${payment.status}, Acumatica: ${acumaticaStatus}`);
        } else {
          results.inSync++;
        }
      } catch (error: any) {
        console.error(`Error checking ${payment.reference_number}:`, error.message);
        results.errors.push({
          paymentRef: payment.reference_number,
          error: error.message,
        });
      }
    }

    const syncRate = ((results.inSync / results.totalChecked) * 100).toFixed(1);
    const healthStatus = parseFloat(syncRate) >= 95 ? 'healthy' : parseFloat(syncRate) >= 85 ? 'warning' : 'critical';

    // sync_change_logs columns: sync_type, action_type, entity_reference, change_summary,
    // change_details, sync_source are required/real (entity_type/old_value/new_value don't exist,
    // entity_id is a uuid).
    await supabase
      .from('sync_change_logs')
      .insert({
        sync_type: 'health_verification',
        action_type: 'health_check', // healthStatus is in change_summary/change_details

        entity_reference: 'payment_health_check',
        entity_name: 'Payment sync health check',
        change_summary: `Payment sync health: ${healthStatus} (${syncRate}% of ${results.totalChecked} in sync)`,
        change_details: {
          ...results,
          syncRate: `${syncRate}%`,
          healthStatus,
        },
        sync_source: 'scheduled_sync',
      });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's';

    return new Response(
      JSON.stringify({
        healthStatus,
        syncRate: `${syncRate}%`,
        ...results,
        duration,
        recommendation: healthStatus === 'healthy'
          ? 'Payment sync is healthy'
          : healthStatus === 'warning'
          ? 'Some mismatches detected. Consider running a date range resync.'
          : 'Critical sync issues detected. Immediate attention required.',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Health check error:', error);

    if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
      console.log('Session expired, invalidating cache');
      await supabase
        .from('acumatica_session_cache')
        .update({ is_valid: false })
        .eq('is_valid', true);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
