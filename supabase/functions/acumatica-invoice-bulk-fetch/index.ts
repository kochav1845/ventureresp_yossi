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
      count = 100,
      skip = 0,
      statusFilter = 'open-balanced',
      fetchNewestFirst = true
    } = await req.json();

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      return new Response(
        JSON.stringify({ error: `No active Acumatica credentials found: ${credsError?.message || 'No credentials in database'}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let acumaticaUrl = credentials.acumatica_url;
    const username = credentials.username;
    const password = credentials.password;
    const company = credentials.company || "";
    const branch = credentials.branch || "";

    console.log('Using credentials from database:', {
      url: acumaticaUrl,
      username,
      hasPassword: !!password
    });

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials" }),
        {
          status: 500,
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

    let filter = "";
    let filterDescription = "";

    if (statusFilter === 'open-balanced') {
      filter = "?$filter=Status eq 'Open' or Status eq 'Balanced'";
      filterDescription = "Open or Balanced";
    } else if (statusFilter === 'closed-only') {
      filter = "?$filter=Status eq 'Closed'";
      filterDescription = "Closed Only";
    } else {
      filter = "";
      filterDescription = "All Statuses";
    }

    const separator = filter ? "&" : "?";
    const orderBy = fetchNewestFirst ? "$orderby=Date desc" : "$orderby=Date asc";
    const selectFields = "$select=Type,ReferenceNbr,Customer,CustomerName,CustomerOrder,CustomerOrderNbr,Status,Date,DueDate,PostPeriod,Terms,Balance,Amount,CurrencyID,Description,Hold,LocationID,TaxTotal,CreatedDateTime,LastModifiedDateTime,CashDiscountDate";
    const invoicesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice${filter}${separator}${selectFields}&${orderBy}&$top=${count}&$skip=${skip}`;

    console.log(`Fetching ${count} invoices from Acumatica (skip: ${skip}) - Status: ${filterDescription}, Order: ${fetchNewestFirst ? 'Newest First' : 'Oldest First'}`);

    const invoicesResponse = await fetch(invoicesUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch invoices: ${errorText}`
        }),
        {
          status: invoicesResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const invoicesData = await invoicesResponse.json();
    const invoices = Array.isArray(invoicesData) ? invoicesData : [];

    console.log(`Retrieved ${invoices.length} invoices`);

    const invoiceFieldMapping: any = {
      'Type': 'type',
      'ReferenceNbr': 'reference_number',
      'Customer': 'customer',
      'CustomerName': 'customer_name',
      'CustomerOrder': 'customer_order',
      'CustomerOrderNbr': 'customer_order_number',
      'CurrencyID': 'currency',
      'Status': 'status',
      'Date': 'date',
      'DueDate': 'due_date',
      'PostPeriod': 'post_period',
      'Terms': 'terms',
      'Balance': 'balance',
      'Amount': 'amount',
      'Description': 'description',
      'Hold': 'hold',
      'LocationID': 'location_id',
      'TaxTotal': 'tax_total',
      'CashDiscountDate': 'cash_discount_date',
      'CreatedDateTime': 'created_datetime',
      'LastModifiedDateTime': 'last_modified_datetime',
      'LinkARAccount': 'link_ar_account',
      'BillingPrinted': 'billing_printed',
      'BillToContactOverride': 'bill_to_contact_override',
      'ShipToContactOverride': 'ship_to_contact_override',
      'IsTaxValid': 'is_tax_valid',
    };

    let savedCount = 0;
    const errors: string[] = [];
    const batchSize = 30;

    for (let i = 0; i < invoices.length; i++) {
      const invoiceData = invoices[i];
      try {
        const transformedInvoice: any = {
          raw_data: invoiceData,
          synced_at: new Date().toISOString(),
        };

        if (invoiceData.id) {
          transformedInvoice.acumatica_id = invoiceData.id;
        }

        if (invoiceData.rowNumber !== undefined) {
          transformedInvoice.row_number = invoiceData.rowNumber;
        }

        Object.keys(invoiceData).forEach(key => {
          if (key === 'note' && invoiceData[key] && typeof invoiceData[key] === 'object' && 'value' in invoiceData[key]) {
            transformedInvoice.note = invoiceData[key].value || '';
            return;
          }

          if (invoiceData[key] && typeof invoiceData[key] === 'object' && 'value' in invoiceData[key]) {
            const value = invoiceData[key].value;

            if (invoiceFieldMapping[key]) {
              const dbField = invoiceFieldMapping[key];

              if ((key.toLowerCase().includes('datetime') || key.toLowerCase().includes('date')) && value && typeof value === 'string') {
                try {
                  transformedInvoice[dbField] = new Date(value).toISOString();
                } catch {
                  transformedInvoice[dbField] = value;
                }
              } else if (typeof value === 'boolean') {
                transformedInvoice[dbField] = value;
              } else if (typeof value === 'number') {
                transformedInvoice[dbField] = value;
              } else if (typeof value === 'string') {
                if (/^-?\d+\.\d+$/.test(value) || /^-?\d+$/.test(value)) {
                  const numValue = parseFloat(value);
                  if (!isNaN(numValue)) {
                    transformedInvoice[dbField] = numValue;
                  } else {
                    transformedInvoice[dbField] = value;
                  }
                } else {
                  transformedInvoice[dbField] = value;
                }
              } else if (value !== null && value !== undefined) {
                transformedInvoice[dbField] = value;
              }
            }
          }
        });

        const refNbr = transformedInvoice.reference_number;
        if (!refNbr) {
          errors.push('Invoice missing reference number');
          continue;
        }

        transformedInvoice.reference_number = refNbr.padStart(6, '0');
        const paddedRefNbr = transformedInvoice.reference_number;

        const { data: existing } = await supabase
          .from('acumatica_invoices')
          .select('id')
          .eq('reference_number', paddedRefNbr)
          .maybeSingle();

        let success = false;
        let lastError = null;
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries && !success; attempt++) {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }

          if (existing) {
            const { error } = await supabase
              .from('acumatica_invoices')
              .update(transformedInvoice)
              .eq('reference_number', paddedRefNbr);

            if (error) {
              lastError = error;
              const isHtmlError = error.message.includes('<!DOCTYPE') || error.message.includes('<html');
              if (isHtmlError) {
                console.log(`Transient error on attempt ${attempt + 1} for ${paddedRefNbr}, retrying...`);
                continue;
              }
              break;
            } else {
              success = true;
              savedCount++;
            }
          } else {
            const { error } = await supabase
              .from('acumatica_invoices')
              .insert(transformedInvoice);

            if (error) {
              lastError = error;
              const isHtmlError = error.message.includes('<!DOCTYPE') || error.message.includes('<html');
              if (isHtmlError) {
                console.log(`Transient error on attempt ${attempt + 1} for ${paddedRefNbr}, retrying...`);
                continue;
              }
              break;
            } else {
              success = true;
              savedCount++;
            }
          }
        }

        if (!success && lastError) {
          const isHtmlError = lastError.message.includes('<!DOCTYPE') || lastError.message.includes('<html');
          const errorMsg = isHtmlError
            ? 'Network or service error (Cloudflare 500)'
            : lastError.message;
          errors.push(`${existing ? 'Update' : 'Insert'} error for ${paddedRefNbr}: ${errorMsg}`);
        }
      } catch (error: any) {
        errors.push(`Processing error: ${error.message}`);
      }

      if ((i + 1) % batchSize === 0 && i + 1 < invoices.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
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
        totalFetched: invoices.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in bulk invoice fetch:', error);
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