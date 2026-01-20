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

    const { sampleSize = 50 } = await req.json().catch(() => ({}));

    console.log(`Running payment sync health check (sample size: ${sampleSize})`);

    const { data: credentials } = await supabase
      .from('acumatica_credentials')
      .select('*')
      .single();

    if (!credentials) {
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentPayments } = await supabase
      .from('acumatica_payments')
      .select('reference_number, customer_name, status')
      .gte('payment_date', thirtyDaysAgo.toISOString().split('T')[0])
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
        const paymentResponse = await fetch(
          `${credentials.instance_url}/entity/Default/22.200.001/Payment/${payment.reference_number}`,
          {
            method: 'GET',
            headers: {
              'Cookie': `ASP.NET_SessionId=${sessionId}; CompanyID=${credentials.company}`,
              'Accept': 'application/json',
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
          throw new Error(`Failed to fetch: ${paymentResponse.status}`);
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

    await supabase
      .from('sync_change_logs')
      .insert({
        entity_type: 'payment',
        entity_id: 'health_check',
        sync_type: 'health_verification',
        action_type: healthStatus,
        old_value: null,
        new_value: JSON.stringify({
          ...results,
          syncRate: `${syncRate}%`,
          healthStatus,
        }),
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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
