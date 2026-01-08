import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { url, username, password, company, branch } = await req.json();

    if (!url || !username || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Missing required credentials (url, username, password)"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const acumaticaUrl = url.startsWith('http') ? url : `https://${url}`;

    const loginBody: any = { name: username, password: password };
    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log(`Testing credentials for ${acumaticaUrl}`);

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      let errorMessage = errorText;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.exceptionMessage || errorJson.message || errorText;
      } catch (e) {
        // Keep original error text
      }

      console.error('Login failed:', errorMessage);

      return new Response(
        JSON.stringify({
          success: false,
          message: `Authentication failed: ${errorMessage}`,
          details: errorText,
          statusCode: loginResponse.status
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No authentication cookies received from Acumatica'
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    console.log('Login successful, testing API access...');

    const testUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer?$top=1`;
    const testResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
      },
    });

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('API test failed:', errorText);

      return new Response(
        JSON.stringify({
          success: false,
          message: `API test failed: ${errorText}`,
          details: errorText,
          statusCode: testResponse.status
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await testResponse.json();
    const customerCount = Array.isArray(data) ? data.length : 0;

    console.log(`Test successful! Retrieved ${customerCount} customer(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Successfully authenticated and tested API access!',
        details: `Retrieved ${customerCount} customer(s) in test query`,
        customerCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error('Error testing credentials:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: `Error: ${error.message}`,
        details: error.stack
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});