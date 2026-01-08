import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    // Get date range from query params
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const customerId = url.searchParams.get("customerId");

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();
    console.log(`Calculating analytics for ${startDate} to ${endDate}`);

    // Query 1: Get payments with customer info
    const queryStart = Date.now();
    let paymentsQuery = supabase
      .from("acumatica_payments")
      .select("id, reference_number, customer_id, application_date, payment_amount, type")
      .gte("application_date", startDate)
      .lte("application_date", endDate)
      .not("payment_amount", "is", null);

    if (customerId && customerId !== "all") {
      paymentsQuery = paymentsQuery.eq("customer_id", customerId);
    }

    const { data: payments, error: paymentsError } = await paymentsQuery;
    if (paymentsError) throw paymentsError;

    console.log(`Query took ${Date.now() - queryStart}ms - Fetched ${payments.length} payments`);

    // Query 2: Get customer names
    const custStart = Date.now();
    const customerIds = [...new Set(payments.map(p => p.customer_id))];
    const { data: customers } = await supabase
      .from("acumatica_customers")
      .select("customer_id, customer_name")
      .in("customer_id", customerIds.length > 0 ? customerIds : [""]);

    console.log(`Customer query took ${Date.now() - custStart}ms - ${customers?.length || 0} customers`);
    const customerMap = new Map(customers?.map(c => [c.customer_id, c.customer_name]) || []);

    // Calculate totals
    let paymentsSum = 0;
    let creditMemosSum = 0;
    const paymentsByCustomer = new Map<string, { total: number; count: number }>();
    const paymentsByMonth = new Map<string, number>();

    payments.forEach(payment => {
      const amount = parseFloat(payment.payment_amount || "0");

      // Total by type
      if (payment.type === "Payment") {
        paymentsSum += amount;
      } else if (payment.type === "Credit Memo") {
        creditMemosSum += amount;
      }

      // By customer
      const customerId = payment.customer_id;
      if (!paymentsByCustomer.has(customerId)) {
        paymentsByCustomer.set(customerId, { total: 0, count: 0 });
      }
      const customerData = paymentsByCustomer.get(customerId)!;
      customerData.total += amount;
      customerData.count++;

      // By month
      const month = payment.application_date.substring(0, 7); // YYYY-MM
      paymentsByMonth.set(month, (paymentsByMonth.get(month) || 0) + amount);
    });

    // Format top customers
    const topCustomers = Array.from(paymentsByCustomer.entries())
      .map(([customerId, data]) => ({
        customer_id: customerId,
        customer_name: customerMap.get(customerId) || customerId,
        total_paid: data.total,
        payment_count: data.count,
      }))
      .sort((a, b) => b.total_paid - a.total_paid)
      .slice(0, 10);

    // Format monthly trend (last 12 months)
    const monthlyTrend = Array.from(paymentsByMonth.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);

    // Query 3: Get unpaid invoice stats (only if no customer filter)
    let unpaidStats = { count: 0, total: 0 };
    if (!customerId || customerId === "all") {
      const { data: statsData } = await supabase.rpc("get_unpaid_invoice_stats");
      if (statsData && statsData.length > 0) {
        unpaidStats = {
          count: statsData[0].unpaid_count || 0,
          total: parseFloat(statsData[0].unpaid_balance || "0"),
        };
      }
    }

    // Prepare enriched payment data (limit to 100 most recent)
    const enrichStart = Date.now();
    const enrichedPayments = payments
      .slice(0, 100)
      .map(p => ({
        payment_reference_number: p.reference_number,
        customer_id: p.customer_id,
        customer_name: customerMap.get(p.customer_id) || p.customer_id,
        application_date: p.application_date,
        amount_paid: p.payment_amount,
        type: p.type,
        payment_id: p.id,
      }));
    console.log(`Enrichment took ${Date.now() - enrichStart}ms`);

    const result = {
      summary: {
        paymentsTotal: paymentsSum,
        creditMemosTotal: creditMemosSum,
        paymentCount: payments.length,
        unpaidInvoicesCount: unpaidStats.count,
        unpaidInvoicesTotal: unpaidStats.total,
        avgPayment: payments.length > 0 ? (paymentsSum + creditMemosSum) / payments.length : 0,
      },
      topCustomers,
      monthlyTrend,
      payments: enrichedPayments,
    };

    console.log(`Total processing time: ${Date.now() - startTime}ms`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error calculating analytics:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
