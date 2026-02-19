/*
  # Fix get_collector_progress function

  1. Changes
    - Replace references to non-existent `color_status` and `balance` columns 
      in `invoice_status_changes` table
    - Use `invoice_change_log` table (which has `field_name`, `old_value`, `new_value`)
      combined with `acumatica_invoices` for balance checks
    - Fix closed_on_date CTE to check balance from invoice_change_log
    - Fix red_status_on_date CTE to use invoice_change_log where field_name='color_status'

  2. Root Cause
    - `invoice_status_changes` does NOT have `color_status` or `balance` columns
    - Color status changes are tracked in `invoice_change_log` with field_name='color_status'
*/

DROP FUNCTION IF EXISTS get_collector_progress(uuid, date, date);

CREATE OR REPLACE FUNCTION get_collector_progress(
  p_collector_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  date date,
  closed_amount numeric,
  closed_count bigint,
  red_status_count bigint,
  no_change_count bigint,
  total_assigned bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
RETURN QUERY
WITH date_series AS (
  SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
),
collector_invoices AS (
  SELECT DISTINCT ON (ia.invoice_reference_number)
    ia.invoice_reference_number,
    ia.assigned_at::date as assignment_date,
    i.balance,
    i.amount
  FROM invoice_assignments ia
  LEFT JOIN acumatica_invoices i ON i.reference_number = ia.invoice_reference_number
  WHERE ia.assigned_collector_id = p_collector_id
    AND ia.assigned_at::date <= p_end_date
  ORDER BY ia.invoice_reference_number, ia.assigned_at DESC
),
closed_on_date AS (
  SELECT
    ci.invoice_reference_number,
    ci.amount,
    COALESCE(
      (
        SELECT MIN(icl.created_at::date)
        FROM invoice_change_log icl
        WHERE icl.invoice_reference_number = ci.invoice_reference_number
          AND icl.field_name = 'balance'
          AND icl.new_value = '0'
          AND icl.created_at::date >= ci.assignment_date
          AND icl.created_at::date <= p_end_date
      ),
      CASE 
        WHEN ci.balance = 0 AND ci.assignment_date <= p_end_date 
        THEN p_end_date 
        ELSE NULL 
      END
    ) as closed_date
  FROM collector_invoices ci
  WHERE ci.balance = 0
),
red_status_on_date AS (
  SELECT
    ci.invoice_reference_number,
    MIN(icl.created_at::date) as red_status_date
  FROM collector_invoices ci
  INNER JOIN invoice_change_log icl 
    ON icl.invoice_reference_number = ci.invoice_reference_number
  WHERE icl.field_name = 'color_status'
    AND icl.new_value = 'red'
    AND icl.created_at::date >= ci.assignment_date
    AND icl.created_at::date <= p_end_date
  GROUP BY ci.invoice_reference_number
),
daily_metrics AS (
  SELECT
    ds.date,
    COALESCE(SUM(cod.amount), 0) as closed_amount,
    COUNT(DISTINCT cod.invoice_reference_number) as closed_count,
    COUNT(DISTINCT rsd.invoice_reference_number) as red_status_count,
    (
      SELECT COUNT(DISTINCT ci.invoice_reference_number)
      FROM collector_invoices ci
      WHERE ci.assignment_date <= ds.date
        AND ci.balance > 0
        AND NOT EXISTS (
          SELECT 1 
          FROM invoice_change_log icl
          WHERE icl.invoice_reference_number = ci.invoice_reference_number
            AND icl.created_at::date >= ci.assignment_date
            AND icl.created_at::date <= ds.date
        )
    ) as no_change_count,
    (
      SELECT COUNT(DISTINCT ci.invoice_reference_number)
      FROM collector_invoices ci
      WHERE ci.assignment_date <= ds.date
    ) as total_assigned
  FROM date_series ds
  LEFT JOIN closed_on_date cod ON cod.closed_date = ds.date
  LEFT JOIN red_status_on_date rsd ON rsd.red_status_date = ds.date
  GROUP BY ds.date
)
SELECT * FROM daily_metrics
ORDER BY date;
END;
$$;
