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

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Start date and end date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const loginBody: any = {
      name: credentials.username,
      password: credentials.password
    };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Acumatica authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication cookies received" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const filterStartDate = new Date(startDate).toISOString().split('.')[0];
    const filterEndDate = new Date(endDate).toISOString().split('.')[0];

    const paymentsUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=LastModifiedDateTime ge datetimeoffset'${filterStartDate}' and LastModifiedDateTime le datetimeoffset'${filterEndDate}'`;

    console.log(`Fetching payments from ${filterStartDate} to ${filterEndDate}`);

    const paymentsResponse = await fetch(paymentsUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!paymentsResponse.ok) {
      const errorText = await paymentsResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({ error: `Failed to fetch payments: ${errorText}` }),
        { status: paymentsResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentsData = await paymentsResponse.json();
    const payments = Array.isArray(paymentsData) ? paymentsData : [];

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const payment of payments) {
      try {
        let refNbr = payment.ReferenceNbr?.value;
        const type = payment.Type?.value;

        if (!refNbr || !type) {
          continue;
        }

        if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
          refNbr = refNbr.padStart(6, '0');
        }

        const paymentData: any = {
          reference_number: refNbr,
          type: type,
          status: payment.Status?.value || null,
          hold: payment.Hold?.value || false,
          application_date: payment.ApplicationDate?.value || payment.PaymentDate?.value || null,
          payment_amount: payment.PaymentAmount?.value || 0,
          available_balance: payment.UnappliedBalance?.value || 0,
          customer_id: payment.CustomerID?.value || null,
          customer_name: payment.CustomerName?.value || null,
          payment_method: payment.PaymentMethod?.value || null,
          cash_account: payment.CashAccount?.value || null,
          payment_ref: payment.PaymentRef?.value || null,
          description: payment.Description?.value || null,
          currency_id: payment.CurrencyID?.value || null,
          last_modified_datetime: payment.LastModifiedDateTime?.value || null,
          raw_data: payment,
          last_sync_timestamp: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('acumatica_payments')
          .select('id')
          .eq('reference_number', refNbr)
          .eq('type', type)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('acumatica_payments')
            .update(paymentData)
            .eq('reference_number', refNbr)
            .eq('type', type);

          if (error) {
            errors.push(`Update failed for ${refNbr}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabase
            .from('acumatica_payments')
            .insert(paymentData);

          if (error) {
            errors.push(`Insert failed for ${refNbr}: ${error.message}`);
          } else {
            created++;
          }
        }
      } catch (error: any) {
        errors.push(`Error processing payment: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment date range sync completed. Created ${created}, updated ${updated}, total fetched ${payments.length}`,
        created,
        updated,
        totalFetched: payments.length,
        errors: errors.slice(0, 10),
        totalErrors: errors.length,
        dateRange: { startDate: filterStartDate, endDate: filterEndDate }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Payment date range sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});