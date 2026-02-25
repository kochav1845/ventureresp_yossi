import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchAndUpsertMissingInvoice(
  supabase: any,
  acumaticaUrl: string,
  cookies: string,
  invoiceRefNbr: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    console.log(`[FETCH-MISSING-INVOICE] Fetching invoice ${invoiceRefNbr} from Acumatica...`);

    const invoiceUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice/${invoiceRefNbr}`;
    const response = await fetch(invoiceUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 500) {
        console.log(`[FETCH-MISSING-INVOICE] Invoice ${invoiceRefNbr} not found in Acumatica (may be deleted or credit memo)`);
        return { success: false, error: 'Invoice not found in Acumatica' };
      }
      throw new Error(`Failed to fetch invoice: ${response.status}`);
    }

    const invoice = await response.json();
    console.log(`[FETCH-MISSING-INVOICE] Successfully fetched invoice ${invoiceRefNbr} from Acumatica`);

    const invoiceData = {
      type: invoice.Type?.value || 'Invoice',
      reference_number: invoice.ReferenceNbr?.value,
      customer_id: invoice.CustomerID?.value,
      customer_name: invoice.Customer?.value,
      status: invoice.Status?.value,
      date: invoice.Date?.value,
      due_date: invoice.DueDate?.value,
      invoice_amount: parseFloat(invoice.Amount?.value || 0),
      balance: parseFloat(invoice.Balance?.value || 0),
      description: invoice.Description?.value || null,
      customer_order: invoice.CustomerOrder?.value || null,
      terms: invoice.Terms?.value || null,
      location_id: invoice.LocationID?.value || null,
      currency: invoice.CurrencyID?.value || null,
      post_period: invoice.PostPeriod?.value || null,
      last_modified_date_time: invoice.LastModifiedDateTime?.value || new Date().toISOString(),
      created_date_time: invoice.CreatedDateTime?.value || null,
      last_sync_timestamp: new Date().toISOString(),
    };

    const { data: upsertedInvoice, error: upsertError } = await supabase
      .from('acumatica_invoices')
      .upsert(invoiceData, {
        onConflict: 'reference_number',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (upsertError) {
      console.error(`[FETCH-MISSING-INVOICE] Failed to upsert invoice ${invoiceRefNbr}:`, upsertError.message);
      return { success: false, error: upsertError.message };
    }

    console.log(`[FETCH-MISSING-INVOICE] ✓ Successfully upserted invoice ${invoiceRefNbr} into database`);
    return { success: true, invoiceId: upsertedInvoice.id };
  } catch (error: any) {
    console.error(`[FETCH-MISSING-INVOICE] Error fetching invoice ${invoiceRefNbr}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function getOrCreateSession(supabase: any, acumaticaUrl: string, credentials: any): Promise<string> {
  const { data: cachedSession } = await supabase
    .from("acumatica_session_cache")
    .select("*")
    .eq("is_valid", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    console.log("[SESSION] Using cached session from", new Date(cachedSession.created_at).toISOString());
    await supabase
      .from("acumatica_session_cache")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", cachedSession.id);

    return cachedSession.session_cookie;
  }

  console.log("[SESSION] No valid cached session, creating new one...");

  const loginBody: any = {
    name: credentials.username,
    password: credentials.password,
  };
  if (credentials.company) loginBody.company = credentials.company;
  if (credentials.branch) loginBody.branch = credentials.branch;

  const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginBody),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    console.error(`[SESSION] Login failed: ${loginResponse.status} - ${errorText}`);
    throw new Error(`Acumatica login failed: ${loginResponse.status}`);
  }

  const setCookieHeader = loginResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No cookies received from Acumatica");
  }

  const cookies = setCookieHeader.split(",").map((cookie) => cookie.split(";")[0]).join("; ");

  await supabase
    .from("acumatica_session_cache")
    .update({ is_valid: false })
    .eq("is_valid", true);

  await supabase
    .from("acumatica_session_cache")
    .insert({
      session_cookie: cookies,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      is_valid: true,
    });

  console.log("[SESSION] New session created and cached");
  return cookies;
}

async function invalidateSession(supabase: any, sessionCookie: string) {
  console.log("[SESSION] Invalidating session");
  await supabase
    .from("acumatica_session_cache")
    .update({ is_valid: false })
    .eq("session_cookie", sessionCookie);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    let paymentRef = url.searchParams.get("paymentRef");
    const paymentType = url.searchParams.get("type") || "Payment";

    if (!paymentRef) {
      console.error("[FETCH-APP] Missing paymentRef parameter");
      return new Response(
        JSON.stringify({ error: "paymentRef parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[FETCH-APP] START: Payment ${paymentRef} (${paymentType})`);

    if (/^[0-9]+$/.test(paymentRef) && paymentRef.length < 6) {
      const originalRef = paymentRef;
      paymentRef = paymentRef.padStart(6, '0');
      console.log(`[FETCH-APP] Normalized payment ref: ${originalRef} -> ${paymentRef}`);
    }

    const { data: credentials, error: credsError } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      console.error("[FETCH-APP] No credentials found:", credsError?.message);
      throw new Error("No active Acumatica credentials found");
    }

    console.log("[FETCH-APP] Credentials loaded successfully");

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    let cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials);

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${paymentType}/${paymentRef}?$expand=ApplicationHistory`;

    console.log(`[FETCH-APP] Fetching payment from: ${paymentUrl}`);

    let paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
    });

    if (paymentResponse.status === 401 || paymentResponse.status === 403) {
      console.log("[FETCH-APP] Session expired, invalidating and retrying with new session...");
      await invalidateSession(supabase, cookies);
      cookies = await getOrCreateSession(supabase, acumaticaUrl, credentials);

      paymentResponse = await fetch(paymentUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies,
        },
      });
    }

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      console.error(`[FETCH-APP] Payment fetch failed: ${paymentResponse.status} - ${errorText}`);

      if (paymentResponse.status === 500 && errorText.includes("No entity satisfies the condition")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Payment not found in Acumatica",
            payment_reference: paymentRef,
            details: "This payment may have been deleted or is not accessible. The record exists in your database but not in Acumatica.",
            durationMs: Date.now() - startTime
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Failed to fetch payment: ${paymentResponse.status} - ${errorText}`);
    }

    const payment = await paymentResponse.json();
    console.log(`[FETCH-APP] Payment fetched successfully`);
    console.log(`[FETCH-APP] Payment keys:`, Object.keys(payment).join(', '));
    console.log(`[FETCH-APP] ApplicationHistory exists:`, !!payment.ApplicationHistory);
    console.log(`[FETCH-APP] ApplicationHistory length:`, payment.ApplicationHistory?.length || 0);

    const applicationHistory: any[] = payment.ApplicationHistory || [];

    const applications = applicationHistory;

    console.log(`[FETCH-APP] Processing ${applications.length} applications`);

    const formattedApplications = applications.map((app: any) => ({
      docType: app.DisplayDocType?.value || app.AdjustedDocType?.value || "Unknown",
      refNbr: app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value || "Unknown",
      customerId: app.Customer?.value,
      customerName: app.CustomerName?.value,
      docDate: app.DocDate?.value,
      dueDate: app.DueDate?.value,
      amountPaid: parseFloat(app.AmountPaid?.value || 0),
      balance: parseFloat(app.Balance?.value || 0),
      cashDiscountTaken: parseFloat(app.CashDiscountTaken?.value || 0),
      description: app.Description?.value,
      postPeriod: app.PostPeriod?.value,
      customerOrder: app.CustomerOrder?.value,
    }));

    console.log(`[FETCH-APP] Looking up payment in database: ${paymentRef} (${paymentType})`);

    const { data: paymentData, error: paymentFetchError } = await supabase
      .from("acumatica_payments")
      .select("id, customer_id")
      .eq("reference_number", paymentRef)
      .eq("type", paymentType)
      .maybeSingle();

    if (paymentFetchError || !paymentData) {
      console.warn(`[FETCH-APP] Payment ${paymentRef} not found in database:`, paymentFetchError?.message || "No record");
      return new Response(
        JSON.stringify({
          success: true,
          payment_reference: paymentRef,
          applications: formattedApplications,
          raw_applications: applications,
          warning: "Payment not yet synced to database, applications fetched from Acumatica only"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[FETCH-APP] Payment found in database, ID: ${paymentData.id}`);

    const { error: updateError } = await supabase
      .from("acumatica_payments")
      .update({
        application_history: applications,
        last_sync_timestamp: new Date().toISOString(),
      })
      .eq("id", paymentData.id);

    if (updateError) {
      console.warn(`[FETCH-APP] Failed to update payment: ${updateError.message}`);
    } else {
      console.log(`[FETCH-APP] Updated payment record with application history`);
    }

    console.log(`[FETCH-APP] Deleting old payment applications for payment ID: ${paymentData.id}`);
    const { error: deleteError } = await supabase
      .from("payment_invoice_applications")
      .delete()
      .eq("payment_id", paymentData.id);

    if (deleteError) {
      console.warn(`[FETCH-APP] Failed to delete old applications: ${deleteError.message}`);
    }

    if (applications.length > 0) {
      console.log(`[FETCH-APP] Preparing ${applications.length} applications for insert...`);

      const applicationsToInsert = [];
      const validationWarnings = [];

      for (let index = 0; index < applications.length; index++) {
        const app = applications[index];
        let refNbr = app.DisplayRefNbr?.value || app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;

        if (!refNbr) {
          console.warn(`[FETCH-APP] Skipping application ${index + 1} with no reference number`);
          continue;
        }

        const originalRefNbr = refNbr;
        if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
          refNbr = refNbr.padStart(6, '0');
          console.log(`[FETCH-APP] App ${index + 1}: Normalized invoice ref ${originalRefNbr} -> ${refNbr}`);
        }

        const docType = app.DisplayDocType?.value || app.DocType?.value || app.AdjustedDocType?.value || "Invoice";

        const { data: invoiceExists } = await supabase
          .from('acumatica_invoices')
          .select('id, reference_number')
          .eq('reference_number', refNbr)
          .maybeSingle();

        if (!invoiceExists && docType === 'Invoice') {
          console.warn(`[FETCH-APP] Invoice ${refNbr} not found in database! Attempting to fetch from Acumatica...`);

          const fetchResult = await fetchAndUpsertMissingInvoice(
            supabase,
            acumaticaUrl,
            cookies,
            refNbr
          );

          if (fetchResult.success) {
            console.log(`[FETCH-APP] ✓ Successfully fetched and stored missing invoice ${refNbr}`);
          } else {
            const warning = `Invoice ${refNbr} not found in database or Acumatica: ${fetchResult.error}`;
            console.warn(`[FETCH-APP] WARNING: ${warning}`);
            validationWarnings.push(warning);
          }
        } else if (invoiceExists) {
          console.log(`[FETCH-APP] ✓ Invoice ${refNbr} exists in database`);
        }

        applicationsToInsert.push({
          payment_id: paymentData.id,
          payment_reference_number: paymentRef,
          invoice_reference_number: refNbr,
          doc_type: docType,
          customer_id: app.Customer?.value || paymentData.customer_id,
          application_date: app.Date?.value || null,
          amount_paid: parseFloat(app.AmountPaid?.value || 0),
          balance: parseFloat(app.Balance?.value || 0),
          cash_discount_taken: parseFloat(app.CashDiscountTaken?.value || 0),
          post_period: app.PostPeriod?.value || null,
          application_period: app.ApplicationPeriod?.value || null,
          due_date: app.DueDate?.value || null,
          customer_order: app.CustomerOrder?.value || null,
          description: app.Description?.value || null,
          invoice_date: app.Date?.value || null,
        });
      }

      if (applicationsToInsert.length > 0) {
        console.log(`[FETCH-APP] Inserting ${applicationsToInsert.length} applications...`);
        const { error: insertError } = await supabase
          .from("payment_invoice_applications")
          .insert(applicationsToInsert);

        if (insertError) {
          console.error("[FETCH-APP] Failed to insert applications:", insertError.message);
        } else {
          console.log(`[FETCH-APP] Successfully inserted ${applicationsToInsert.length} applications`);
          if (validationWarnings.length > 0) {
            console.log(`[FETCH-APP] ${validationWarnings.length} validation warnings:`, validationWarnings);
          }
        }
      } else {
        console.log(`[FETCH-APP] No valid applications to insert after validation`);
      }
    } else {
      console.log(`[FETCH-APP] No applications to insert`);
    }

    const duration = Date.now() - startTime;
    console.log(`[FETCH-APP] SUCCESS: Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        payment_reference: paymentRef,
        applications: formattedApplications,
        raw_applications: applications,
        durationMs: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[FETCH-APP] ERROR after ${duration}ms:`, error);
    console.error(`[FETCH-APP] Error stack:`, error.stack);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        durationMs: duration
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
