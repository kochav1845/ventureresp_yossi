/*
  # Create get_payments_for_analytics RPC function

  1. New Functions
    - `get_payments_for_analytics(p_start_date, p_end_date, p_excluded_types)`
      - Returns payments filtered by effective date (COALESCE(doc_date, application_date))
      - Excludes specified payment types
      - Used by the calculate-payment-analytics edge function

  2. Why
    - The edge function previously fetched ALL payments and filtered in JS, very slow for 32K+ rows
    - This function filters at the database level using the effective date index
    - Ensures consistent doc_date-first logic across all analytics

  3. Security
    - SECURITY DEFINER so the edge function can call it with service role
*/

CREATE OR REPLACE FUNCTION public.get_payments_for_analytics(
  p_start_date date,
  p_end_date date,
  p_excluded_types text[] DEFAULT ARRAY['Credit Memo', 'Balance WO', 'Cash Sale', 'Cash Return']
)
RETURNS TABLE (
  effective_date text,
  payment_amount text,
  customer_id text,
  type text,
  payment_method text,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(p.doc_date, p.application_date)::date::text AS effective_date,
    p.payment_amount::text,
    p.customer_id,
    p.type,
    p.payment_method,
    p.status
  FROM acumatica_payments p
  WHERE public.payment_effective_date(p.doc_date, p.application_date) >= p_start_date
    AND public.payment_effective_date(p.doc_date, p.application_date) <= p_end_date
    AND p.type != ALL(p_excluded_types);
$$;
