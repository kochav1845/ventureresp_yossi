/*
  # Create Get Cron Run Details Function

  1. New Functions
    - `get_cron_run_details` - Returns the last N runs of cron jobs for health reporting
      - Returns jobname, status, start_time, return_message
      - Limited to sync-related cron jobs
      - Ordered by most recent first

  2. Important Notes
    - Used by the sync report email to show cron job health
    - Security definer to access cron schema
*/

CREATE OR REPLACE FUNCTION get_cron_run_details(p_limit int DEFAULT 10)
RETURNS TABLE(
  jobname text,
  status text,
  start_time timestamptz,
  return_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.jobname::text,
    r.status::text,
    r.start_time,
    r.return_message::text
  FROM cron.job_run_details r
  JOIN cron.job j ON r.jobid = j.jobid
  WHERE j.jobname = 'acumatica-auto-sync'
  ORDER BY r.start_time DESC
  LIMIT p_limit;
END;
$$;