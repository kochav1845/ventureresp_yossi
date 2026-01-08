import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { baseNumber } = await req.json();

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('acumatica_url, username, password, company, branch')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!credentials) {
      return new Response(
        JSON.stringify({ error: 'No credentials found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const acumaticaUrl = credentials.acumatica_url;
    const loginBody: any = { name: credentials.username, password: credentials.password };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Auth failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    const cookies = setCookieHeader!.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const paddedRef = baseNumber.toString().padStart(6, '0');
    const unpaddedRef = baseNumber.toString().replace(/^0+/, '');

    const results: any = {
      testNumber: baseNumber,
      paddedVersion: paddedRef,
      unpaddedVersion: unpaddedRef,
      queries: []
    };

    const versionsToTest = [
      { name: 'padded', ref: paddedRef },
      { name: 'unpadded', ref: unpaddedRef },
      { name: 'as-provided', ref: baseNumber.toString() }
    ];

    for (const version of versionsToTest) {
      const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${version.ref}'&$select=ReferenceNbr,Date,Status,Amount,Balance,DueDate,Customer,CustomerName,LastModifiedDateTime,CreatedDateTime`;

      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
      });

      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        data = { error: 'Failed to parse response', responseText, status: response.status };
      }

      results.queries.push({
        version: version.name,
        refQueried: version.ref,
        foundCount: Array.isArray(data) ? data.length : 0,
        invoices: Array.isArray(data) ? data.map((inv: any) => ({
          referenceNbr: inv.ReferenceNbr?.value,
          date: inv.Date?.value,
          status: inv.Status?.value,
          amount: inv.Amount?.value,
          balance: inv.Balance?.value,
          dueDate: inv.DueDate?.value,
          customer: inv.Customer?.value,
          customerName: inv.CustomerName?.value,
          lastModified: inv.LastModifiedDateTime?.value,
          createdDateTime: inv.CreatedDateTime?.value
        })) : []
      });
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    const uniqueInvoices = new Set();
    results.queries.forEach((q: any) => {
      q.invoices.forEach((inv: any) => {
        uniqueInvoices.add(inv.referenceNbr);
      });
    });

    results.conclusion = uniqueInvoices.size > 1
      ? `MULTIPLE INVOICES FOUND! There are ${uniqueInvoices.size} different invoices: ${Array.from(uniqueInvoices).join(', ')}`
      : uniqueInvoices.size === 1
      ? `Single invoice found: ${Array.from(uniqueInvoices)[0]}`
      : 'No invoices found';

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});