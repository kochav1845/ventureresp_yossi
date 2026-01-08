import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { referenceNumber } = await req.json();

    if (!referenceNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing referenceNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let acumaticaUrl = Deno.env.get("ACUMATICA_URL");
    const username = Deno.env.get("ACUMATICA_USERNAME");
    const password = Deno.env.get("ACUMATICA_PASSWORD");
    const company = Deno.env.get("ACUMATICA_COMPANY") || "";
    const branch = Deno.env.get("ACUMATICA_BRANCH") || "";

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

    const paddedRef = referenceNumber.padStart(6, '0');
    const invoiceUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${paddedRef}'`;

    console.log(`Fetching invoice: ${invoiceUrl}`);

    const invoiceResponse = await fetch(invoiceUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
    });

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': cookies },
      }).catch(() => {});
      return new Response(
        JSON.stringify({ error: `Failed to fetch invoice: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const invoicesData = await invoiceResponse.json();
    const invoice = Array.isArray(invoicesData) && invoicesData.length > 0 ? invoicesData[0] : null;

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    if (!invoice) {
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dateFields = {
      Date: invoice.Date?.value || null,
      DueDate: invoice.DueDate?.value || null,
      CashDiscountDate: invoice.CashDiscountDate?.value || null,
      CreatedDateTime: invoice.CreatedDateTime?.value || null,
      LastModifiedDateTime: invoice.LastModifiedDateTime?.value || null,
    };

    return new Response(
      JSON.stringify({
        success: true,
        referenceNumber: paddedRef,
        dateFields,
        fullInvoice: invoice
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