/*
  # Create Collector Progress Tracking Function

  1. Purpose
    - Track collector performance over time with daily metrics
    - Shows amounts closed, invoices changed to red, and unchanged invoices

  2. Returns
    - Daily breakdown of:
      - date: The date of the metric
      - closed_amount: Total amount of invoices that were closed/paid
      - closed_count: Number of invoices closed
      - red_status_count: Number of invoices changed to red status
      - no_change_count: Number of invoices with no status change
      - total_assigned: Total number of invoices assigned on that date
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
    WHERE ia.collector_id = p_collector_id
      AND ia.assigned_at::date <= p_end_date
    ORDER BY ia.invoice_reference_number, ia.assigned_at DESC
  ),
  -- Track when invoices got closed (balance = 0)
  closed_invoices AS (
    SELECT
      ci.invoice_reference_number,
      ci.assignment_date,
      ci.amount,
      -- Find when the invoice was closed by looking at activity logs or use current date if already closed
      COALESCE(
        (
          SELECT MIN(created_at::date)
          FROM user_activity_logs
          WHERE action_type = 'invoice_status_change'
            AND details->>'invoice_reference_number' = ci.invoice_reference_number
            AND details->>'new_status' = 'Closed'
            AND created_at >= ci.assignment_date
        ),
        CASE WHEN ci.balance = 0 THEN CURRENT_DATE ELSE NULL END
      ) as closed_date
    FROM collector_invoices ci
    WHERE ci.balance = 0 OR EXISTS (
      SELECT 1 FROM user_activity_logs
      WHERE action_type = 'invoice_status_change'
        AND details->>'invoice_reference_number' = ci.invoice_reference_number
        AND details->>'new_status' = 'Closed'
    )
  ),
  -- Track color status changes
  color_changes AS (
    SELECT
      ci.invoice_reference_number,
      ci.assignment_date,
      MIN(CASE WHEN isc.color_status = 'red' THEN isc.changed_at::date ELSE NULL END) as red_status_date
    FROM collector_invoices ci
    LEFT JOIN invoice_status_changes isc ON isc.invoice_reference_number = ci.invoice_reference_number
    WHERE isc.changed_at >= ci.assignment_date OR isc.changed_at IS NULL
    GROUP BY ci.invoice_reference_number, ci.assignment_date
  ),
  -- Check for invoices with no status changes
  no_status_change AS (
    SELECT
      ci.invoice_reference_number,
      ci.assignment_date
    FROM collector_invoices ci
    WHERE NOT EXISTS (
      SELECT 1 FROM invoice_status_changes isc
      WHERE isc.invoice_reference_number = ci.invoice_reference_number
        AND isc.changed_at >= ci.assignment_date
    )
  )
  SELECT
    ds.date,
    COALESCE(SUM(cld.amount), 0) as closed_amount,
    COUNT(DISTINCT cld.invoice_reference_number) as closed_count,
    COUNT(DISTINCT cc.invoice_reference_number) as red_status_count,
    COUNT(DISTINCT nsc.invoice_reference_number) as no_change_count,
    COUNT(DISTINCT ci.invoice_reference_number) as total_assigned
  FROM date_series ds
  LEFT JOIN collector_invoices ci ON ci.assignment_date = ds.date
  LEFT JOIN closed_invoices cld ON cld.closed_date = ds.date
  LEFT JOIN color_changes cc ON cc.red_status_date = ds.date
  LEFT JOIN no_status_change nsc ON nsc.assignment_date = ds.date
  WHERE ds.date >= p_start_date AND ds.date <= p_end_date
  GROUP BY ds.date
  ORDER BY ds.date;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_collector_progress(uuid, date, date) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_collector_progress IS 'Get daily progress metrics for a collector including closed amounts, red status changes, and unchanged invoices';