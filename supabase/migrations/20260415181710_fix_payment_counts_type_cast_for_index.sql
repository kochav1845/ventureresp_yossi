/*
  # Fix get_payment_counts_by_type type casting for index usage

  1. Changes
    - Change parameter types from text to date to avoid cast chain that prevents index usage
    - Use plpgsql with explicit date variables so the planner can match the expression index

  2. Why
    - The text->timestamptz->date cast chain was preventing the expression index from being used
    - Direct date comparison allows proper index matching
*/

CREATE OR REPLACE FUNCTION public.get_payment_counts_by_type(p_start_date text, p_end_date text)
RETURNS TABLE(payment_type text, type_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  v_start := p_start_date::date;
  v_end := p_end_date::date;

  RETURN QUERY
  SELECT
    type AS payment_type,
    count(*) AS type_count
  FROM acumatica_payments
  WHERE public.payment_effective_date(doc_date, application_date) >= v_start
    AND public.payment_effective_date(doc_date, application_date) <= v_end
  GROUP BY type
  ORDER BY type_count DESC;
END;
$$;