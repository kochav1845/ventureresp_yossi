import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AcumaticaCredentials {
  acumatica_url: string;
  username: string;
  password: string;
  branch: string;
  company: string;
}

async function getAcumaticaCredentials(supabaseClient: any): Promise<AcumaticaCredentials> {
  const { data, error } = await supabaseClient
    .from('acumatica_sync_credentials')
    .select('acumatica_url, username, password, branch, company')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Failed to fetch Acumatica credentials');
  }

  return data;
}

async function loginToAcumatica(credentials: AcumaticaCredentials): Promise<{ cookies: string }> {
  const loginUrl = `${credentials.acumatica_url}/entity/auth/login`;

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: credentials.username,
      password: credentials.password,
      branch: credentials.branch,
      company: credentials.company,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const setCookieHeaders = response.headers.getSetCookie();
  const cookies = setCookieHeaders.join('; ');

  return { cookies };
}

async function checkInvoiceInAcumatica(
  credentials: AcumaticaCredentials,
  cookies: string,
  refNumber: string
): Promise<any> {
  const invoiceUrl = `${credentials.acumatica_url}/entity/Default/23.200.001/Invoice`;
  const filter = `ReferenceNbr eq '${refNumber}'`;
  const fullUrl = `${invoiceUrl}?$filter=${encodeURIComponent(filter)}&$select=ReferenceNbr,Type,Status,Date,DueDate,Balance,Amount,CustomerID`;

  try {
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookies,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    return null;
  }
}

async function logoutFromAcumatica(credentials: AcumaticaCredentials, cookies: string): Promise<void> {
  const logoutUrl = `${credentials.acumatica_url}/entity/auth/logout`;
  await fetch(logoutUrl, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { createClient } = await import('npm:@supabase/supabase-js@2.57.4');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { invoice_numbers } = await req.json();

    const credentials = await getAcumaticaCredentials(supabase);
    const { cookies } = await loginToAcumatica(credentials);

    const results = [];

    for (const refNum of invoice_numbers) {
      const withZeros = refNum.padStart(6, '0');
      const withoutZeros = refNum.replace(/^0+/, '');

      const acuWithZeros = await checkInvoiceInAcumatica(credentials, cookies, withZeros);
      const acuWithoutZeros = await checkInvoiceInAcumatica(credentials, cookies, withoutZeros);

      const { data: dbInvoice } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, date, due_date, status, balance, amount, customer_id')
        .eq('reference_number', withZeros)
        .maybeSingle();

      results.push({
        original: refNum,
        withZeros,
        withoutZeros,
        inDbAs: dbInvoice ? dbInvoice.reference_number : null,
        dbData: dbInvoice,
        acuWithZeros: acuWithZeros ? {
          refNbr: acuWithZeros.ReferenceNbr?.value,
          date: acuWithZeros.Date?.value,
          dueDate: acuWithZeros.DueDate?.value,
          status: acuWithZeros.Status?.value,
          balance: acuWithZeros.Balance?.value,
          amount: acuWithZeros.Amount?.value,
          customerId: acuWithZeros.CustomerID?.value,
        } : null,
        acuWithoutZeros: acuWithoutZeros ? {
          refNbr: acuWithoutZeros.ReferenceNbr?.value,
          date: acuWithoutZeros.Date?.value,
          dueDate: acuWithoutZeros.DueDate?.value,
          status: acuWithoutZeros.Status?.value,
          balance: acuWithoutZeros.Balance?.value,
          amount: acuWithoutZeros.Amount?.value,
          customerId: acuWithoutZeros.CustomerID?.value,
        } : null,
      });
    }

    await logoutFromAcumatica(credentials, cookies);

    return new Response(
      JSON.stringify({ results }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});