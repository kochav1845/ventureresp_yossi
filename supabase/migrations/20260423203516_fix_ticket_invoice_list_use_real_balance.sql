/*
  # Fix ticket creation to show real invoice balances

  1. New Function
    - `get_unpaid_invoices_for_customer(p_customer_id text)`
      - Returns invoices with their effective balance calculated from payment applications
      - Excludes invoices that have been fully paid (effective balance <= 0)
      - Uses the `payment_invoice_applications` table to compute actual remaining balance
      - Falls back to the invoice's own `balance` column if no payment applications exist

  2. Why
    - The `acumatica_invoices.balance` field is not always updated promptly after payments
    - Payment application data in `payment_invoice_applications` is more accurate
    - This prevents fully-paid invoices from appearing in ticket creation

  3. Returns
    - reference_number, date, due_date, amount, effective_balance, description, type
*/

CREATE OR REPLACE FUNCTION get_unpaid_invoices_for_customer(p_customer_id text)
RETURNS TABLE (
  reference_number text,
  date timestamptz,
  due_date timestamptz,
  amount numeric,
  effective_balance numeric,
  description text,
  type text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    i.reference_number,
    i.date,
    i.due_date,
    i.amount,
    CASE
      WHEN COALESCE(pa.total_paid, 0) > 0 THEN i.amount - pa.total_paid
      ELSE i.balance
    END AS effective_balance,
    i.description,
    i.type
  FROM acumatica_invoices i
  LEFT JOIN (
    SELECT
      invoice_reference_number,
      SUM(amount_paid) AS total_paid
    FROM payment_invoice_applications
    GROUP BY invoice_reference_number
  ) pa ON pa.invoice_reference_number = i.reference_number
  WHERE i.customer = p_customer_id
    AND i.status = 'Open'
    AND i.type = 'Invoice'
    AND (
      CASE
        WHEN COALESCE(pa.total_paid, 0) > 0 THEN i.amount - pa.total_paid
        ELSE i.balance
      END
    ) > 0
  ORDER BY i.date DESC;
$$;
