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

    const webhookData = await req.json();
    console.log('Received customer webhook:', JSON.stringify(webhookData, null, 2));

    const customerId = webhookData.Entity?.CustomerID?.value || webhookData.CustomerID;
    
    if (!customerId) {
      console.error('No customer ID found in webhook data');
      return new Response(
        JSON.stringify({ error: "No customer ID provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing customer webhook for: ${customerId}`);

    const acumaticaUrl = Deno.env.get("ACUMATICA_URL");
    const username = Deno.env.get("ACUMATICA_USERNAME");
    const password = Deno.env.get("ACUMATICA_PASSWORD");
    const company = Deno.env.get("ACUMATICA_COMPANY");
    const branch = Deno.env.get("ACUMATICA_BRANCH");

    if (!acumaticaUrl || !username || !password) {
      console.log('Acumatica credentials not configured, storing webhook data only');
      
      await supabase.from('webhook_logs').insert({
        webhook_type: 'customer',
        entity_id: customerId,
        payload: webhookData,
        status: 'pending_credentials',
        received_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook received, awaiting Acumatica credentials configuration',
          customerId 
        }),
        {
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

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error('Acumatica authentication failed');
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      throw new Error('No authentication cookies received');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const customerUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer/${encodeURIComponent(customerId)}`;
    
    const customerResponse = await fetch(customerUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!customerResponse.ok) {
      throw new Error(`Failed to fetch customer data: ${customerResponse.statusText}`);
    }

    const customerData = await customerResponse.json();

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    const customerFieldMapping: any = {
      'CustomerID': 'customer_id',
      'CustomerName': 'customer_name',
      'Status': 'status',
      'AccountRef': 'account_ref',
      'ParentAccount': 'parent_account',
      'CustomerClass': 'customer_class',
      'CreditLimit': 'credit_limit',
      'CreditVerification': 'credit_verification',
      'CurrencyID': 'currency_id',
      'CreditDaysPastDue': 'credit_days_past_due',
      'OverdueBalance': 'overdue_balance',
      'RemainingCreditLimit': 'remaining_credit_limit',
      'CurrentBalance': 'current_balance',
      'UnreleasedBalance': 'unreleased_balance',
      'OpenOrdersBalance': 'open_orders_balance',
      'StatementCycleID': 'statement_cycle_id',
      'SendStatementsByEmail': 'send_statements_by_email',
      'PrintStatements': 'print_statements',
      'AcceptAutoPayments': 'accept_auto_payments',
      'PriceClassID': 'price_class_id',
      'TaxZone': 'tax_zone',
      'Terms': 'terms',
      'ShippingRule': 'shipping_rule',
      'ShipVia': 'ship_via',
      'LeadTimedays': 'lead_time_days',
      'LocationName': 'location_name',
      'MultiCurrency': 'multi_currency',
      'NoteID': 'note_id',
      'LastModifiedDateTime': 'last_modified_datetime',
    };

    const transformedCustomer: any = {
      raw_data: customerData,
      synced_at: new Date().toISOString(),
    };

    if (customerData.id) {
      transformedCustomer.acumatica_id = customerData.id;
    }

    if (customerData.rowNumber !== undefined) {
      transformedCustomer.row_number = customerData.rowNumber;
    }

    Object.keys(customerData).forEach(key => {
      if (customerData[key] && typeof customerData[key] === 'object' && 'value' in customerData[key]) {
        const value = customerData[key].value;

        if (customerFieldMapping[key]) {
          const dbField = customerFieldMapping[key];

          if ((key.toLowerCase().includes('datetime') || key.toLowerCase().includes('date')) && value && typeof value === 'string') {
            try {
              transformedCustomer[dbField] = new Date(value).toISOString();
            } catch {
              transformedCustomer[dbField] = value;
            }
          } else if (typeof value === 'boolean') {
            transformedCustomer[dbField] = value;
          } else if (typeof value === 'number') {
            transformedCustomer[dbField] = value;
          } else if (typeof value === 'string') {
            if (/^-?\d+\.\d+$/.test(value) || /^-?\d+$/.test(value)) {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                transformedCustomer[dbField] = numValue;
              } else {
                transformedCustomer[dbField] = value;
              }
            } else {
              transformedCustomer[dbField] = value;
            }
          } else if (value !== null && value !== undefined) {
            transformedCustomer[dbField] = value;
          }
        }
      }
    });

    const { data: existing } = await supabase
      .from('acumatica_customers')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from('acumatica_customers')
        .update(transformedCustomer)
        .eq('customer_id', customerId);
      console.log(`Updated existing customer: ${customerId}`);
    } else {
      result = await supabase
        .from('acumatica_customers')
        .insert(transformedCustomer);
      console.log(`Inserted new customer: ${customerId}`);
    }

    if (result.error) {
      throw new Error(`Database error: ${result.error.message}`);
    }

    await supabase.from('webhook_logs').insert({
      webhook_type: 'customer',
      entity_id: customerId,
      payload: webhookData,
      status: 'processed',
      received_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Customer synced successfully',
        customerId,
        action: existing ? 'updated' : 'created'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in customer webhook:', error);
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