/*
  # Cron Job Management Functions
  
  1. New Functions
    - `get_cron_jobs()` - Returns all cron jobs from cron.job table
    - `toggle_cron_job(job_id, new_active)` - Enables or disables a specific cron job
  
  2. Security
    - Functions are available to authenticated users with appropriate permissions
    - Uses SECURITY DEFINER to allow access to cron schema
*/

-- Function to get all cron jobs
CREATE OR REPLACE FUNCTION get_cron_jobs()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  database text
)
SECURITY DEFINER
SET search_path = public, cron
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    j.database
  FROM cron.job j
  ORDER BY j.jobname;
END;
$$;

-- Function to toggle cron job status
CREATE OR REPLACE FUNCTION toggle_cron_job(
  job_id bigint,
  new_active boolean
)
RETURNS void
SECURITY DEFINER
SET search_path = public, cron
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE cron.job
  SET active = new_active
  WHERE jobid = job_id;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_cron_job(bigint, boolean) TO authenticated;
