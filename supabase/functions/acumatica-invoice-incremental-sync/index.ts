import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const fieldMapping: Record<string, string> = {
  'Type': 'type',
  'ReferenceNbr': 'reference_number',
  'Status': 'status',
  'Date': 'date',
  'PostPeriod': 'post_period',
  'Customer': 'customer',
  'CustomerName': 'customer_name',
  'CustomerOrder': 'customer_order',
  'CurrencyID': 'currency',
  'Amount': 'amount',
  'Balance': 'balance',
  'DueDate': 'due_date',
  'CashDiscountDate': 'cash_discount_date',
  'Terms': 'terms',
  'Description': 'description',
  'LastModifiedDateTime': 'last_modified_datetime',
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize session manager
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const requestBody = await req.json().catch(() => ({}));
    const {
      lookbackMinutes: lookbackFromRequest,
      acumaticaUrl: urlFromRequest,
      username: usernameFromRequest,
      password: passwordFromRequest,
      company: companyFromRequest,
      branch: branchFromRequest
    } = requestBody;

    let acumaticaUrl = urlFromRequest;
    let username = usernameFromRequest;
    let password = passwordFromRequest;
    let company = companyFromRequest || "";
    let branch = branchFromRequest || "";
    let lookbackMinutes = lookbackFromRequest;

    // Load sync configuration from database if not provided
    if (!acumaticaUrl || !username || !password || !lookbackMinutes) {
      console.log('Loading configuration from database...');

      const { data: config, error: configError } = await supabase
        .from('acumatica_sync_credentials')
        .select('*')
        .limit(1)
        .maybeSingle();

      const { data: syncConfig, error: syncError } = await supabase
        .from('sync_status')
        .select('lookback_minutes')
        .eq('entity_type', 'invoice')
        .maybeSingle();

      if (configError) {
        console.error('Error loading credentials from database:', configError);
      }

      if (syncError) {
        console.error('Error loading sync config from database:', syncError);
      }

      if (config) {
        acumaticaUrl = acumaticaUrl || config.acumatica_url;
        username = username || config.username;
        password = password || config.password;
        company = company || config.company || "";
        branch = branch || config.branch || "";
        console.log('Loaded credentials from database');
      }

      if (syncConfig) {
        lookbackMinutes = lookbackMinutes || syncConfig.lookback_minutes || 10000;
        console.log(`Loaded lookback from database: ${lookbackMinutes} minutes`);
      }
    }

    // Ensure lookback has a sensible default if still not set
    if (!lookbackMinutes) {
      lookbackMinutes = 10000;
      console.log('Using default lookback: 10000 minutes');
    }

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials. Please configure sync settings first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = {
      acumaticaUrl,
      username,
      password,
      company,
      branch
    };

    // Get session cookie using session manager
    console.log('Getting Acumatica session...');
    const sessionCookie = await sessionManager.getSession(credentials);
    console.log('Session obtained successfully');

    const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const filterDate = cutoffTime.toISOString().split('.')[0];

    const invoicesUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=LastModifiedDateTime gt datetimeoffset'${filterDate}'`;

    console.log(`Fetching invoices modified after ${filterDate} (last ${lookbackMinutes} minutes)`);

    const invoicesResponse = await fetch(invoicesUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": sessionCookie,
      },
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      throw new Error(`Failed to fetch invoices: ${invoicesResponse.status} ${invoicesResponse.statusText}. Details: ${errorText.substring(0, 500)}`);
    }

    let invoicesData;
    let invoices = [];

    try {
      // Get response as text first to debug
      const responseText = await invoicesResponse.text();
      console.log(`Response length: ${responseText.length} characters`);

      // Check if response looks like HTML error page
      if (responseText.trim().startsWith('<')) {
        throw new Error(`Received HTML response instead of JSON. This usually indicates an Acumatica error or session timeout.`);
      }

      // Try to parse JSON
      invoicesData = JSON.parse(responseText);
      invoices = Array.isArray(invoicesData) ? invoicesData : [];
    } catch (parseError) {
      console.error('JSON parse error:', parseError);

      return new Response(
        JSON.stringify({
          error: `Failed to parse invoice response: ${parseError.message}`,
          details: 'The response from Acumatica may be too large or incomplete. Try reducing the lookback time.'
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session is automatically managed, no need to manually logout

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    if (invoices && invoices.length > 0) {
      for (const invoice of invoices) {
        try {

          const mappedInvoice: any = { raw_data: invoice, last_sync_timestamp: new Date().toISOString() };

          for (const [acuKey, dbKey] of Object.entries(fieldMapping)) {
            if (invoice[acuKey]?.value !== undefined) {
              mappedInvoice[dbKey] = invoice[acuKey].value;
            }
          }

          if (!mappedInvoice.reference_number) {
            errors.push(`Invoice missing ReferenceNbr`);
            continue;
          }

          mappedInvoice.reference_number = mappedInvoice.reference_number.padStart(6, '0');

          const { data: existing } = await supabase
            .from('acumatica_invoices')
            .select('id, status')
            .eq('reference_number', mappedInvoice.reference_number)
            .maybeSingle();

          if (existing) {
            const oldStatus = existing.status;
            const { error } = await supabase
              .from('acumatica_invoices')
              .update(mappedInvoice)
              .eq('reference_number', mappedInvoice.reference_number);

            if (error) {
              errors.push(`Update failed for ${mappedInvoice.reference_number}: ${error.message}`);
            } else {
              updated++;
              let actionType = 'updated';
              let changeSummary = `Invoice ${mappedInvoice.reference_number} was updated`;

              if (oldStatus !== mappedInvoice.status) {
                if (mappedInvoice.status === 'Closed') {
                  actionType = 'closed';
                  changeSummary = `Invoice ${mappedInvoice.reference_number} was closed`;
                } else if (mappedInvoice.status === 'Open') {
                  actionType = 'reopened';
                  changeSummary = `Invoice ${mappedInvoice.reference_number} was reopened`;
                } else {
                  actionType = 'status_changed';
                  changeSummary = `Invoice ${mappedInvoice.reference_number} status changed from ${oldStatus} to ${mappedInvoice.status}`;
                }
              }

              await supabase.rpc('log_sync_change', {
                p_sync_type: 'invoice',
                p_action_type: actionType,
                p_entity_id: existing.id,
                p_entity_reference: mappedInvoice.reference_number,
                p_entity_name: `Invoice ${mappedInvoice.reference_number} - $${mappedInvoice.amount || 0}`,
                p_change_summary: changeSummary,
                p_change_details: {
                  old_status: oldStatus,
                  new_status: mappedInvoice.status,
                  balance: mappedInvoice.balance,
                  amount: mappedInvoice.amount
                },
                p_sync_source: 'scheduled_sync'
              });
            }
          } else {
            const { data: inserted, error } = await supabase
              .from('acumatica_invoices')
              .insert(mappedInvoice)
              .select('id')
              .single();

            if (error) {
              errors.push(`Insert failed for ${mappedInvoice.reference_number}: ${error.message}`);
            } else {
              created++;
              await supabase.rpc('log_sync_change', {
                p_sync_type: 'invoice',
                p_action_type: 'created',
                p_entity_id: inserted.id,
                p_entity_reference: mappedInvoice.reference_number,
                p_entity_name: `Invoice ${mappedInvoice.reference_number} - $${mappedInvoice.amount || 0}`,
                p_change_summary: `New invoice ${mappedInvoice.reference_number} was added`,
                p_change_details: {
                  status: mappedInvoice.status,
                  balance: mappedInvoice.balance,
                  amount: mappedInvoice.amount,
                  customer_id: mappedInvoice.customer_id
                },
                p_sync_source: 'scheduled_sync'
              });
            }
          }
        } catch (err) {
          errors.push(`Error processing invoice: ${err.message}`);
        }
      }
    }

    const syncResultData = {
      entity_type: 'invoice',
      last_successful_sync: new Date().toISOString(),
      status: errors.length === 0 ? 'completed' : 'completed',
      records_synced: invoices.length,
      records_updated: updated,
      records_created: created,
      errors: errors.slice(0, 150),
      last_error: errors.length > 0 ? errors[0] : null,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('sync_status')
      .update(syncResultData)
      .eq('entity_type', 'invoice');

    return new Response(
      JSON.stringify({
        success: true,
        totalFetched: invoices?.length || 0,
        processed: created + updated,
        created,
        updated,
        lookbackMinutes,
        filterDate: cutoffTime.toISOString(),
        errors: errors.slice(0, 10),
        totalErrors: errors.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error('Error in invoice incremental sync:', err);

    await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
      .from('sync_status')
      .update({
        status: 'failed',
        last_error: err.message,
        retry_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('entity_type', 'invoice');

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});