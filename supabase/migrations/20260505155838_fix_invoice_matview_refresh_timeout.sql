/*
  # Fix invoice materialized view refresh timeout

  1. Changes
    - Updates `refresh_invoice_month_summary()` to temporarily set a 120-second
      statement timeout before refreshing, then restores the original timeout
    - This is necessary because the PostgREST `authenticator` role has an 8-second
      statement timeout, and the REFRESH CONCURRENTLY takes longer on 100K+ rows

  2. Important Notes
    - The function is SECURITY DEFINER so it can override the timeout
    - The timeout is restored in the EXCEPTION block to prevent leaking
*/

CREATE OR REPLACE FUNCTION refresh_invoice_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_timeout text;
BEGIN
  SELECT current_setting('statement_timeout') INTO old_timeout;
  SET LOCAL statement_timeout = '120s';
  REFRESH MATERIALIZED VIEW CONCURRENTLY invoice_month_summary_mv;
  EXECUTE format('SET LOCAL statement_timeout = %L', old_timeout);
EXCEPTION WHEN OTHERS THEN
  EXECUTE format('SET LOCAL statement_timeout = %L', old_timeout);
  RAISE;
END;
$$;
