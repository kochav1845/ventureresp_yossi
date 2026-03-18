/*
  # Create payment counts by type function

  1. New Functions
    - `get_payment_counts_by_type(p_start_date, p_end_date)` 
      - Returns count of payments grouped by type within a date range
      - Used by Payment Breakdown comparison to show per-type counts from the database
      - Returns `payment_type` (text) and `type_count` (bigint) columns

  2. Important Notes
    - Groups ALL payment types (Payment, Prepayment, Credit Memo, Voided Payment, etc.)
    - No types are excluded so the result is a complete picture of what is in the database
*/

CREATE OR REPLACE FUNCTION get_payment_counts_by_type(
  p_start_date text,
  p_end_date text
)
RETURNS TABLE(payment_type text, type_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    type AS payment_type,
    count(*) AS type_count
  FROM acumatica_payments
  WHERE application_date >= p_start_date::timestamptz
    AND application_date <= p_end_date::timestamptz
  GROUP BY type
  ORDER BY type_count DESC;
$$;
