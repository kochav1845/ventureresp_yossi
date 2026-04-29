/*
  # Create invoice breakdown by date function

  1. New Functions
    - `get_invoice_breakdown_by_date(p_year, p_month)` - Returns daily invoice breakdown
      for a specific month, grouped by date, type, and status
      - `day_date` (date) - The date
      - `day_label` (text) - Human readable (e.g., "Jan 15")
      - `invoice_type` (text) - Invoice type (Invoice, Credit Memo, etc.)
      - `invoice_status` (text) - Invoice status (Open, Balanced, Closed, Voided)
      - `invoice_count` (bigint) - Count of invoices
      - `total_amount` (numeric) - Sum of amounts
      - `total_balance` (numeric) - Sum of balances
      - `avg_amount` (numeric) - Average amount

  2. Important Notes
    - Used for daily drill-down in Invoice Breakdown page
    - Groups by date, type, and status for expandable detail view
*/

CREATE OR REPLACE FUNCTION public.get_invoice_breakdown_by_date(
  p_year integer,
  p_month integer
)
RETURNS TABLE(
  day_date date,
  day_label text,
  invoice_type text,
  invoice_status text,
  invoice_count bigint,
  total_amount numeric,
  total_balance numeric,
  avg_amount numeric
)
LANGUAGE sql
STABLE
AS $function$
SELECT
  i.date as day_date,
  to_char(i.date, 'Mon DD') as day_label,
  i.type as invoice_type,
  i.status as invoice_status,
  COUNT(*)::bigint as invoice_count,
  COALESCE(SUM(i.amount), 0)::numeric as total_amount,
  COALESCE(SUM(i.balance), 0)::numeric as total_balance,
  COALESCE(AVG(i.amount), 0)::numeric as avg_amount
FROM acumatica_invoices i
WHERE i.date IS NOT NULL
  AND EXTRACT(YEAR FROM i.date) = p_year
  AND EXTRACT(MONTH FROM i.date) = p_month
GROUP BY i.date, to_char(i.date, 'Mon DD'), i.type, i.status
ORDER BY i.date DESC, i.type, i.status;
$function$;
