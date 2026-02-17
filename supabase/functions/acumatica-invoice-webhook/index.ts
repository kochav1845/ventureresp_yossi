import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

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
    console.log('Received invoice webhook:', JSON.stringify(webhookData, null, 2));

    const invoiceType = webhookData.Entity?.Type?.value || webhookData.Type || 'Invoice';
    let referenceNbr = webhookData.Entity?.ReferenceNbr?.value || webhookData.ReferenceNbr;

    if (!referenceNbr) {
      console.error('No reference number found in webhook data');
      return new Response(
        JSON.stringify({ error: "No reference number provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    referenceNbr = referenceNbr.padStart(6, '0');

    console.log(`Processing invoice webhook for: ${invoiceType}/${referenceNbr}`);

    const { data: config } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!config || !config.acumatica_url || !config.username || !config.password) {
      console.log('Acumatica credentials not configured, storing webhook data only');

      await supabase.from('webhook_logs').insert({
        webhook_type: 'invoice',
        entity_id: referenceNbr,
        payload: webhookData,
        status: 'pending_credentials',
        received_at: new Date().toISOString()
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Webhook received, awaiting Acumatica credentials configuration',
          referenceNbr
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const acumaticaUrl = config.acumatica_url.startsWith('http')
      ? config.acumatica_url
      : `https://${config.acumatica_url}`;

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || '',
      branch: config.branch || ''
    };

    const invoiceUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice/${encodeURIComponent(invoiceType)}/${encodeURIComponent(referenceNbr)}`;
    const invoiceResponse = await sessionManager.makeAuthenticatedRequest(credentials, invoiceUrl);

    if (!invoiceResponse.ok) {
      throw new Error(`Failed to fetch invoice data: ${invoiceResponse.statusText}`);
    }

    const invoiceData = await invoiceResponse.json();

    const invoiceFieldMapping: any = {
      'Type': 'type',
      'ReferenceNbr': 'reference_number',
      'Status': 'status',
      'Date': 'date',
      'DueDate': 'due_date',
      'PostPeriod': 'post_period',
      'FinancialPeriod': 'financial_period',
      'CustomerID': 'customer_id',
      'CustomerOrder': 'customer_order',
      'Customer': 'customer',
      'Location': 'location',
      'CurrencyID': 'currency_id',
      'Description': 'description',
      'Hold': 'hold',
      'Amount': 'amount',
      'Balance': 'balance',
      'Terms': 'terms',
      'DaysPastDue': 'days_past_due',
      'DiscountDate': 'discount_date',
      'CashDiscountBalance': 'cash_discount_balance',
      'CashAccount': 'cash_account',
      'Project': 'project',
      'TaxTotal': 'tax_total',
      'IsTaxValid': 'is_tax_valid',
      'TaxZone': 'tax_zone',
      'LastModifiedDateTime': 'last_modified_datetime',
      'BillingSettings': 'billing_settings',
      'BillToAddress': 'bill_to_address',
      'BillToContact': 'bill_to_contact',
      'ShipToAddress': 'ship_to_address',
      'ShipToContact': 'ship_to_contact',
      'Details': 'details',
      'ApplicationsCreditMemo': 'applications_credit_memo',
      'ApplicationsInvoice': 'applications_invoice',
      'TaxDetails': 'tax_details',
    };

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

      if (key === 'Details' || key === 'TaxDetails' || key === 'ApplicationsInvoice' || key === 'ApplicationsCreditMemo' || key === 'BillingSettings' || key === 'BillToAddress' || key === 'BillToContact' || key === 'ShipToAddress' || key === 'ShipToContact') {
        if (invoiceFieldMapping[key] && invoiceData[key]) {
          transformedInvoice[invoiceFieldMapping[key]] = invoiceData[key];
        }
      }
    });

    const { data: existing } = await supabase
      .from('acumatica_invoices')
      .select('id')
      .eq('reference_number', referenceNbr)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from('acumatica_invoices')
        .update(transformedInvoice)
        .eq('reference_number', referenceNbr);
      console.log(`Updated existing invoice: ${referenceNbr}`);
    } else {
      result = await supabase
        .from('acumatica_invoices')
        .insert(transformedInvoice);
      console.log(`Inserted new invoice: ${referenceNbr}`);
    }

    if (result.error) {
      throw new Error(`Database error: ${result.error.message}`);
    }

    await supabase.from('webhook_logs').insert({
      webhook_type: 'invoice',
      entity_id: referenceNbr,
      payload: webhookData,
      status: 'processed',
      received_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invoice synced successfully',
        referenceNbr,
        action: existing ? 'updated' : 'created'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in invoice webhook:', error);
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