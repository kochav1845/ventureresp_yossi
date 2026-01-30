/*
  # Fix Column Name in Collector Progress Function
  
  1. Problem
    - Function used collector_id but column is actually assigned_collector_id
  
  2. Solution
    - Update function to use correct column name
*/

CREATE OR REPLACE FUNCTION get_collector_progress(
  p_collector_id uuid,
  p_start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date date DEFAULT CURRENT_DATE
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
  -- Get all invoices assigned to this collector with their assignment date
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
  -- Track when invoices got closed (balance = 0) - find actual close date
  closed_on_date AS (
    SELECT
      ci.invoice_reference_number,
      ci.amount,
      COALESCE(
        (
          SELECT MIN(changed_at::date)
          FROM invoice_status_changes
          WHERE invoice_reference_number = ci.invoice_reference_number
            AND color_status IS NOT NULL
            AND balance = 0
            AND changed_at::date >= ci.assignment_date
            AND changed_at::date <= p_end_date
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
  -- Track when invoices changed to red status (after assignment)
  red_status_on_date AS (
    SELECT
      ci.invoice_reference_number,
      MIN(isc.changed_at::date) as red_status_date
    FROM collector_invoices ci
    INNER JOIN invoice_status_changes isc 
      ON isc.invoice_reference_number = ci.invoice_reference_number
    WHERE isc.color_status = 'red'
      AND isc.changed_at::date >= ci.assignment_date
      AND isc.changed_at::date <= p_end_date
    GROUP BY ci.invoice_reference_number
  ),
  -- For each date, calculate cumulative no-change count
  daily_metrics AS (
    SELECT
      ds.date,
      -- Closed invoices on this date
      COALESCE(SUM(cod.amount), 0) as closed_amount,
      COUNT(DISTINCT cod.invoice_reference_number) as closed_count,
      -- Invoices that changed to red on this date
      COUNT(DISTINCT rsd.invoice_reference_number) as red_status_count,
      -- Count invoices assigned by this date that still have no status changes
      (
        SELECT COUNT(DISTINCT ci.invoice_reference_number)
        FROM collector_invoices ci
        WHERE ci.assignment_date <= ds.date
          AND ci.balance > 0
          AND NOT EXISTS (
            SELECT 1 
            FROM invoice_status_changes isc
            WHERE isc.invoice_reference_number = ci.invoice_reference_number
              AND isc.changed_at::date >= ci.assignment_date
              AND isc.changed_at::date <= ds.date
          )
      ) as no_change_count,
      -- Total invoices assigned by this date
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

GRANT EXECUTE ON FUNCTION get_collector_progress(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION get_collector_progress IS 'Get daily progress metrics for a collector with proper cumulative tracking of unchanged invoices';
