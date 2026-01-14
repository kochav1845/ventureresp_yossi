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
    console.log('Received payment webhook:', JSON.stringify(webhookData, null, 2));

    const paymentType = webhookData.Entity?.Type?.value || webhookData.Type || 'Payment';
    const referenceNbr = webhookData.Entity?.ReferenceNbr?.value || webhookData.ReferenceNbr;

    // Ignore credit memo webhooks
    if (paymentType === 'Credit Memo') {
      console.log('Ignoring credit memo webhook');
      return new Response(
        JSON.stringify({ success: true, message: 'Credit memos are ignored' }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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

    console.log(`Processing payment webhook for: ${paymentType}/${referenceNbr}`);

    const acumaticaUrl = Deno.env.get("ACUMATICA_URL");
    const username = Deno.env.get("ACUMATICA_USERNAME");
    const password = Deno.env.get("ACUMATICA_PASSWORD");
    const company = Deno.env.get("ACUMATICA_COMPANY");
    const branch = Deno.env.get("ACUMATICA_BRANCH");

    if (!acumaticaUrl || !username || !password) {
      console.log('Acumatica credentials not configured, storing webhook data only');
      
      await supabase.from('webhook_logs').insert({
        webhook_type: 'payment',
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

    const paymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(paymentType)}/${encodeURIComponent(referenceNbr)}?$expand=ApplicationHistory`;
    
    const paymentResponse = await fetch(paymentUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookies,
      },
    });

    if (!paymentResponse.ok) {
      throw new Error(`Failed to fetch payment data: ${paymentResponse.statusText}`);
    }

    const paymentData = await paymentResponse.json();

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    const paymentFieldMapping: any = {
      'Type': 'type',
      'ReferenceNbr': 'reference_number',
      'CustomerID': 'customer_id',
      'CustomerLocationID': 'customer_location_id',
      'Status': 'status',
      'ApplicationDate': 'application_date',
      'PaymentAmount': 'payment_amount',
      'AvailableBalance': 'available_balance',
      'CurrencyID': 'currency_id',
      'Description': 'description',
      'PaymentMethod': 'payment_method',
      'PaymentRef': 'payment_ref',
      'CashAccount': 'cash_account',
      'CardAccountNbr': 'card_account_nbr',
      'ExternalRef': 'external_ref',
      'Hold': 'hold',
      'IsCCPayment': 'is_cc_payment',
      'IsNewCard': 'is_new_card',
      'SaveCard': 'save_card',
      'ProcessingCenterID': 'processing_center_id',
      'OrigTransaction': 'orig_transaction',
      'NoteID': 'note_id',
      'LastModifiedDateTime': 'last_modified_datetime',
      'AppliedToDocuments': 'applied_to_documents',
      'AppliedToOrders': 'applied_to_orders',
      'ApplicationHistory': 'application_history',
    };

    const transformedPayment: any = {
      raw_data: paymentData,
      synced_at: new Date().toISOString(),
    };

    if (paymentData.id) {
      transformedPayment.acumatica_id = paymentData.id;
    }

    if (paymentData.rowNumber !== undefined) {
      transformedPayment.row_number = paymentData.rowNumber;
    }

    Object.keys(paymentData).forEach(key => {
      if (paymentData[key] && typeof paymentData[key] === 'object' && 'value' in paymentData[key]) {
        const value = paymentData[key].value;

        if (paymentFieldMapping[key]) {
          const dbField = paymentFieldMapping[key];

          if ((key.toLowerCase().includes('datetime') || key.toLowerCase().includes('date')) && value && typeof value === 'string') {
            try {
              transformedPayment[dbField] = new Date(value).toISOString();
            } catch {
              transformedPayment[dbField] = value;
            }
          } else if (typeof value === 'boolean') {
            transformedPayment[dbField] = value;
          } else if (typeof value === 'number') {
            transformedPayment[dbField] = value;
          } else if (typeof value === 'string') {
            if (/^-?\d+\.\d+$/.test(value) || /^-?\d+$/.test(value)) {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                transformedPayment[dbField] = numValue;
              } else {
                transformedPayment[dbField] = value;
              }
            } else {
              transformedPayment[dbField] = value;
            }
          } else if (value !== null && value !== undefined) {
            transformedPayment[dbField] = value;
          }
        }
      }

      if (key === 'AppliedToDocuments' || key === 'AppliedToOrders' || key === 'ApplicationHistory') {
        if (paymentFieldMapping[key] && paymentData[key]) {
          transformedPayment[paymentFieldMapping[key]] = paymentData[key];
        }
      }
    });

    const { data: existing } = await supabase
      .from('acumatica_payments')
      .select('id')
      .eq('reference_number', referenceNbr)
      .eq('type', paymentType)
      .maybeSingle();

    let result;
    let paymentId;
    if (existing) {
      result = await supabase
        .from('acumatica_payments')
        .update(transformedPayment)
        .eq('reference_number', referenceNbr)
        .eq('type', paymentType)
        .select('id')
        .single();
      paymentId = existing.id;
      console.log(`Updated existing payment: ${referenceNbr}`);
    } else {
      result = await supabase
        .from('acumatica_payments')
        .insert(transformedPayment)
        .select('id')
        .single();
      paymentId = result.data?.id;
      console.log(`Inserted new payment: ${referenceNbr}`);
    }

    if (result.error) {
      throw new Error(`Database error: ${result.error.message}`);
    }

    let applicationsCreated = 0;
    if (paymentId && paymentData.ApplicationHistory && Array.isArray(paymentData.ApplicationHistory)) {
      const applications = paymentData.ApplicationHistory;

      if (applications.length > 0) {
        await supabase
          .from('payment_invoice_applications')
          .delete()
          .eq('payment_id', paymentId);

        const linksToInsert = applications.map((app: any) => {
          let invoiceRefNbr = app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value || "Unknown";

          if (/^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
            invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
          }

          return {
            payment_id: paymentId,
            payment_reference_number: referenceNbr,
            invoice_reference_number: invoiceRefNbr,
            customer_id: app.Customer?.value || transformedPayment.customer_id,
            application_date: app.Date?.value || null,
            amount_paid: app.AmountPaid?.value !== undefined ? parseFloat(app.AmountPaid.value) : 0,
            balance: app.Balance?.value !== undefined ? parseFloat(app.Balance.value) : 0,
            cash_discount_taken: app.CashDiscountTaken?.value !== undefined ? parseFloat(app.CashDiscountTaken.value) : 0,
            post_period: app.PostPeriod?.value || null,
            application_period: app.ApplicationPeriod?.value || null,
            due_date: app.DueDate?.value || null,
            customer_order: app.CustomerOrder?.value || null,
            description: app.Description?.value || null,
            doc_type: app.DisplayDocType?.value || app.AdjustedDocType?.value || 'Invoice',
            invoice_date: app.Date?.value || null
          };
        });

        const { error: insertError } = await supabase
          .from('payment_invoice_applications')
          .insert(linksToInsert);

        if (!insertError) {
          applicationsCreated = linksToInsert.length;
          console.log(`Created ${applicationsCreated} application links for payment ${referenceNbr}`);
        }
      }
    }

    await supabase.from('webhook_logs').insert({
      webhook_type: 'payment',
      entity_id: referenceNbr,
      payload: webhookData,
      status: 'processed',
      received_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment synced successfully',
        referenceNbr,
        action: existing ? 'updated' : 'created',
        applicationsCreated
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Error in payment webhook:', error);
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