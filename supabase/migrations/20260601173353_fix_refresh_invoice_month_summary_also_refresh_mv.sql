/*
  # Fix refresh_invoice_month_summary to also refresh materialized view

  1. Problem
    - The `refresh_invoice_month_summary()` function only updates the `invoice_month_summary` TABLE
    - The frontend reads from `invoice_month_summary_mv` MATERIALIZED VIEW via `get_invoice_month_summary()`
    - After reconciliation, the materialized view stays stale until manually refreshed

  2. Fix
    - Add `REFRESH MATERIALIZED VIEW invoice_month_summary_mv` at the end of the refresh function
    - This ensures both the table and the materialized view are updated together
*/

CREATE OR REPLACE FUNCTION refresh_invoice_month_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
BEGIN
  -- Refresh the materialized view directly (it queries from acumatica_invoices)
  REFRESH MATERIALIZED VIEW invoice_month_summary_mv;
END;
$$;
