/*
  # Create invoice month summary function

  1. New Functions
    - `get_invoice_month_summary()` - Returns monthly invoice aggregates grouped by type
      - `month_key` (text) - YYYY-MM format
      - `month_label` (text) - Human readable (e.g., "Jan 2026")
      - `total_invoices` (bigint) - Total count of all document types
      - `total_amount` (numeric) - Sum of all amounts
      - `total_balance` (numeric) - Sum of all remaining balances
      - Per-type breakdowns for: Invoice, Credit Memo, Debit Memo, Credit WO, Overdue Charge
        Each with count, amount, and balance columns

  2. Important Notes
    - Groups by invoice `date` column (invoice date)
    - Includes all statuses (Open, Balanced, Closed, Voided)
    - Ordered by month_key descending (newest first)
*/

CREATE OR REPLACE FUNCTION public.get_invoice_month_summary()
RETURNS TABLE(
  month_key text,
  month_label text,
  total_invoices bigint,
  total_amount numeric,
  total_balance numeric,
  invoice_count bigint,
  invoice_amount numeric,
  invoice_balance numeric,
  credit_memo_count bigint,
  credit_memo_amount numeric,
  credit_memo_balance numeric,
  debit_memo_count bigint,
  debit_memo_amount numeric,
  debit_memo_balance numeric,
  credit_wo_count bigint,
  credit_wo_amount numeric,
  credit_wo_balance numeric,
  overdue_charge_count bigint,
  overdue_charge_amount numeric,
  overdue_charge_balance numeric
)
LANGUAGE sql
STABLE
AS $function$
SELECT
  to_char(i.date, 'YYYY-MM') as month_key,
  to_char(i.date, 'Mon YYYY') as month_label,
  COUNT(*)::bigint as total_invoices,
  COALESCE(SUM(i.amount), 0)::numeric as total_amount,
  COALESCE(SUM(i.balance), 0)::numeric as total_balance,
  COUNT(*) FILTER (WHERE i.type = 'Invoice')::bigint as invoice_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Invoice'), 0)::numeric as invoice_balance,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo')::bigint as credit_memo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit Memo'), 0)::numeric as credit_memo_balance,
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo')::bigint as debit_memo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Debit Memo'), 0)::numeric as debit_memo_balance,
  COUNT(*) FILTER (WHERE i.type = 'Credit WO')::bigint as credit_wo_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Credit WO'), 0)::numeric as credit_wo_balance,
  COUNT(*) FILTER (WHERE i.type = 'Overdue Charge')::bigint as overdue_charge_count,
  COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'Overdue Charge'), 0)::numeric as overdue_charge_amount,
  COALESCE(SUM(i.balance) FILTER (WHERE i.type = 'Overdue Charge'), 0)::numeric as overdue_charge_balance
FROM acumatica_invoices i
WHERE i.date IS NOT NULL
GROUP BY to_char(i.date, 'YYYY-MM'), to_char(i.date, 'Mon YYYY')
ORDER BY month_key DESC;
$function$;
