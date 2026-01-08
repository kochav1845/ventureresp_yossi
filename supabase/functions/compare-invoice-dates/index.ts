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

    const { referenceNumbers } = await req.json();

    if (!referenceNumbers || !Array.isArray(referenceNumbers)) {
      return new Response(
        JSON.stringify({ error: 'referenceNumbers array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('acumatica_url, username, password, company, branch')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({
          error: 'No active Acumatica credentials found in database',
          details: credError?.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let acumaticaUrl = credentials.acumatica_url;
    const username = credentials.username;
    const password = credentials.password;
    const company = credentials.company || "";
    const branch = credentials.branch || "";

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: 'Missing Acumatica credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      return new Response(
        JSON.stringify({ error: `Authentication failed: ${errorText}` }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({ error: 'No authentication cookies received' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const comparisons = [];

    for (const refNum of referenceNumbers) {
      const paddedRef = String(refNum).padStart(6, '0');
      
      const { data: dbInvoice } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, date, due_date, status, amount, balance, created_datetime, last_modified_datetime')
        .eq('reference_number', paddedRef)
        .maybeSingle();

      const invoiceUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${paddedRef.replace(/^0+/, '')}'`;

      const invoiceResponse = await fetch(invoiceUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies,
        },
      });

      if (invoiceResponse.ok) {
        const invoicesData = await invoiceResponse.json();
        const acuInvoice = Array.isArray(invoicesData) && invoicesData.length > 0 ? invoicesData[0] : null;

        if (acuInvoice) {
          comparisons.push({
            referenceNumber: paddedRef,
            database: dbInvoice ? {
              date: dbInvoice.date,
              dueDate: dbInvoice.due_date,
              status: dbInvoice.status,
              amount: dbInvoice.amount,
              balance: dbInvoice.balance,
              createdDateTime: dbInvoice.created_datetime,
              lastModifiedDateTime: dbInvoice.last_modified_datetime
            } : null,
            acumatica: {
              date: acuInvoice.Date?.value || null,
              dueDate: acuInvoice.DueDate?.value || null,
              status: acuInvoice.Status?.value || null,
              amount: acuInvoice.Amount?.value || null,
              balance: acuInvoice.Balance?.value || null,
              createdDateTime: acuInvoice.CreatedDateTime?.value || null,
              lastModifiedDateTime: acuInvoice.LastModifiedDateTime?.value || null,
              referenceNbr: acuInvoice.ReferenceNbr?.value || null
            },
            matches: dbInvoice ? {
              date: dbInvoice.date === acuInvoice.Date?.value?.split('T')[0],
              dueDate: dbInvoice.due_date === acuInvoice.DueDate?.value?.split('T')[0],
              status: dbInvoice.status === acuInvoice.Status?.value,
              amount: Math.abs(parseFloat(dbInvoice.amount) - (acuInvoice.Amount?.value || 0)) < 0.01,
              balance: Math.abs(parseFloat(dbInvoice.balance) - (acuInvoice.Balance?.value || 0)) < 0.01
            } : null
          });
        }
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        totalChecked: referenceNumbers.length,
        comparisons
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});