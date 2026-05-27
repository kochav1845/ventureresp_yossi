/*
  # Create cron job monitoring functions (v2)

  1. New Functions
    - Drops and recreates `get_cron_jobs()` with proper return type
    - `get_cron_job_run_history(p_job_id, p_limit)` - Returns run history for a specific job

  2. Security
    - Functions are SECURITY DEFINER to access cron schema
    - Only callable by authenticated users
*/

DROP FUNCTION IF EXISTS get_cron_jobs();

CREATE OR REPLACE FUNCTION get_cron_jobs()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  command text,
  active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout = '3s'
AS $$
  SELECT jobid, jobname, schedule, command, active
  FROM cron.job
  ORDER BY jobname;
$$;

DROP FUNCTION IF EXISTS get_cron_job_run_history(bigint, integer);

CREATE OR REPLACE FUNCTION get_cron_job_run_history(
  p_job_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  runid bigint,
  jobid bigint,
  jobname text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz,
  duration_ms double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
  SELECT 
    d.runid,
    d.jobid,
    j.jobname,
    d.status,
    d.return_message,
    d.start_time,
    d.end_time,
    EXTRACT(EPOCH FROM (d.end_time - d.start_time)) * 1000 as duration_ms
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE (p_job_id IS NULL OR d.jobid = p_job_id)
  ORDER BY d.start_time DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION get_cron_job_run_history(bigint, integer) TO authenticated;
