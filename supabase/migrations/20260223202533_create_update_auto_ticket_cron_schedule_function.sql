/*
  # Create function to update auto-ticket rules cron schedule

  1. New Functions
    - `get_auto_ticket_cron_schedule()` - Returns the current cron schedule for auto-ticket rules
    - `update_auto_ticket_cron_schedule(p_hour, p_minute)` - Updates the cron job to run at a specific time (UTC)

  2. Security
    - Functions use SECURITY DEFINER to access cron schema
    - Granted to authenticated users (admin check is done in the UI)
*/

CREATE OR REPLACE FUNCTION get_auto_ticket_cron_schedule()
RETURNS TABLE (
  job_id bigint,
  schedule text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobid, j.schedule, j.active
  FROM cron.job j
  WHERE j.jobname = 'process-auto-ticket-rules-daily'
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION update_auto_ticket_cron_schedule(p_hour integer, p_minute integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_cron_expression text;
BEGIN
  IF p_hour < 0 OR p_hour > 23 THEN
    RAISE EXCEPTION 'Hour must be between 0 and 23';
  END IF;
  IF p_minute < 0 OR p_minute > 59 THEN
    RAISE EXCEPTION 'Minute must be between 0 and 59';
  END IF;

  v_cron_expression := p_minute || ' ' || p_hour || ' * * *';

  PERFORM cron.unschedule('process-auto-ticket-rules-daily');

  PERFORM cron.schedule(
    'process-auto-ticket-rules-daily',
    v_cron_expression,
    'SELECT process_auto_ticket_rules();'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_auto_ticket_cron_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION update_auto_ticket_cron_schedule(integer, integer) TO authenticated;
