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
    const { startDate, endDate, maxResults = 100 } = await req.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: 'startDate and endDate are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Query with date filter
    const filter = `ApplicationDate ge datetime'${startDate}T00:00:00' and ApplicationDate lt datetime'${endDate}T23:59:59'`;
    const allPayments: any[] = [];

    // Try Payment type
    console.log(`Querying Payment type for ${startDate} to ${endDate}...`);
    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Type,Status,CustomerName,PaymentAmount,ApplicationDate&$top=${maxResults}`;

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
        allPayments.push(...paymentData.map((p: any) => ({
          referenceNumber: p.ReferenceNbr?.value,
          type: p.Type?.value || 'Payment',
          status: p.Status?.value,
          customerName: p.CustomerName?.value,
          paymentAmount: p.PaymentAmount?.value,
          applicationDate: p.ApplicationDate?.value,
        })));
      }
    }

    // Try Prepayment type
    console.log(`Querying Prepayment type for ${startDate} to ${endDate}...`);
    const prepaymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Prepayment?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Type,Status,CustomerName,PaymentAmount,ApplicationDate&$top=${maxResults}`;

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
        allPayments.push(...prepaymentData.map((p: any) => ({
          referenceNumber: p.ReferenceNbr?.value,
          type: p.Type?.value || 'Prepayment',
          status: p.Status?.value,
          customerName: p.CustomerName?.value,
          paymentAmount: p.PaymentAmount?.value,
          applicationDate: p.ApplicationDate?.value,
        })));
      }
    }

    console.log(`Found ${allPayments.length} payments in Acumatica`);

    return new Response(
      JSON.stringify({
        success: true,
        count: allPayments.length,
        dateRange: {
          start: startDate,
          end: endDate,
        },
        payments: allPayments,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Query error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
