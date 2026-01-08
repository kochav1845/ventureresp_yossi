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
    const {
      acumaticaUrl,
      username,
      password,
      company,
      branch,
    } = await req.json();

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const loginBody: any = {
      name: username,
      password: password,
    };

    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    console.log('Logging into Acumatica...');
    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication cookies received" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const tests = [];

    const endpoints = [
      {
        method: 'OData - UploadFile entities',
        url: `${acumaticaUrl}/odata/Default/UploadFile`
      },
      {
        method: 'OData - NoteDoc entities',
        url: `${acumaticaUrl}/odata/Default/NoteDoc`
      },
      {
        method: 'Generic Files endpoint',
        url: `${acumaticaUrl}/Frames/GetFile.ashx`
      },
      {
        method: 'Contract Based - All available entities',
        url: `${acumaticaUrl}/entity/Default/24.200.001`
      },
      {
        method: 'Screen Based API - AP301000 (Payments)',
        url: `${acumaticaUrl}/entity/Default/24.200.001/PaymentMethodDetail`
      }
    ];

    for (const endpoint of endpoints) {
      const testResult: any = {
        method: endpoint.method,
        url: endpoint.url
      };

      try {
        const response = await fetch(endpoint.url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        testResult.status = response.status;
        testResult.success = response.ok;

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          testResult.contentType = contentType;

          if (contentType?.includes('application/json')) {
            const data = await response.json();
            testResult.responseType = Array.isArray(data) ? 'array' : typeof data;

            if (Array.isArray(data)) {
              testResult.itemCount = data.length;
              if (data.length > 0) {
                testResult.firstItemKeys = Object.keys(data[0]);
                testResult.firstItemSample = JSON.stringify(data[0]).substring(0, 300);
              }
            } else if (typeof data === 'object') {
              testResult.dataKeys = Object.keys(data);
              if (data.value && Array.isArray(data.value)) {
                testResult.itemCount = data.value.length;
                if (data.value.length > 0) {
                  testResult.firstItemKeys = Object.keys(data.value[0]);
                }
              }
            }
          } else {
            const text = await response.text();
            testResult.responseSample = text.substring(0, 300);
          }
        } else {
          const errorText = await response.text();
          testResult.error = errorText.substring(0, 500);
        }
      } catch (error) {
        testResult.error = error instanceof Error ? error.message : 'Unknown error';
        testResult.success = false;
      }

      tests.push(testResult);
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Tested various Acumatica endpoints for file access",
        tests
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error testing Acumatica endpoints:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to test endpoints",
        details: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});