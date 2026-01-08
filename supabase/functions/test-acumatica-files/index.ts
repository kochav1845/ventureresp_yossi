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
      paymentType = 'Payment',
      paymentReferenceNumber
    } = await req.json();

    if (!acumaticaUrl || !username || !password || !paymentReferenceNumber) {
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

    const referenceFormats = [
      paymentReferenceNumber,
      paymentReferenceNumber.padStart(6, '0'),
      paymentReferenceNumber.padStart(7, '0'),
      paymentReferenceNumber.padStart(8, '0')
    ];

    let workingRefFormat = null;
    let paymentData = null;

    for (const refFormat of referenceFormats) {
      const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(refFormat)}`;

      const testResult: any = {
        method: 'GET Payment (base)',
        url: paymentUrl,
        refFormat: refFormat
      };

      try {
        const paymentResponse = await fetch(paymentUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        testResult.status = paymentResponse.status;
        testResult.success = paymentResponse.ok;

        if (paymentResponse.ok) {
          paymentData = await paymentResponse.json();
          testResult.hasFiles = !!paymentData.Files;
          testResult.filesCount = Array.isArray(paymentData.Files) ? paymentData.Files.length : 0;
          testResult.responseKeys = Object.keys(paymentData).slice(0, 20);
          workingRefFormat = refFormat;
          tests.push(testResult);
          break;
        } else {
          testResult.error = await paymentResponse.text();
        }
      } catch (error) {
        testResult.error = error instanceof Error ? error.message : 'Unknown error';
        testResult.success = false;
      }

      tests.push(testResult);
    }

    if (!workingRefFormat || !paymentData) {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });

      return new Response(
        JSON.stringify({
          success: false,
          message: "Could not find payment with any reference format",
          tests
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const testEndpoints = [
      {
        method: 'GET with $expand=Files',
        url: `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(workingRefFormat)}?$expand=Files`
      },
      {
        method: 'GET with $select=Files',
        url: `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(workingRefFormat)}?$select=Files`
      },
      {
        method: 'GET /Files endpoint',
        url: `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(workingRefFormat)}/Files`
      },
      {
        method: 'GET /Attachments endpoint',
        url: `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(workingRefFormat)}/Attachments`
      }
    ];

    for (const endpoint of testEndpoints) {
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
          const data = await response.json();
          testResult.responseType = Array.isArray(data) ? 'array' : typeof data;
          testResult.itemCount = Array.isArray(data) ? data.length : (data.Files ? (Array.isArray(data.Files) ? data.Files.length : 'not array') : 'no Files field');

          if (Array.isArray(data) && data.length > 0) {
            testResult.firstItemKeys = Object.keys(data[0]);
            testResult.firstItemSample = JSON.stringify(data[0]).substring(0, 300);
          } else if (data.Files && Array.isArray(data.Files) && data.Files.length > 0) {
            testResult.firstFileKeys = Object.keys(data.Files[0]);
            testResult.firstFileSample = JSON.stringify(data.Files[0]).substring(0, 300);
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
        workingRefFormat,
        paymentHasFilesField: !!paymentData.Files,
        paymentFilesCount: Array.isArray(paymentData.Files) ? paymentData.Files.length : 0,
        paymentTopLevelKeys: Object.keys(paymentData).slice(0, 30),
        tests
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error testing Acumatica files:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to test file access",
        details: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
