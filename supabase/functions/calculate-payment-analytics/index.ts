import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CalculateRequest {
  periodType?: 'daily' | 'monthly' | 'yearly';
  year?: number;
  month?: number;
  day?: number;
  startDate?: string;
  endDate?: string;
}

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

    const { periodType, year, month, day, startDate, endDate }: CalculateRequest = await req.json().catch(() => ({}));

    // If no parameters provided, calculate for current month
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month; // Don't default month - let it be undefined for full year calculations
    const targetPeriodType = periodType || 'monthly';

    console.log(`Calculating ${targetPeriodType} analytics for year=${targetYear}, month=${targetMonth || 'all'}, day=${day}`);

    let queryStartDate: string;
    let queryEndDate: string;
    let calculationDate: string | null = null;

    // Determine date range based on period type
    if (startDate && endDate) {
      queryStartDate = startDate;
      queryEndDate = endDate;
    } else if (targetPeriodType === 'daily') {
      // For daily, calculate for specific day or entire month of days
      if (day) {
        const date = new Date(targetYear, targetMonth - 1, day);
        queryStartDate = date.toISOString().split('T')[0];
        queryEndDate = queryStartDate;
        calculationDate = queryStartDate;
      } else {
        // Calculate for all days in the month
        const firstDay = new Date(targetYear, targetMonth - 1, 1);
        const lastDay = new Date(targetYear, targetMonth, 0);
        queryStartDate = firstDay.toISOString().split('T')[0];
        queryEndDate = lastDay.toISOString().split('T')[0];
      }
    } else if (targetPeriodType === 'monthly') {
      // For monthly, calculate for entire year or specific month
      if (targetMonth) {
        const firstDay = new Date(targetYear, targetMonth - 1, 1);
        const lastDay = new Date(targetYear, targetMonth, 0);
        queryStartDate = firstDay.toISOString().split('T')[0];
        queryEndDate = lastDay.toISOString().split('T')[0];
      } else {
        // Calculate for entire year (all months)
        queryStartDate = `${targetYear}-01-01`;
        queryEndDate = `${targetYear}-12-31`;
      }
    } else {
      // Yearly - calculate for last 6 years
      const currentYear = now.getFullYear();
      queryStartDate = `${currentYear - 5}-01-01`;
      queryEndDate = `${currentYear}-12-31`;
    }

    console.log(`Query date range: ${queryStartDate} to ${queryEndDate}`);

    // Fetch all payments in the date range in batches
    const allPayments: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('acumatica_payments')
        .select('application_date, payment_amount, customer_id, type, payment_method, status')
        .gte('application_date', queryStartDate)
        .lte('application_date', queryEndDate)
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('Error fetching payments:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      allPayments.push(...data);

      if (data.length < batchSize) {
        hasMore = false;
      }

      offset += batchSize;
    }

    console.log(`Fetched ${allPayments.length} payments`);

    // Process based on period type
    if (targetPeriodType === 'daily') {
      // Group by day
      const dayGroups = new Map<string, any[]>();

      allPayments.forEach(payment => {
        const date = payment.application_date?.split('T')[0] || payment.application_date;
        if (!dayGroups.has(date)) {
          dayGroups.set(date, []);
        }
        dayGroups.get(date)!.push(payment);
      });

      // Calculate and store for each day
      for (const [date, payments] of dayGroups.entries()) {
        const dateObj = new Date(date);
        const dayYear = dateObj.getFullYear();
        const dayMonth = dateObj.getMonth() + 1;
        const dayDay = dateObj.getDate();

        await calculateAndStore(supabase, 'daily', payments, dayYear, dayMonth, dayDay, date);
      }

      return new Response(
        JSON.stringify({
          success: true,
          periodType: 'daily',
          daysCalculated: dayGroups.size,
          totalPayments: allPayments.length
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (targetPeriodType === 'monthly') {
      // Group by month
      const monthGroups = new Map<string, any[]>();

      allPayments.forEach(payment => {
        const date = new Date(payment.application_date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        if (!monthGroups.has(monthKey)) {
          monthGroups.set(monthKey, []);
        }
        monthGroups.get(monthKey)!.push(payment);
      });

      // Calculate and store for each month
      for (const [monthKey, payments] of monthGroups.entries()) {
        const [monthYear, monthNum] = monthKey.split('-').map(Number);
        await calculateAndStore(supabase, 'monthly', payments, monthYear, monthNum, null, null);
      }

      return new Response(
        JSON.stringify({
          success: true,
          periodType: 'monthly',
          monthsCalculated: monthGroups.size,
          totalPayments: allPayments.length
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Yearly
      const yearGroups = new Map<number, any[]>();

      allPayments.forEach(payment => {
        const date = new Date(payment.application_date);
        const yearNum = date.getFullYear();
        if (!yearGroups.has(yearNum)) {
          yearGroups.set(yearNum, []);
        }
        yearGroups.get(yearNum)!.push(payment);
      });

      // Calculate and store for each year
      for (const [yearNum, payments] of yearGroups.entries()) {
        await calculateAndStore(supabase, 'yearly', payments, yearNum, null, null, null);
      }

      return new Response(
        JSON.stringify({
          success: true,
          periodType: 'yearly',
          yearsCalculated: yearGroups.size,
          totalPayments: allPayments.length
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error('Error calculating payment analytics:', error);
    return new Response(
      JSON.stringify({
        error: "Failed to calculate payment analytics",
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function calculateAndStore(
  supabase: any,
  periodType: string,
  payments: any[],
  year: number,
  month: number | null,
  day: number | null,
  date: string | null
) {
  // Calculate aggregates
  const totalAmount = payments.reduce((sum, p) => sum + (parseFloat(p.payment_amount) || 0), 0);
  const paymentCount = payments.length;
  const uniqueCustomers = new Set(payments.map(p => p.customer_id).filter(Boolean));
  const uniqueCustomerCount = uniqueCustomers.size;

  // Calculate breakdowns
  const paymentTypes: Record<string, number> = {};
  const paymentMethods: Record<string, number> = {};
  const statusBreakdown: Record<string, number> = {};

  payments.forEach(p => {
    if (p.type) {
      paymentTypes[p.type] = (paymentTypes[p.type] || 0) + 1;
    }
    if (p.payment_method) {
      paymentMethods[p.payment_method] = (paymentMethods[p.payment_method] || 0) + 1;
    }
    if (p.status) {
      statusBreakdown[p.status] = (statusBreakdown[p.status] || 0) + 1;
    }
  });

  // Upsert into cache table
  const { error } = await supabase
    .from('cached_payment_analytics')
    .upsert({
      period_type: periodType,
      year,
      month,
      day,
      date,
      total_amount: totalAmount,
      payment_count: paymentCount,
      unique_customer_count: uniqueCustomerCount,
      payment_types: paymentTypes,
      payment_methods: paymentMethods,
      status_breakdown: statusBreakdown,
      calculated_at: new Date().toISOString()
    }, {
      onConflict: 'period_type,year,month,day'
    });

  if (error) {
    console.error(`Error storing analytics for ${periodType} ${year}-${month}-${day}:`, error);
    throw error;
  }

  console.log(`Stored analytics: ${periodType} ${year}-${month || ''}-${day || ''}: $${totalAmount.toFixed(2)}, ${paymentCount} payments, ${uniqueCustomerCount} customers`);
}
