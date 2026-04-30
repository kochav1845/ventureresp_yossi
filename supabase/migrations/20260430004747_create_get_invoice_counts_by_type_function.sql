/*
  # Create invoice counts by type function

  1. New Functions
    - `get_invoice_counts_by_type(p_start_date, p_end_date)`
      - Returns count of invoices grouped by type within a date range
      - Used by Invoice Breakdown comparison to show per-type counts from the database
      - Returns `invoice_type` (text) and `type_count` (bigint) columns

  2. Important Notes
    - Groups ALL invoice types (Invoice, Credit Memo, Debit Memo, Credit WO, Overdue Charge)
    - Filters by the invoice `date` column (invoice date)
    - No types are excluded so the result is a complete picture of what is in the database
*/

CREATE OR REPLACE FUNCTION get_invoice_counts_by_type(
  p_start_date text,
  p_end_date text
)
RETURNS TABLE(invoice_type text, type_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    type AS invoice_type,
    count(*) AS type_count
  FROM acumatica_invoices
  WHERE date >= p_start_date::date
    AND date <= p_end_date::date
  GROUP BY type
  ORDER BY type_count DESC;
$$;
