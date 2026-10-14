/*
  # check_cron_job_health(): stop scanning the whole pg_cron history

  Layout.tsx calls check_cron_job_health() once a minute from every open tab
  (25,000+ calls). It looked for a recent run with

    WHERE jobid = ... AND start_time > now() - interval '15 minutes'

  but cron.job_run_details (owned by pg_cron, we cannot index it) has only its
  primary key on runid, and had grown to 1.3M rows / 222 MB because nothing ever
  pruned it. Every call was a full scan -- 255M blocks read from disk since June,
  more than any other table, on an instance with 256 MB of shared buffers -- and
  under load it regularly hit the function's 5s statement_timeout:
  "canceling statement due to statement timeout" -> RPC 500 (30x, 54 timeouts in
  3 days), plus the cache it evicted slowed everything else down.

  The health check now reads only the newest 500 runs (newest first off the runid
  primary key -- runid only grows). All jobs together run ~33 times per 15 minutes,
  so 500 runs is several hours of history: if acumatica-auto-sync (every 5 min)
  ran in the last 15 minutes, that run is in there. Cost no longer depends on how
  big the history is.

  NOT done here (needs the owner's go-ahead, it deletes 1.25M log rows): pruning
  cron.job_run_details to ~14 days, Supabase's documented cleanup. See the note in
  the fix report.
*/

CREATE OR REPLACE FUNCTION public.check_cron_job_health()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT j.jobid INTO v_jobid
  FROM cron.job j
  WHERE j.jobname = 'acumatica-auto-sync'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    RETURN false;
  END IF;

  -- Newest runs only, straight off the primary key (see header).
  RETURN EXISTS (
    SELECT 1
    FROM (
      SELECT r.jobid, r.start_time
      FROM cron.job_run_details r
      ORDER BY r.runid DESC
      LIMIT 500
    ) recent
    WHERE recent.jobid = v_jobid
      AND recent.start_time > NOW() - INTERVAL '15 minutes'
  );
END;
$function$;
