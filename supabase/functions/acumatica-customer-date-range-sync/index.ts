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

    const customersUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer?$filter=LastModifiedDateTime ge datetimeoffset'${filterStartDate}' and LastModifiedDateTime le datetimeoffset'${filterEndDate}'`;

    console.log(`Fetching customers from ${filterStartDate} to ${filterEndDate}`);

    const customersResponse = await fetch(customersUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!customersResponse.ok) {
      const errorText = await customersResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({ error: `Failed to fetch customers: ${errorText}` }),
        { status: customersResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customersData = await customersResponse.json();
    const customers = Array.isArray(customersData) ? customersData : [];

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const customer of customers) {
      try {
        const customerId = customer.CustomerID?.value;

        if (!customerId) {
          continue;
        }

        const customerData: any = {
          customer_id: customerId,
          customer_name: customer.CustomerName?.value || null,
          status: customer.Status?.value || null,
          customer_class: customer.CustomerClass?.value || null,
          credit_limit: customer.CreditLimit?.value || 0,
          balance: customer.Balance?.value || 0,
          current_balance: customer.CurrentBalance?.value || 0,
          overdue_balance: customer.OverdueBalance?.value || 0,
          primary_contact_email: customer.PrimaryContact?.Email?.value || null,
          primary_contact_phone: customer.PrimaryContact?.Phone1?.value || null,
          last_modified_datetime: customer.LastModifiedDateTime?.value || null,
          raw_data: customer,
          last_sync_timestamp: new Date().toISOString()
        };

        const { data: existing } = await supabase
          .from('acumatica_customers')
          .select('id')
          .eq('customer_id', customerId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('acumatica_customers')
            .update(customerData)
            .eq('customer_id', customerId);

          if (error) {
            errors.push(`Update failed for ${customerId}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabase
            .from('acumatica_customers')
            .insert(customerData);

          if (error) {
            errors.push(`Insert failed for ${customerId}: ${error.message}`);
          } else {
            created++;
          }
        }
      } catch (error: any) {
        errors.push(`Error processing customer: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Customer date range sync completed. Created ${created}, updated ${updated}, total fetched ${customers.length}`,
        created,
        updated,
        totalFetched: customers.length,
        errors: errors.slice(0, 10),
        totalErrors: errors.length,
        dateRange: { startDate: filterStartDate, endDate: filterEndDate }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Customer date range sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});