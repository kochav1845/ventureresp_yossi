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

    const {
      acumaticaUrl,
      username,
      password,
      company,
      branch,
      count = 100,
      skip = 0
    } = await req.json();

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials" }),
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
    const customersUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer?$top=${count}&$skip=${skip}`;

    console.log(`Fetching ${count} customers from Acumatica (skip: ${skip})`);

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
        JSON.stringify({
          success: false,
          error: `Failed to fetch customers: ${errorText}`
        }),
        {
          status: customersResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const customersData = await customersResponse.json();
    const customers = Array.isArray(customersData) ? customersData : [];

    console.log(`Retrieved ${customers.length} customers`);

    const customerFieldMapping: any = {
      'CustomerID': 'customer_id',
      'CustomerName': 'customer_name',
      'CustomerClass': 'customer_class',
      'Country': 'country',
      'City': 'city',
      'Terms': 'terms',
      'Status': 'customer_status',
      'Balance': 'balance',
      'DefaultPaymentMethod': 'default_payment_method',
      'Email': 'email_address',
      'BillingEmail': 'billing_email',
      'ShippingEmail': 'shipping_email',
      'CreditVerification': 'credit_verification',
      'CreditLimit': 'credit_limit',
      'PPDCustomer': 'ppd_customer',
      'PPDType': 'ppd_type',
      'BillingState': 'billing_state',
      'LocationID': 'location_id',
      'LocationShippingState': 'location_shipping_state',
      'Web': 'web',
      'Owner': 'owner',
      'ParentAccount': 'parent_account',
      'AccountName': 'account_name',
      'BAccountID': 'baccount_id',
      'AccountRef': 'account_ref',
      'note': 'note',
      'ApplyOverdueCharges': 'apply_overdue_charges',
      'AutoApplyPayments': 'auto_apply_payments',
      'BillingAddressOverride': 'billing_address_override',
      'BillingContactOverride': 'billing_contact_override',
      'CreatedDateTime': 'created_date_time',
      'CurrencyID': 'currency_id',
      'CurrencyRateType': 'currency_rate_type',
      'CustomerCategory': 'customer_category',
      'EnableCurrencyOverride': 'enable_currency_override',
      'EnableRateOverride': 'enable_rate_override',
      'EnableWriteOffs': 'enable_write_offs',
      'FOBPoint': 'fob_point',
      'IsGuestCustomer': 'is_guest_customer',
      'LastModifiedDateTime': 'last_modified_date_time',
      'LeadTimedays': 'lead_time_days',
      'LocationName': 'location_name',
      'MultiCurrencyStatements': 'multi_currency_statements',
      'NoteID': 'note_id',
      'OrderPriority': 'order_priority',
      'ParentRecord': 'parent_record',
      'PriceClassID': 'price_class_id',
      'PrimaryContactID': 'primary_contact_id',
      'PrintDunningLetters': 'print_dunning_letters',
      'PrintInvoices': 'print_invoices',
      'PrintStatements': 'print_statements',
      'ResidentialDelivery': 'residential_delivery',
      'SaturdayDelivery': 'saturday_delivery',
      'SendDunningLettersbyEmail': 'send_dunning_letters_by_email',
      'SendInvoicesbyEmail': 'send_invoices_by_email',
      'SendStatementsbyEmail': 'send_statements_by_email',
      'ShippingAddressOverride': 'shipping_address_override',
      'ShippingContactOverride': 'shipping_contact_override',
      'ShippingRule': 'shipping_rule',
      'ShippingTerms': 'shipping_terms',
      'ShippingZoneID': 'shipping_zone_id',
      'ShipVia': 'ship_via',
      'StatementCycleID': 'statement_cycle_id',
      'StatementType': 'statement_type',
      'TaxRegistrationID': 'tax_registration_id',
      'TaxZone': 'tax_zone',
      'WarehouseID': 'warehouse_id',
      'WriteOffLimit': 'write_off_limit',
    };

    let savedCount = 0;
    const errors: string[] = [];

    for (const customerData of customers) {
      try {
        const transformedCustomer: any = {
          raw_data: customerData,
          synced_at: new Date().toISOString(),
        };

        Object.keys(customerData).forEach(key => {
          if (customerData[key] && typeof customerData[key] === 'object' && 'value' in customerData[key]) {
            const value = customerData[key].value;

            if (customerFieldMapping[key]) {
              const dbField = customerFieldMapping[key];

              if (key.toLowerCase().includes('datetime') && value && typeof value === 'string') {
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

        const custId = transformedCustomer.customer_id;
        if (!custId) {
          errors.push('Customer missing ID');
          continue;
        }

        const { data: existing } = await supabase
          .from('acumatica_customers')
          .select('id')
          .eq('customer_id', custId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('acumatica_customers')
            .update(transformedCustomer)
            .eq('customer_id', custId);

          if (error) {
            errors.push(`Update error for ${custId}: ${error.message}`);
          } else {
            savedCount++;
          }
        } else {
          const { error } = await supabase
            .from('acumatica_customers')
            .insert(transformedCustomer);

          if (error) {
            errors.push(`Insert error for ${custId}: ${error.message}`);
          } else {
            savedCount++;
          }
        }
      } catch (error: any) {
        errors.push(`Processing error: ${error.message}`);
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    return new Response(
      JSON.stringify({
        success: true,
        savedCount,
        totalFetched: customers.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in bulk customer fetch:', error);
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