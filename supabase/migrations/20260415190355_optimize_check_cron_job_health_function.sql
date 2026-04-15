/*
  # Optimize Cron Job Health Check Function

  1. Changes
    - Rewrites `check_cron_job_health()` to avoid scanning the entire `cron.job_run_details` table
    - Filters by time range first (last 15 minutes) to dramatically reduce rows scanned
    - Adds a statement timeout of 5 seconds as a safety net

  2. Security
    - Maintains SECURITY DEFINER for cron schema access
    - Maintains authenticated-only access
*/

CREATE OR REPLACE FUNCTION check_cron_job_health()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_jobid bigint;
  v_found boolean;
BEGIN
  SELECT j.jobid INTO v_jobid
  FROM cron.job j
  WHERE j.jobname = 'acumatica-auto-sync'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM cron.job_run_details r
    WHERE r.jobid = v_jobid
      AND r.start_time > NOW() - INTERVAL '15 minutes'
    LIMIT 1
  ) INTO v_found;

  RETURN COALESCE(v_found, false);
END;
$$;
