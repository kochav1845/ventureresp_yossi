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
    ];

    let workingRefFormat = null;
    let paymentData = null;

    for (const refFormat of referenceFormats) {
      const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(refFormat)}`;

      try {
        const paymentResponse = await fetch(paymentUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        if (paymentResponse.ok) {
          paymentData = await paymentResponse.json();
          workingRefFormat = refFormat;
          tests.push({
            method: 'GET Payment',
            url: paymentUrl,
            refFormat: refFormat,
            status: 200,
            success: true,
            noteId: paymentData.NoteID?.value || paymentData.NoteID
          });
          break;
        }
      } catch (error) {
        console.error('Error fetching payment:', error);
      }
    }

    if (!workingRefFormat || !paymentData) {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });

      return new Response(
        JSON.stringify({
          success: false,
          message: "Could not find payment",
          tests
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const noteId = paymentData.NoteID?.value || paymentData.NoteID;

    if (!noteId) {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });

      return new Response(
        JSON.stringify({
          success: false,
          message: "Payment has no NoteID",
          paymentData: paymentData,
          tests
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const fileEndpoints = [
      {
        method: 'Files by NoteID',
        url: `${acumaticaUrl}/entity/Default/24.200.001/Files?$filter=NoteID eq guid'${noteId}'`
      },
      {
        method: 'Files by NoteID (no filter)',
        url: `${acumaticaUrl}/entity/Default/24.200.001/Files/${noteId}`
      },
      {
        method: 'File entity with NoteID',
        url: `${acumaticaUrl}/entity/Default/24.200.001/File?$filter=NoteID eq guid'${noteId}'`
      }
    ];

    for (const endpoint of fileEndpoints) {
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
          testResult.itemCount = Array.isArray(data) ? data.length : 'N/A';

          if (Array.isArray(data) && data.length > 0) {
            testResult.firstItemKeys = Object.keys(data[0]);
            testResult.firstItemSample = JSON.stringify(data[0]).substring(0, 500);
          } else if (!Array.isArray(data)) {
            testResult.dataKeys = Object.keys(data);
            testResult.dataSample = JSON.stringify(data).substring(0, 500);
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
        paymentRefFormat: workingRefFormat,
        noteId,
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