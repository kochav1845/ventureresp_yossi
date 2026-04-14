/*
  # Add per-type amount breakdowns to cached payment analytics

  1. Modified Tables
    - `cached_payment_analytics`
      - `payment_only_amount` (numeric) - Total amount from Payment type only
      - `payment_only_count` (int) - Count of Payment type only
      - `prepayment_amount` (numeric) - Total amount from Prepayment type only
      - `prepayment_count` (int) - Count of Prepayment type only
      - `credit_memo_amount` (numeric) - Total amount from Credit Memo type only
      - `credit_memo_count` (int) - Count of Credit Memo type only
      - `refund_amount` (numeric) - Total amount from Refund type only
      - `refund_count` (int) - Count of Refund type only
      - `voided_payment_amount` (numeric) - Total from Voided Payment type only
      - `voided_payment_count` (int) - Count of Voided Payment type only
      - `type_amounts` (jsonb) - Full breakdown of amounts per type

  2. Notes
    - These new columns allow the frontend to read per-type totals directly
      from the cache, avoiding live queries when filtering by payment type.
    - Existing rows will have 0 defaults until the cache is refreshed.
*/

-- Drop the view first so we can alter the underlying table freely
DROP VIEW IF EXISTS latest_payment_analytics;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cached_payment_analytics' AND column_name = 'payment_only_amount'
  ) THEN
    ALTER TABLE cached_payment_analytics
      ADD COLUMN payment_only_amount numeric(15,2) DEFAULT 0 NOT NULL,
      ADD COLUMN payment_only_count integer DEFAULT 0 NOT NULL,
      ADD COLUMN prepayment_amount numeric(15,2) DEFAULT 0 NOT NULL,
      ADD COLUMN prepayment_count integer DEFAULT 0 NOT NULL,
      ADD COLUMN credit_memo_amount numeric(15,2) DEFAULT 0 NOT NULL,
      ADD COLUMN credit_memo_count integer DEFAULT 0 NOT NULL,
      ADD COLUMN refund_amount numeric(15,2) DEFAULT 0 NOT NULL,
      ADD COLUMN refund_count integer DEFAULT 0 NOT NULL,
      ADD COLUMN voided_payment_amount numeric(15,2) DEFAULT 0 NOT NULL,
      ADD COLUMN voided_payment_count integer DEFAULT 0 NOT NULL,
      ADD COLUMN type_amounts jsonb DEFAULT '{}' NOT NULL;
  END IF;
END $$;

-- Recreate the view with all columns
CREATE OR REPLACE VIEW latest_payment_analytics AS
SELECT
  period_type,
  year,
  month,
  day,
  date,
  total_amount,
  payment_count,
  unique_customer_count,
  payment_only_amount,
  payment_only_count,
  prepayment_amount,
  prepayment_count,
  credit_memo_amount,
  credit_memo_count,
  refund_amount,
  refund_count,
  voided_payment_amount,
  voided_payment_count,
  type_amounts,
  payment_types,
  payment_methods,
  status_breakdown,
  calculated_at,
  EXTRACT(EPOCH FROM (now() - calculated_at))/3600 AS hours_since_calculation
FROM cached_payment_analytics
ORDER BY period_type, year DESC, month DESC NULLS LAST, day DESC NULLS LAST;

GRANT SELECT ON latest_payment_analytics TO authenticated;
GRANT SELECT ON latest_payment_analytics TO service_role;
