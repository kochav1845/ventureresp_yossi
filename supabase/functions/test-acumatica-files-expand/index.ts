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

    const referenceFormats = [
      paymentReferenceNumber,
      paymentReferenceNumber.padStart(6, '0'),
    ];

    let workingRefFormat = null;
    let paymentData = null;

    for (const refFormat of referenceFormats) {
      const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(refFormat)}?$expand=files`;

      try {
        console.log(`Trying payment URL with $expand=files: ${paymentUrl}`);
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
          console.log(`Payment found with reference: ${refFormat}`);
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
          message: "Could not find payment"
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const files = paymentData.files || [];
    const links = paymentData._links || {};

    console.log(`Files array: ${JSON.stringify(files)}`);
    console.log(`_links object: ${JSON.stringify(links)}`);

    const fileDetails = [];

    if (Array.isArray(files) && files.length > 0) {
      console.log(`Found ${files.length} files attached to payment`);

      for (const file of files) {
        const fileInfo: any = {
          id: file.id?.value || file.id,
          filename: file.filename?.value || file.filename,
          href: file.href?.value || file.href,
        };

        if (fileInfo.href) {
          try {
            const fullFileUrl = fileInfo.href.startsWith('http')
              ? fileInfo.href
              : `${acumaticaUrl}${fileInfo.href}`;

            console.log(`Attempting to download file from: ${fullFileUrl}`);

            const fileResponse = await fetch(fullFileUrl, {
              method: "GET",
              headers: {
                "Cookie": cookies,
              },
            });

            fileInfo.downloadStatus = fileResponse.status;
            fileInfo.downloadSuccess = fileResponse.ok;

            if (fileResponse.ok) {
              const contentType = fileResponse.headers.get('content-type');
              const contentLength = fileResponse.headers.get('content-length');
              fileInfo.contentType = contentType;
              fileInfo.contentLength = contentLength;
              fileInfo.message = "File successfully downloaded";
            } else {
              const errorText = await fileResponse.text();
              fileInfo.error = errorText.substring(0, 200);
            }
          } catch (error) {
            fileInfo.error = error instanceof Error ? error.message : 'Unknown error';
            fileInfo.downloadSuccess = false;
          }
        } else {
          fileInfo.message = "No href available for file";
        }

        fileDetails.push(fileInfo);
      }
    }

    const result = {
      success: true,
      paymentRefFormat: workingRefFormat,
      filesFound: files.length,
      hasFilesArray: Array.isArray(files),
      hasLinks: !!links,
      linksKeys: Object.keys(links),
      fileDetails,
      paymentTopLevelKeys: Object.keys(paymentData).filter(k =>
        k.toLowerCase().includes('file') ||
        k.toLowerCase().includes('attach') ||
        k.toLowerCase().includes('link')
      )
    };

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    return new Response(
      JSON.stringify(result),
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