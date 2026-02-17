import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const fieldMapping: Record<string, string> = {
  'CustomerID': 'customer_id',
  'CustomerName': 'customer_name',
  'Status': 'customer_status',
  'CustomerClass': 'customer_class',
  'CreditLimit': 'credit_limit',
  'CreditDaysPastDue': 'credit_days_past_due',
  'CreditVerificationRules': 'credit_verification_rules',
  'CreditHold': 'credit_hold',
  'CreditTerms': 'credit_terms',
  'CurrencyID': 'currency_id',
  'StatementType': 'statement_type',
  'PrintStatements': 'print_statements',
  'SendStatementsByEmail': 'send_statements_by_email',
  'MainContact': 'main_contact',
  'Phone1': 'phone_1',
  'Email': 'email_address',
  'PriceClassID': 'price_class_id',
  'PrimaryContact': 'primary_contact',
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
        .eq('entity_type', 'customer')
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

    const customersUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer?$filter=LastModifiedDateTime gt datetimeoffset'${filterDate}'&$expand=MainContact`;

    console.log(`Fetching customers modified after ${filterDate} (last ${lookbackMinutes} minutes)`);

    const customersResponse = await fetch(customersUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": sessionCookie,
      },
    });

    if (!customersResponse.ok) {
      const errorText = await customersResponse.text();
      throw new Error(`Failed to fetch customers: ${customersResponse.status} ${customersResponse.statusText}. Details: ${errorText.substring(0, 500)}`);
    }

    const customersData = await customersResponse.json();
    // Session is automatically managed, no need to manually logout

    const customers = Array.isArray(customersData) ? customersData : [];

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    if (customers && customers.length > 0) {
      for (const customer of customers) {
        try {

          const mappedCustomer: any = { raw_data: customer, last_sync_timestamp: new Date().toISOString() };

          for (const [acuKey, dbKey] of Object.entries(fieldMapping)) {
            if (customer[acuKey]?.value !== undefined) {
              mappedCustomer[dbKey] = customer[acuKey].value;
            }
          }

          if (!mappedCustomer.customer_id) {
            errors.push(`Customer missing CustomerID`);
            continue;
          }

          const { data: existing } = await supabase
            .from('acumatica_customers')
            .select('id')
            .eq('customer_id', mappedCustomer.customer_id)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('acumatica_customers')
              .update(mappedCustomer)
              .eq('customer_id', mappedCustomer.customer_id);

            if (error) {
              errors.push(`Update failed for ${mappedCustomer.customer_id}: ${error.message}`);
            } else {
              updated++;
              await supabase.rpc('log_sync_change', {
                p_sync_type: 'customer',
                p_action_type: 'updated',
                p_entity_id: existing.id,
                p_entity_reference: mappedCustomer.customer_id,
                p_entity_name: mappedCustomer.customer_name || mappedCustomer.customer_id,
                p_change_summary: `Customer ${mappedCustomer.customer_id} was updated`,
                p_change_details: { status: mappedCustomer.customer_status },
                p_sync_source: 'scheduled_sync'
              });
            }
          } else {
            const { data: inserted, error } = await supabase
              .from('acumatica_customers')
              .insert(mappedCustomer)
              .select('id')
              .single();

            if (error) {
              errors.push(`Insert failed for ${mappedCustomer.customer_id}: ${error.message}`);
            } else {
              created++;
              await supabase.rpc('log_sync_change', {
                p_sync_type: 'customer',
                p_action_type: 'created',
                p_entity_id: inserted.id,
                p_entity_reference: mappedCustomer.customer_id,
                p_entity_name: mappedCustomer.customer_name || mappedCustomer.customer_id,
                p_change_summary: `New customer ${mappedCustomer.customer_id} was added`,
                p_change_details: { status: mappedCustomer.customer_status },
                p_sync_source: 'scheduled_sync'
              });
            }
          }
        } catch (err) {
          errors.push(`Error processing customer: ${err.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalFetched: customers?.length || 0,
        processed: created + updated,
        created,
        updated,
        lookbackMinutes,
        filterDate: cutoffTime.toISOString(),
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error('Error in customer incremental sync:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
