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

    // Set when a child reports it could not reach Acumatica at all (down /
    // maintenance / login limit / rejected credentials). The remaining entities
    // are not attempted this run: they would fail the same way, and repeated
    // logins with bad credentials can lock the Acumatica user.
    type Stop = { reason: string; error: string; retryable: boolean };
    let stop = null as Stop | null;

    const syncEntity = async (entityType: string) => {
      let logId: string | null = null;
      const syncStart = Date.now();
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

        logId = crypto.randomUUID();
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

        const syncDuration = Date.now() - syncStart;

        // Read the body once as text, then parse. Calling response.json() and
        // response.text() both consumes the stream and throws "Body already consumed",
        // which previously masked the real child-function error.
        const responseText = await response.text();
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseErr) {
          throw new Error(`Failed to parse sync response for ${entityType}: ${response.status} ${response.statusText}. Response: ${responseText.substring(0, 500)}`);
        }

        console.log(`${entityType} sync completed in ${syncDuration}ms`);

        if (result?.skipped) {
          // Acumatica unreachable / refused us. The child already logged the one
          // clear line. Not a failure of this run unless the credentials are bad;
          // last_successful_sync stays put so the next run's window catches up.
          const retryable = result.reason !== 'credentials';
          stop = { reason: result.reason || 'unavailable', error: result.error || 'Acumatica unavailable', retryable };
          results[entityType].errors.push(stop.error);
          const { data: st } = await supabase
            .from('sync_status')
            .select('retry_count')
            .eq('entity_type', entityType)
            .maybeSingle();
          await supabase
            .from('sync_status')
            .update({
              status: retryable ? 'idle' : 'failed',
              last_error: stop.error,
              retry_count: retryable ? (st?.retry_count || 0) : (st?.retry_count || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('entity_type', entityType);
          await supabase
            .from('sync_logs')
            .update({
              sync_completed_at: new Date().toISOString(),
              status: 'failed',
              errors: [stop.error],
              duration_ms: syncDuration,
            })
            .eq('id', logId);
          return;
        }

        if (response.ok && result.partial) {
          // Capped run: progress was written, the rest is picked up by the next
          // run. Not an error; last_successful_sync deliberately not advanced.
          console.log(`[MASTER-SYNC] ${entityType}: ${result.error}`);
          results[entityType] = {
            success: false,
            partial: true,
            created: result.created || 0,
            updated: result.updated || 0,
            totalFetched: result.totalFetched || 0,
            errors: result.errors || [],
          };
          await supabase
            .from('sync_status')
            .update({
              status: 'idle',
              last_error: result.error,
              records_synced: result.totalFetched || 0,
              records_created: result.created || 0,
              records_updated: result.updated || 0,
              sync_duration_ms: syncDuration,
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
              errors: [result.error, ...(result.errors || [])],
              duration_ms: syncDuration,
            })
            .eq('id', logId);
          return;
        }

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

        if (logId) {
          await supabase
            .from('sync_logs')
            .update({
              sync_completed_at: new Date().toISOString(),
              status: 'failed',
              errors: [err.message],
              duration_ms: Date.now() - syncStart,
            })
            .eq('id', logId);
        }
      }
    };

    console.log('[MASTER-SYNC] Running syncs SEQUENTIALLY to prevent race conditions');
    console.log('[MASTER-SYNC] Order: customer → invoice → payment');

    const skippedEntities: string[] = [];
    for (const entityType of entityTypes) {
      if (stop) {
        // trigger_acumatica_sync() set every due entity to 'running'; put the ones
        // we are not attempting back, or the cron stops triggering for 30 minutes.
        skippedEntities.push(entityType);
        results[entityType].errors.push(`not attempted: ${stop.error}`);
        await supabase
          .from('sync_status')
          .update({
            status: stop.retryable ? 'idle' : 'failed',
            last_error: `not attempted: ${stop.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq('entity_type', entityType)
          .eq('sync_enabled', true);
        continue;
      }
      await syncEntity(entityType);
      console.log(`[MASTER-SYNC] ${entityType} sync completed, moving to next entity`);
    }

    // Log out cached Acumatica sessions that have expired (Acumatica limits
    // concurrent API logins; they used to be abandoned, never logged out).
    // After the children, so no session this run handed out is still in use.
    await new AcumaticaSessionManager(supabaseUrl, supabaseKey)
      .retireExpiredSessions({ acumaticaUrl, username, password, company, branch });

    if (stop) {
      const { data: statuses } = await supabase
        .from('sync_status')
        .select('last_successful_sync')
        .eq('sync_enabled', true);
      const lastGood = (statuses || [])
        .map((r: any) => (r.last_successful_sync ? new Date(r.last_successful_sync).getTime() : 0))
        .reduce((a: number, b: number) => Math.min(a, b), Date.now());
      const hoursDown = (Date.now() - lastGood) / 3600000;
      const line = `[MASTER-SYNC] ${stop.error}${skippedEntities.length ? ` (not attempted: ${skippedEntities.join(', ')})` : ''}; oldest successful sync ${hoursDown.toFixed(1)}h ago`;
      // A maintenance window is routine; hours without any sync is not.
      if (!stop.retryable || hoursDown >= 2) console.error(line);
      else console.log(line);
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: stop.reason,
          error: stop.error,
          results,
          summary: { totalCreated: 0, totalUpdated: 0, totalFetched: 0, durationMs: Date.now() - syncStartTime },
        }),
        { status: stop.retryable ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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