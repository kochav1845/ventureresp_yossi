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

    console.log("Starting payment-to-invoice link extraction...");

    const { data: payments, error: fetchError } = await supabase
      .from("acumatica_payments")
      .select("id, reference_number, customer_id, application_history")
      .not("application_history", "is", null);

    if (fetchError) {
      throw new Error(`Failed to fetch payments: ${fetchError.message}`);
    }

    console.log(`Found ${payments?.length || 0} payments with application history`);

    let totalLinks = 0;
    let processedPayments = 0;

    await supabase
      .from("payment_invoice_applications")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    for (const payment of payments || []) {
      const applicationHistory = payment.application_history;

      if (!Array.isArray(applicationHistory)) {
        continue;
      }

      if (applicationHistory.length === 0) {
        continue;
      }

      const linksToInsert = applicationHistory.map((app: any) => {
        const invoiceRef = app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value || "Unknown";
        const normalizedInvoiceRef = invoiceRef.replace(/^0+(?=\d)/, '');

        return {
          payment_id: payment.id,
          payment_reference_number: payment.reference_number,
          invoice_reference_number: normalizedInvoiceRef,
          customer_id: app.Customer?.value || payment.customer_id,
          application_date: app.Date?.value || null,
          amount_paid: app.AmountPaid?.value !== undefined ? parseFloat(app.AmountPaid.value) : 0,
          balance: app.Balance?.value !== undefined ? parseFloat(app.Balance.value) : 0,
          cash_discount_taken: app.CashDiscountTaken?.value !== undefined ? parseFloat(app.CashDiscountTaken.value) : 0,
          post_period: app.PostPeriod?.value || null,
          application_period: app.ApplicationPeriod?.value || null,
          due_date: app.DueDate?.value || null,
          customer_order: app.CustomerOrder?.value || null,
          description: app.Description?.value || null,
          invoice_date: app.Date?.value || null,
          doc_type: app.DisplayDocType?.value || app.AdjustedDocType?.value || 'Invoice',
        };
      });

      const { error: insertError } = await supabase
        .from("payment_invoice_applications")
        .insert(linksToInsert);

      if (insertError) {
        console.error(`Error inserting links for payment ${payment.reference_number}:`, insertError.message);
      } else {
        totalLinks += linksToInsert.length;
        processedPayments++;
      }
    }

    console.log(`Successfully extracted ${totalLinks} payment-to-invoice links from ${processedPayments} payments`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully extracted ${totalLinks} payment-to-invoice links from ${processedPayments} payments`,
        total_payments_processed: processedPayments,
        total_links_created: totalLinks,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in payment-invoice-links-sync:", error);

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