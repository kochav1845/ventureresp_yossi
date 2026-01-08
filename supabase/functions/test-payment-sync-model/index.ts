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

    // Get optional reference number from request
    let requestBody: any = {};
    try {
      requestBody = await req.json();
    } catch {
      // No body provided, use defaults
    }

    const targetRefNumber = requestBody.reference_number;

    const results: any[] = [];

    // Step 1: Get payment from database
    results.push({
      step: 'Database Query',
      status: 'pending',
      message: targetRefNumber
        ? `Fetching payment ${targetRefNumber}...`
        : 'Fetching most recent payment...'
    });

    let query = supabase
      .from('acumatica_payments')
      .select('*');

    if (targetRefNumber) {
      query = query.eq('reference_number', targetRefNumber);
    } else {
      query = query.order('last_modified_datetime', { ascending: false });
    }

    const { data: payment, error: dbError } = await query
      .limit(1)
      .maybeSingle();

    if (dbError) {
      results.push({
        step: 'Database Query',
        status: 'error',
        message: `Database error: ${dbError.message}`
      });
      throw dbError;
    }

    if (!payment) {
      results.push({
        step: 'Database Query',
        status: 'error',
        message: 'No payments found in database'
      });
      return new Response(
        JSON.stringify({ success: false, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    results.push({
      step: 'Database Query',
      status: 'success',
      message: `Found payment: ${payment.reference_number} (${payment.type})`,
      data: {
        reference_number: payment.reference_number,
        type: payment.type,
        customer_name: payment.customer_name,
        payment_amount: payment.payment_amount,
        status: payment.status,
        last_modified_datetime: payment.last_modified_datetime
      }
    });

    // Step 2: Get Acumatica credentials
    results.push({
      step: 'Credentials',
      status: 'pending',
      message: 'Loading Acumatica credentials...'
    });

    const { data: config, error: configError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      results.push({
        step: 'Credentials',
        status: 'error',
        message: 'Failed to load credentials'
      });
      return new Response(
        JSON.stringify({ success: false, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let acumaticaUrl = config.acumatica_url;
    if (!acumaticaUrl.startsWith('http')) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    results.push({
      step: 'Credentials',
      status: 'success',
      message: `Connected to ${config.acumatica_url}`
    });

    // Step 3: Login to Acumatica
    results.push({
      step: 'Login',
      status: 'pending',
      message: 'Authenticating with Acumatica...'
    });

    const loginBody: any = {
      name: config.username,
      password: config.password
    };
    if (config.company) loginBody.company = config.company;
    if (config.branch) loginBody.branch = config.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody)
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      results.push({
        step: 'Login',
        status: 'error',
        message: `Authentication failed: ${errorText}`
      });
      return new Response(
        JSON.stringify({ success: false, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      results.push({
        step: 'Login',
        status: 'error',
        message: 'No authentication cookies received'
      });
      return new Response(
        JSON.stringify({ success: false, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');
    results.push({
      step: 'Login',
      status: 'success',
      message: 'Authenticated successfully'
    });

    // Step 4: Fetch payment with expanded ApplicationHistory
    results.push({
      step: 'Payment Fetch',
      status: 'pending',
      message: `Fetching payment ${payment.reference_number} with applications...`
    });

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment.type)}/${encodeURIComponent(payment.reference_number)}?$expand=ApplicationHistory`;

    let applications: any[] = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const paymentResponse = await fetch(paymentUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cookie': cookies
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!paymentResponse.ok) {
        const errorText = await paymentResponse.text();
        results.push({
          step: 'Payment Fetch',
          status: 'error',
          message: `Failed to fetch payment: ${errorText}`
        });
      } else {
        const paymentData = await paymentResponse.json();

        // For closed payments, use ApplicationHistory instead of DocumentsToApply
        applications = paymentData.ApplicationHistory || paymentData.DocumentsToApply || [];

        const applicationSummary = applications.map(app => ({
          referenceNbr: app.ReferenceNbr?.value || app.RefNbr?.value,
          docType: app.DocType?.value,
          amountPaid: app.AmountPaid?.value,
          balance: app.Balance?.value,
          invoiceDate: app.DocDate?.value,
          appliedDate: app.ApplicationDate?.value || app.AdjgDocDate?.value
        }));

        results.push({
          step: 'Payment Fetch',
          status: 'success',
          message: `Found ${applications.length} application(s) using ${applications.length > 0 && paymentData.ApplicationHistory ? 'ApplicationHistory' : 'DocumentsToApply'}`,
          data: {
            payment: {
              referenceNbr: paymentData.ReferenceNbr?.value,
              type: paymentData.Type?.value,
              status: paymentData.Status?.value,
              paymentAmount: paymentData.PaymentAmount?.value,
              appliedToDocuments: paymentData.AppliedToDocuments?.value
            },
            applications: applicationSummary,
            fullPaymentData: paymentData
          }
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        results.push({
          step: 'Payment Fetch',
          status: 'error',
          message: 'Payment fetch timed out after 10 seconds'
        });
      } else {
        results.push({
          step: 'Payment Fetch',
          status: 'error',
          message: `Payment fetch error: ${error.message}`
        });
      }
    }

    // Step 5: Fetch attachments using $expand=files (lowercase)
    results.push({
      step: 'Attachments Fetch',
      status: 'pending',
      message: 'Fetching payment attachments...'
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const filesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(payment.type)}/${encodeURIComponent(payment.reference_number)}?$expand=files`;

      const filesResponse = await fetch(filesUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cookie': cookies
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!filesResponse.ok) {
        const errorText = await filesResponse.text();
        results.push({
          step: 'Attachments Fetch',
          status: 'error',
          message: `Failed to fetch files: ${filesResponse.status}`,
          data: { error: errorText, url: filesUrl }
        });
      } else {
        const data = await filesResponse.json();
        const filesData = data.files || data.Files || [];

        const fileSummary = filesData.map((file: any) => ({
          filename: file.filename?.value || file.filename || file.name?.value || file.name,
          size: file.size?.value || file.size,
          id: file.id?.value || file.id,
          fileId: file.FileID?.value || file.fileID
        }));

        results.push({
          step: 'Attachments Fetch',
          status: 'success',
          message: `Found ${filesData.length} attachment(s)`,
          data: {
            filesCount: filesData.length,
            files: fileSummary,
            fullFilesData: filesData
          }
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        results.push({
          step: 'Attachments Fetch',
          status: 'error',
          message: 'Attachments fetch timed out after 10 seconds'
        });
      } else {
        results.push({
          step: 'Attachments Fetch',
          status: 'error',
          message: `Attachments fetch error: ${error.message}`
        });
      }
    }

    // Step 6: Logout
    try {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: 'POST',
        headers: { 'Cookie': cookies }
      });
    } catch (error) {
      // Logout failure is not critical
    }

    results.push({
      step: 'Complete',
      status: 'success',
      message: 'Test completed successfully'
    });

    return new Response(
      JSON.stringify({
        success: true,
        payment: {
          reference_number: payment.reference_number,
          type: payment.type,
          customer_name: payment.customer_name,
          payment_amount: payment.payment_amount,
          status: payment.status,
          last_modified_datetime: payment.last_modified_datetime
        },
        applicationsCount: applications.length,
        results
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error('Test sync error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        results: []
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});