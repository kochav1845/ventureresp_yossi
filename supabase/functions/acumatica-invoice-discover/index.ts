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
    await req.json(); // Parse body even if empty

    // Get credentials from secure environment variables (server-side only)
    let acumaticaUrl = Deno.env.get("ACUMATICA_URL");
    const username = Deno.env.get("ACUMATICA_USERNAME");
    const password = Deno.env.get("ACUMATICA_PASSWORD");
    const company = Deno.env.get("ACUMATICA_COMPANY") || "";
    const branch = Deno.env.get("ACUMATICA_BRANCH") || "";

    // Ensure URL has protocol
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Acumatica credentials in server environment'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const loginBody: any = {
      name: username,
      password: password,
    };

    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      return new Response(
        JSON.stringify({
          success: false,
          error: `Authentication failed: ${errorText}`
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No authentication cookies received'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const invoiceUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$top=1`;

    const invoiceResponse = await fetch(invoiceUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
    });

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch invoice: ${errorText}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const invoicesData = await invoiceResponse.json();
    const invoice = Array.isArray(invoicesData) && invoicesData.length > 0 ? invoicesData[0] : null;

    if (!invoice) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No invoices found in the system'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        invoice
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in invoice discovery:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});