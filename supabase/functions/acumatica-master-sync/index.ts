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

    const requestBody = await req.json().catch(() => ({}));

    let acumaticaUrl = requestBody.acumaticaUrl;
    let username = requestBody.username;
    let password = requestBody.password;
    let company = requestBody.company || "";
    let branch = requestBody.branch || "";

    if (!acumaticaUrl || !username || !password) {
      console.log('Credentials not provided in request, loading from database...');

      const { data: config, error: configError } = await supabase
        .from('acumatica_sync_credentials')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (configError) {
        console.error('Error loading credentials from database:', configError);
      }

      if (config) {
        acumaticaUrl = acumaticaUrl || config.acumatica_url;
        username = username || config.username;
        password = password || config.password;
        company = company || config.company || "";
        branch = branch || config.branch || "";
        console.log('Loaded credentials from database');
      }
    }

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    console.log('Master sync called with:', {
      url: acumaticaUrl,
      username,
      hasPassword: !!password,
      company,
      branch
    });

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({
          error: "Missing Acumatica credentials. Please configure sync settings first.",
          received: {
            url: !!acumaticaUrl,
            username: !!username,
            password: !!password
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const syncStartTime = Date.now();
    const results: any = {
      customer: { success: false, created: 0, updated: 0, totalFetched: 0, errors: [] },
      invoice: { success: false, created: 0, updated: 0, totalFetched: 0, errors: [] },
      payment: { success: false, created: 0, updated: 0, totalFetched: 0, errors: [] },
    };

    const entityTypes = ['customer', 'invoice', 'payment'];

    const syncPromises = entityTypes.map(async (entityType) => {
      try {
        const { data: syncStatus } = await supabase
          .from('sync_status')
          .select('*')
          .eq('entity_type', entityType)
          .maybeSingle();

        if (!syncStatus?.sync_enabled) {
          console.log(`${entityType} sync is disabled, skipping`);
          return;
        }

        console.log(`Starting sync for ${entityType}...`);

        const logId = crypto.randomUUID();
        await supabase
          .from('sync_logs')
          .insert({
            id: logId,
            entity_type: entityType,
            sync_started_at: new Date().toISOString(),
            status: 'running',
          });

        await supabase
          .from('sync_status')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('entity_type', entityType);

        const funcName = `acumatica-${entityType}-incremental-sync`;
        const funcUrl = `${supabaseUrl}/functions/v1/${funcName}`;

        const syncStart = Date.now();
        const response = await fetch(funcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company,
            branch,
            lookbackMinutes: syncStatus.lookback_minutes || 2,
          }),
        });

        const result = await response.json();
        const syncDuration = Date.now() - syncStart;

        console.log(`${entityType} sync completed in ${syncDuration}ms`);

        if (response.ok && result.success) {
          results[entityType] = {
            success: true,
            created: result.created || 0,
            updated: result.updated || 0,
            totalFetched: result.totalFetched || 0,
            errors: result.errors || [],
          };

          await supabase
            .from('sync_status')
            .update({
              status: 'completed',
              last_successful_sync: new Date().toISOString(),
              records_synced: result.totalFetched || 0,
              records_created: result.created || 0,
              records_updated: result.updated || 0,
              sync_duration_ms: syncDuration,
              errors: result.errors || [],
              last_error: result.errors?.length > 0 ? result.errors[0] : null,
              retry_count: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('entity_type', entityType);

          await supabase
            .from('sync_logs')
            .update({
              sync_completed_at: new Date().toISOString(),
              status: 'completed',
              records_synced: result.totalFetched || 0,
              records_created: result.created || 0,
              records_updated: result.updated || 0,
              errors: result.errors || [],
              duration_ms: syncDuration,
            })
            .eq('id', logId);
        } else {
          throw new Error(result.error || 'Sync failed');
        }
      } catch (err) {
        console.error(`Error syncing ${entityType}:`, err);
        results[entityType].success = false;
        results[entityType].errors.push(err.message);

        const { data: status } = await supabase
          .from('sync_status')
          .select('retry_count')
          .eq('entity_type', entityType)
          .maybeSingle();

        await supabase
          .from('sync_status')
          .update({
            status: 'failed',
            last_error: err.message,
            retry_count: (status?.retry_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('entity_type', entityType);
      }
    });

    await Promise.all(syncPromises);

    const totalDuration = Date.now() - syncStartTime;
    const totalCreated = results.customer.created + results.invoice.created + results.payment.created;
    const totalUpdated = results.customer.updated + results.invoice.updated + results.payment.updated;
    const totalFetched = results.customer.totalFetched + results.invoice.totalFetched + results.payment.totalFetched;

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: {
          totalCreated,
          totalUpdated,
          totalFetched,
          durationMs: totalDuration,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error('Error in master sync:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});