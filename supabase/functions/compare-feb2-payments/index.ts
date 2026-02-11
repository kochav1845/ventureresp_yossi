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

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { year = '2025' } = await req.json().catch(() => ({ year: '2025' }));

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

    // Fetch from Acumatica with filter for Feb 2 of specified year
    const filter = `ApplicationDate ge datetime'${year}-02-02T00:00:00' and ApplicationDate lt datetime'${year}-02-03T00:00:00'`;
    console.log('Using filter:', filter);
    const acumaticaPayments: any[] = [];

    // Try Payment type
    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Type,Status,CustomerName,PaymentAmount,ApplicationDate`;

    console.log('Fetching Payment type from Acumatica...');
    const paymentResponse = await fetch(paymentUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'Accept': 'application/json',
      },
    });

    if (paymentResponse.ok) {
      const paymentData = await paymentResponse.json();
      if (paymentData && Array.isArray(paymentData)) {
        acumaticaPayments.push(...paymentData);
      }
    }

    // Try Prepayment type
    const prepaymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Prepayment?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Type,Status,CustomerName,PaymentAmount,ApplicationDate`;

    console.log('Fetching Prepayment type from Acumatica...');
    const prepaymentResponse = await fetch(prepaymentUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'Accept': 'application/json',
      },
    });

    if (prepaymentResponse.ok) {
      const prepaymentData = await prepaymentResponse.json();
      if (prepaymentData && Array.isArray(prepaymentData)) {
        acumaticaPayments.push(...prepaymentData);
      }
    }

    console.log(`Found ${acumaticaPayments.length} payments in Acumatica for Feb 2, 2026`);

    // Get from database
    const { data: dbPayments } = await supabase
      .from('acumatica_payments')
      .select('reference_number, type, status, customer_name, payment_amount, application_date')
      .gte('application_date', '2026-02-02')
      .lt('application_date', '2026-02-03');

    console.log(`Found ${dbPayments?.length || 0} payments in database for Feb 2, 2026`);

    // Create sets for comparison
    const acumaticaRefs = new Set(
      acumaticaPayments.map(p => `${p.ReferenceNbr?.value}_${p.Type?.value}`)
    );

    const dbRefs = new Set(
      dbPayments?.map(p => `${p.reference_number}_${p.type}`) || []
    );

    // Find missing in database
    const missingInDb = acumaticaPayments.filter(p => {
      const key = `${p.ReferenceNbr?.value}_${p.Type?.value}`;
      return !dbRefs.has(key);
    }).map(p => ({
      referenceNumber: p.ReferenceNbr?.value,
      type: p.Type?.value,
      status: p.Status?.value,
      customerName: p.CustomerName?.value,
      paymentAmount: p.PaymentAmount?.value,
      applicationDate: p.ApplicationDate?.value,
    }));

    // Find extras in database (shouldn't be there)
    const extraInDb = dbPayments?.filter(p => {
      const key = `${p.reference_number}_${p.type}`;
      return !acumaticaRefs.has(key);
    }) || [];

    return new Response(
      JSON.stringify({
        comparison: {
          acumatica_count: acumaticaPayments.length,
          database_count: dbPayments?.length || 0,
          missing_in_db: missingInDb.length,
          extra_in_db: extraInDb.length,
        },
        missing_in_db: missingInDb,
        extra_in_db: extraInDb,
        all_acumatica_payments: acumaticaPayments.map(p => ({
          referenceNumber: p.ReferenceNbr?.value,
          type: p.Type?.value,
          status: p.Status?.value,
          customerName: p.CustomerName?.value,
          paymentAmount: p.PaymentAmount?.value,
        })),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Comparison error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
