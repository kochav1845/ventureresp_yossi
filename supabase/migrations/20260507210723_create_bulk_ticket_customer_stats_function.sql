/*
  # Create bulk ticket customer stats function

  1. Problem
    - After loading tickets, the frontend fetches invoice balances and
      last payments for each customer in batches with multiple round-trips
    - This adds several seconds to ticket loading

  2. New Function: `get_ticket_customer_stats_bulk`
    - Takes an array of customer IDs
    - Returns per-customer: balance, invoice count, oldest invoice date, last payment

  3. Expected Impact
    - Replaces multiple batch queries with 1 single call
    - Should complete in under 100ms for typical ticket counts
*/

CREATE OR REPLACE FUNCTION public.get_ticket_customer_stats_bulk(p_customer_ids text[])
RETURNS TABLE(
  customer_id text,
  total_balance numeric,
  open_invoice_count bigint,
  oldest_invoice_date date,
  last_payment_amount numeric,
  last_payment_date date
)
LANGUAGE sql
STABLE
AS $function$
  WITH invoice_stats AS (
    SELECT
      i.customer,
      SUM(i.balance) as total_balance,
      COUNT(*) as inv_count,
      MIN(i.date) as oldest_date
    FROM acumatica_invoices i
    WHERE i.customer = ANY(p_customer_ids)
      AND i.status != 'Closed'
    GROUP BY i.customer
  ),
  last_payments AS (
    SELECT DISTINCT ON (p.customer_id)
      p.customer_id,
      p.payment_amount,
      COALESCE(p.doc_date, p.application_date)::date as pay_date
    FROM acumatica_payments p
    WHERE p.customer_id = ANY(p_customer_ids)
      AND p.type IN ('Payment', 'Prepayment')
    ORDER BY p.customer_id, COALESCE(p.doc_date, p.application_date) DESC NULLS LAST
  )
  SELECT
    ist.customer as customer_id,
    COALESCE(ist.total_balance, 0) as total_balance,
    COALESCE(ist.inv_count, 0) as open_invoice_count,
    ist.oldest_date as oldest_invoice_date,
    lp.payment_amount as last_payment_amount,
    lp.pay_date as last_payment_date
  FROM invoice_stats ist
  LEFT JOIN last_payments lp ON lp.customer_id = ist.customer;
$function$;
