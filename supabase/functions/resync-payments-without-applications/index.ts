import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let acumaticaUrl = Deno.env.get("ACUMATICA_BASE_URL")!;
    const acumaticaUsername = Deno.env.get("ACUMATICA_USERNAME")!;
    const acumaticaPassword = Deno.env.get("ACUMATICA_PASSWORD")!;

    // Ensure URL has https:// protocol
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    console.log("Finding payments without invoice applications...");

    // Find payments without any invoice applications
    const { data: paymentsWithoutApps, error: queryError } = await supabase
      .from("acumatica_payments")
      .select("id, reference_number, acumatica_id")
      .not("acumatica_id", "is", null)
      .limit(100); // Process 100 at a time to avoid timeout

    if (queryError) {
      throw new Error(`Failed to query payments: ${queryError.message}`);
    }

    // Filter to only those without applications
    const paymentsToResync = [];
    for (const payment of paymentsWithoutApps || []) {
      const { data: apps } = await supabase
        .from("payment_invoice_applications")
        .select("id")
        .eq("payment_id", payment.id)
        .limit(1);
      
      if (!apps || apps.length === 0) {
        paymentsToResync.push(payment);
      }
    }

    console.log(`Found ${paymentsToResync.length} payments to re-sync`);

    if (paymentsToResync.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No payments need re-syncing",
          payments_processed: 0,
          applications_created: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Authenticate with Acumatica
    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: acumaticaUsername,
        password: acumaticaPassword,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error("Failed to authenticate with Acumatica");
    }

    const cookies = loginResponse.headers.get("set-cookie");

    let totalApplications = 0;
    let processedCount = 0;

    // Re-fetch each payment from Acumatica
    for (const payment of paymentsToResync) {
      try {
        const paymentResponse = await fetch(
          `${acumaticaUrl}/entity/Default/24.200.001/Payment/${payment.acumatica_id}?$expand=ApplicationHistory`,
          {
            headers: {
              Cookie: cookies || "",
              Accept: "application/json",
            },
          }
        );

        if (!paymentResponse.ok) {
          console.error(`Failed to fetch payment ${payment.reference_number}`);
          continue;
        }

        const paymentData = await paymentResponse.json();
        const applicationHistory = paymentData.ApplicationHistory || [];

        // Extract invoice applications
        const invoiceApplications = applicationHistory.filter((app: any) => {
          const docType = app.DisplayDocType?.value || app.AdjustedDocType?.value || "";
          return docType.toLowerCase().includes("invoice");
        });

        if (invoiceApplications.length > 0) {
          const linksToInsert = invoiceApplications.map((app: any) => ({
            payment_id: payment.id,
            payment_reference_number: payment.reference_number,
            invoice_reference_number: app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value || "Unknown",
            customer_id: app.Customer?.value || paymentData.CustomerID?.value,
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
          }));

          const { error: insertError } = await supabase
            .from("payment_invoice_applications")
            .insert(linksToInsert);

          if (!insertError) {
            totalApplications += linksToInsert.length;
            processedCount++;
          } else {
            console.error(`Error inserting applications for payment ${payment.reference_number}:`, insertError.message);
          }
        }

        // Update the payment record with application_history
        await supabase
          .from("acumatica_payments")
          .update({
            application_history: applicationHistory,
            last_sync_timestamp: new Date().toISOString(),
          })
          .eq("id", payment.id);

      } catch (error: any) {
        console.error(`Error processing payment ${payment.reference_number}:`, error.message);
      }
    }

    // Logout from Acumatica
    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookies || "" },
    });

    console.log(`Re-synced ${processedCount} payments, created ${totalApplications} applications`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Re-synced ${processedCount} payments, created ${totalApplications} invoice applications`,
        payments_processed: processedCount,
        applications_created: totalApplications,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in resync-payments-without-applications:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
