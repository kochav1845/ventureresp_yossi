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
      paymentRefNbr
    } = await req.json();

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing required credentials" }),
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

    console.log(`Logging in to Acumatica: ${acumaticaUrl}`);

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

    let paymentUrl: string;

    if (paymentRefNbr) {
      console.log(`Fetching specific payment ${paymentRefNbr}`);
      paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=ReferenceNbr eq '${paymentRefNbr}'`;
    } else {
      console.log('Fetching first payment to discover structure');
      paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$top=1`;
    }

    const paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch payment: ${errorText}`
        }),
        {
          status: paymentResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentData = await paymentResponse.json();
    const payment = Array.isArray(paymentData) && paymentData.length > 0 ? paymentData[0] : null;

    if (!payment) {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No payment found'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('Payment data fetched successfully');
    console.log('Payment structure:', JSON.stringify(Object.keys(payment), null, 2));
    console.log('Full payment object:', JSON.stringify(payment, null, 2));

    let appliedDocuments: any[] = [];
    let fetchAttempts: string[] = [];

    if (payment.AppliedToDocuments) {
      if (Array.isArray(payment.AppliedToDocuments)) {
        appliedDocuments = payment.AppliedToDocuments;
        fetchAttempts.push(`AppliedToDocuments found in payment: ${appliedDocuments.length} items`);
      } else if (typeof payment.AppliedToDocuments === 'object' && Object.keys(payment.AppliedToDocuments).length > 0) {
        appliedDocuments = [payment.AppliedToDocuments];
        fetchAttempts.push(`AppliedToDocuments found as single object`);
      } else {
        fetchAttempts.push(`AppliedToDocuments exists but is empty`);
      }
    }

    if (appliedDocuments.length === 0 && payment.ApplicationHistory) {
      if (Array.isArray(payment.ApplicationHistory)) {
        appliedDocuments = payment.ApplicationHistory;
        fetchAttempts.push(`ApplicationHistory found in payment: ${appliedDocuments.length} items`);
      }
    }

    if (appliedDocuments.length === 0) {
      const refNbr = payment.ReferenceNbr?.value || payment.ReferenceNbr;
      const type = payment.Type?.value || payment.Type;
      const paymentId = payment.id;

      const urlsToTry = [
        `${acumaticaUrl}/entity/Default/24.200.001/Payment/${type}/${refNbr}?$expand=ApplicationHistory`,
        `${acumaticaUrl}/entity/Default/24.200.001/Payment/${type}/${refNbr}/ApplicationHistory`,
        `${acumaticaUrl}/entity/Default/24.200.001/Payment/${paymentId}/ApplicationHistory`,
        `${acumaticaUrl}/entity/Default/24.200.001/Payment/${paymentId}/DocumentsToApply`,
      ];

      for (const url of urlsToTry) {
        fetchAttempts.push(`Trying: ${url}`);

        const appResponse = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        if (appResponse.ok) {
          const appData = await appResponse.json();
          console.log('Response from', url, ':', JSON.stringify(appData, null, 2));

          if (Array.isArray(appData) && appData.length > 0) {
            appliedDocuments = appData;
            fetchAttempts.push(`SUCCESS with ${url}: ${appliedDocuments.length} items`);
            break;
          } else if (appData && typeof appData === 'object') {
            if (appData.ApplicationHistory && Array.isArray(appData.ApplicationHistory)) {
              appliedDocuments = appData.ApplicationHistory;
              fetchAttempts.push(`SUCCESS with ${url}: Found ApplicationHistory with ${appliedDocuments.length} items`);
              break;
            }
            if (appData.AppliedToDocuments && Array.isArray(appData.AppliedToDocuments)) {
              appliedDocuments = appData.AppliedToDocuments;
              fetchAttempts.push(`SUCCESS with ${url}: Found AppliedToDocuments with ${appliedDocuments.length} items`);
              break;
            }
            if (appData.DocumentsToApply && Array.isArray(appData.DocumentsToApply)) {
              appliedDocuments = appData.DocumentsToApply;
              fetchAttempts.push(`SUCCESS with ${url}: Found DocumentsToApply with ${appliedDocuments.length} items`);
              break;
            }
          }
        } else {
          const errorText = await appResponse.text();
          fetchAttempts.push(`FAILED ${url}: ${appResponse.status} - ${errorText.substring(0, 200)}`);
        }
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    const fieldStructure = analyzeStructure(payment);

    return new Response(
      JSON.stringify({
        success: true,
        payment: payment,
        appliedDocuments: appliedDocuments,
        appliedDocumentsCount: appliedDocuments.length,
        fieldStructure: fieldStructure,
        appliedDocumentsStructure: appliedDocuments.length > 0
          ? analyzeStructure(appliedDocuments[0])
          : 'No applied documents',
        fetchAttempts: fetchAttempts
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in payment discovery:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function analyzeStructure(obj: any, prefix = ''): any {
  const structure: any = {};

  for (const key in obj) {
    const value = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      structure[fullKey] = 'null';
    } else if (Array.isArray(value)) {
      structure[fullKey] = {
        type: 'array',
        length: value.length,
        sample: value.length > 0 ? analyzeStructure(value[0], '') : 'empty'
      };
    } else if (typeof value === 'object' && value !== null) {
      if ('value' in value) {
        structure[fullKey] = {
          type: typeof value.value,
          value: value.value
        };
      } else {
        structure[fullKey] = analyzeStructure(value, '');
      }
    } else {
      structure[fullKey] = {
        type: typeof value,
        value: value
      };
    }
  }

  return structure;
}
