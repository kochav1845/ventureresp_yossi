import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AcumaticaSession {
  session_id: string;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { paymentRef } = await req.json();

    if (!paymentRef) {
      return new Response(
        JSON.stringify({ error: 'Payment reference number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      console.error('Credentials error:', credError);
      throw new Error('Acumatica credentials not configured');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    console.log('Logging in to Acumatica...');
    const loginBody: any = {
      name: credentials.username,
      password: credentials.password,
    };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Authentication failed: ${errorText}`);
    }

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No authentication cookies received');
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    console.log(`Fetching payment ${paymentRef} from Acumatica...`);

    const paymentResponse = await fetch(
      `${acumaticaUrl}/entity/Default/22.200.001/Payment/${paymentRef}?$expand=ApplicationHistory`,
      {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );

    if (!paymentResponse.ok) {
      throw new Error(`Failed to fetch payment: ${paymentResponse.status}`);
    }

    const acumaticaPayment = await paymentResponse.json();

    const updateData = {
      customer_id: acumaticaPayment.CustomerID?.value || null,
      customer_name: acumaticaPayment.Customer?.value || null,
      payment_type: acumaticaPayment.Type?.value || null,
      payment_method: acumaticaPayment.PaymentMethod?.value || null,
      cash_account: acumaticaPayment.CashAccount?.value || null,
      card_account_nbr: acumaticaPayment.CardAccountNbr?.value || null,
      status: acumaticaPayment.Status?.value || null,
      application_date: acumaticaPayment.ApplicationDate?.value || null,
      payment_date: acumaticaPayment.PaymentDate?.value || null,
      payment_amount: acumaticaPayment.PaymentAmount?.value || null,
      unapplied_balance: acumaticaPayment.UnappliedBalance?.value || null,
      description: acumaticaPayment.Description?.value || null,
      currency_id: acumaticaPayment.CurrencyID?.value || null,
      hold: acumaticaPayment.Hold?.value || null,
      payment_ref: acumaticaPayment.PaymentRef?.value || null,
      last_modified_date_time: acumaticaPayment.LastModifiedDateTime?.value || null,
      application_history: acumaticaPayment.ApplicationHistory || [],
      last_synced_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('acumatica_payments')
      .update(updateData)
      .eq('reference_number', paymentRef);

    if (updateError) {
      throw new Error(`Failed to update payment: ${updateError.message}`);
    }

    if (acumaticaPayment.ApplicationHistory && acumaticaPayment.ApplicationHistory.length > 0) {
      const { error: deleteError } = await supabase
        .from('payment_invoice_applications')
        .delete()
        .eq('payment_reference_number', paymentRef);

      if (deleteError) {
        console.error('Error deleting old applications:', deleteError);
      }

      const applications = acumaticaPayment.ApplicationHistory.map((app: any) => ({
        payment_reference_number: paymentRef,
        doc_type: app.DocType?.value || null,
        reference_number: app.ReferenceNbr?.value || null,
        invoice_date: app.Date?.value || null,
        status: app.Status?.value || null,
        amount_paid: parseFloat(app.AmountPaid?.value || '0'),
        balance: parseFloat(app.Balance?.value || '0'),
      }));

      const { error: insertError } = await supabase
        .from('payment_invoice_applications')
        .insert(applications);

      if (insertError) {
        console.error('Error inserting applications:', insertError);
      }
    }

    await supabase
      .from('sync_change_logs')
      .insert({
        entity_type: 'payment',
        entity_id: paymentRef,
        sync_type: 'manual_resync',
        action_type: 'updated',
        old_value: null,
        new_value: updateData.status,
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment ${paymentRef} resynced successfully`,
        updatedStatus: updateData.status,
        applicationsCount: acumaticaPayment.ApplicationHistory?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Resync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
