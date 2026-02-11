import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getOrCreateSession(supabase: any, acumaticaUrl: string, credentials: any): Promise<string> {
  const { data: cachedSession } = await supabase
    .from('acumatica_session_cache')
    .select('id, session_cookie')
    .eq('is_valid', true)
    .gt('expires_at', new Date().toISOString())
    .order('last_used_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    await supabase
      .from('acumatica_session_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', cachedSession.id);
    return cachedSession.session_cookie;
  }

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
    throw new Error(`Authentication failed: ${await loginResponse.text()}`);
  }

  const setCookieHeaders = loginResponse.headers.getSetCookie();
  const cookies = setCookieHeaders.map(header => header.split(';')[0]).join('; ');

  await supabase.from('acumatica_session_cache').insert({
    session_cookie: cookies,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    last_used_at: new Date().toISOString(),
    is_valid: true,
  });

  return cookies;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const syncId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!credentials) {
      throw new Error('Acumatica credentials not configured');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials);

    // Get all Feb 2, 2026 payment reference numbers from database
    const { data: dbPayments } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, application_date')
      .gte('application_date', '2026-02-02')
      .lt('application_date', '2026-02-03')
      .order('reference_number');

    if (!dbPayments || dbPayments.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No payments found in database for Feb 2, 2026' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${dbPayments.length} payments in database with date 2026-02-02`);

    // Initialize progress tracking
    await supabase.from('sync_progress').insert({
      sync_id: syncId,
      operation_type: 'feb2_date_correction',
      total_items: dbPayments.length,
      processed_items: 0,
      status: 'running',
      metadata: { wrongDate: '2026-02-02' }
    });

    const results = {
      totalProcessed: 0,
      datesUpdated: 0,
      notFoundInAcumatica: 0,
      dateChanges: [] as any[],
      notFound: [] as any[],
    };

    const typesToTry = ['Payment', 'Prepayment'];

    for (let i = 0; i < dbPayments.length; i++) {
      const payment = dbPayments[i];

      await supabase.from('sync_progress')
        .update({
          processed_items: i,
          current_item: payment.reference_number,
          last_updated_at: new Date().toISOString()
        })
        .eq('sync_id', syncId);

      results.totalProcessed++;
      let found = false;

      for (const paymentType of typesToTry) {
        const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/${paymentType}/${encodeURIComponent(paymentType)}/${encodeURIComponent(payment.reference_number)}?$select=ReferenceNbr,Type,ApplicationDate,Status,CustomerName,PaymentAmount`;

        const response = await fetch(directUrl, {
          method: 'GET',
          headers: {
            'Cookie': cookies,
            'Accept': 'application/json',
          },
        });

        if (response.ok) {
          const acumaticaPayment = await response.json();
          if (acumaticaPayment && acumaticaPayment.ReferenceNbr) {
            found = true;
            const correctDate = acumaticaPayment.ApplicationDate?.value;

            if (correctDate && correctDate !== payment.application_date) {
              // Update the date in database
              await supabase
                .from('acumatica_payments')
                .update({
                  application_date: correctDate,
                  last_sync_timestamp: new Date().toISOString()
                })
                .eq('id', payment.id);

              results.datesUpdated++;
              results.dateChanges.push({
                referenceNumber: payment.reference_number,
                type: paymentType,
                oldDate: payment.application_date,
                correctDate: correctDate,
                customerName: acumaticaPayment.CustomerName?.value,
              });

              console.log(`Updated ${payment.reference_number}: ${payment.application_date} → ${correctDate}`);
            }
            break;
          }
        }
      }

      if (!found) {
        results.notFoundInAcumatica++;
        results.notFound.push({
          referenceNumber: payment.reference_number,
          type: payment.type,
        });
      }
    }

    // Mark sync as completed
    await supabase.from('sync_progress')
      .update({
        processed_items: dbPayments.length,
        status: 'completed',
        completed_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        metadata: {
          wrongDate: '2026-02-02',
          datesUpdated: results.datesUpdated,
          notFoundInAcumatica: results.notFoundInAcumatica,
        }
      })
      .eq('sync_id', syncId);

    return new Response(
      JSON.stringify({
        ...results,
        syncId,
        summary: {
          totalProcessed: results.totalProcessed,
          datesUpdated: results.datesUpdated,
          notFoundInAcumatica: results.notFoundInAcumatica,
          updatePercentage: ((results.datesUpdated / results.totalProcessed) * 100).toFixed(2) + '%',
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Date correction error:', error);

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
