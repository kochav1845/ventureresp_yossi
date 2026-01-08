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
      paymentReferenceNumber
    } = await req.json();

    if (!acumaticaUrl || !username || !password || !paymentReferenceNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: acumaticaUrl, username, password, paymentReferenceNumber" }),
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

    console.log('Step 1: Logging into Acumatica Contract-Based API...');
    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      return new Response(
        JSON.stringify({ 
          error: "Authentication failed",
          status: loginResponse.status,
          details: errorText
        }),
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
    console.log('✓ Authentication successful');

    const apiVersions = ['24.200.001', '23.200.001', '22.200.001', '20.200.001'];
    const referenceFormats = [
      paymentReferenceNumber,
      paymentReferenceNumber.padStart(6, '0'),
      paymentReferenceNumber.padStart(7, '0'),
      paymentReferenceNumber.padStart(8, '0')
    ];

    const results: any[] = [];
    let successfulCall = null;

    // Try different URL patterns for Contract-Based API
    for (const apiVersion of apiVersions) {
      // Pattern 1: Try listing all payments first with filter
      const listUrl = `${acumaticaUrl}/entity/Default/${apiVersion}/Payment?$filter=ReferenceNbr eq '${paymentReferenceNumber}'&$expand=Files`;
      
      const test: any = {
        apiVersion,
        pattern: 'List with filter',
        url: listUrl
      };

      try {
        const response = await fetch(listUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        test.status = response.status;
        test.ok = response.ok;

        if (response.ok) {
          const data = await response.json();
          test.responseType = Array.isArray(data) ? 'array' : typeof data;
          test.itemCount = Array.isArray(data) ? data.length : 0;
          
          if (Array.isArray(data) && data.length > 0) {
            test.topLevelKeys = Object.keys(data[0]);
            test.hasFiles = 'Files' in data[0];
            test.filesType = typeof data[0].Files;
            test.filesCount = Array.isArray(data[0].Files) ? data[0].Files.length : 0;
            
            if (Array.isArray(data[0].Files) && data[0].Files.length > 0) {
              test.firstFileKeys = Object.keys(data[0].Files[0]);
              successfulCall = {
                apiVersion,
                pattern: 'List with filter',
                url: listUrl,
                filesCount: data[0].Files.length,
                files: data[0].Files,
                payment: data[0]
              };
            }
          }
        } else {
          const errorText = await response.text();
          test.errorText = errorText.substring(0, 200);
        }
      } catch (error) {
        test.error = error instanceof Error ? error.message : 'Unknown error';
      }

      results.push(test);
      
      if (successfulCall) {
        break;
      }

      // Pattern 2: Try different reference formats with direct access
      for (const refFormat of referenceFormats) {
        // Try: /Payment?$filter=...
        const filterUrl = `${acumaticaUrl}/entity/Default/${apiVersion}/Payment?$filter=ReferenceNbr eq '${refFormat}'&$expand=Files`;
        
        const test2: any = {
          apiVersion,
          refFormat,
          pattern: 'Filter by ReferenceNbr',
          url: filterUrl
        };

        try {
          const response = await fetch(filterUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "Cookie": cookies,
            },
          });

          test2.status = response.status;
          test2.ok = response.ok;

          if (response.ok) {
            const data = await response.json();
            test2.responseType = Array.isArray(data) ? 'array' : typeof data;
            test2.itemCount = Array.isArray(data) ? data.length : 0;
            
            if (Array.isArray(data) && data.length > 0) {
              test2.topLevelKeys = Object.keys(data[0]);
              test2.hasFiles = 'Files' in data[0];
              test2.filesCount = Array.isArray(data[0].Files) ? data[0].Files.length : 0;
              
              if (Array.isArray(data[0].Files) && data[0].Files.length > 0) {
                successfulCall = {
                  apiVersion,
                  refFormat,
                  pattern: 'Filter by ReferenceNbr',
                  url: filterUrl,
                  filesCount: data[0].Files.length,
                  files: data[0].Files,
                  payment: data[0]
                };
              }
            }
          } else {
            const errorText = await response.text();
            test2.errorText = errorText.substring(0, 200);
          }
        } catch (error) {
          test2.error = error instanceof Error ? error.message : 'Unknown error';
        }

        results.push(test2);
        
        if (successfulCall) {
          break;
        }
      }

      if (successfulCall) {
        break;
      }
    }

    // Logout
    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    return new Response(
      JSON.stringify({
        success: !!successfulCall,
        successfulCall,
        allTests: results,
        summary: {
          totalTests: results.length,
          successfulTests: results.filter((r: any) => r.ok).length,
          foundFiles: !!successfulCall
        }
      }, null, 2),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error testing Contract-Based API:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to test Contract-Based API",
        details: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});