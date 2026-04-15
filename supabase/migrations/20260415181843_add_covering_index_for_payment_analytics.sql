/*
  # Add covering indexes for payment analytics queries

  1. Changes
    - Add covering index with INCLUDE for payment analytics columns
    - This allows index-only scans, avoiding 96MB heap table reads entirely
    - Covers: type, payment_amount, customer_id, status, payment_method

  2. Why
    - The acumatica_payments table has ~3KB per row (96MB for 32K rows)
    - Even with index scans, fetching heap pages is the bottleneck
    - A covering index keeps needed columns in the index itself
*/

CREATE INDEX IF NOT EXISTS idx_payments_analytics_covering
  ON acumatica_payments (
    (public.payment_effective_date(doc_date, application_date))
  )
  INCLUDE (type, payment_amount, customer_id, status, payment_method);
