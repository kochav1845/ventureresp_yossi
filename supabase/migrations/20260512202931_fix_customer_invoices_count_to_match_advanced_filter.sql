/*
  # Fix customer invoice count function to match advanced filter definitions

  1. Problem
    - get_customer_invoices_count defines "open" as status = 'Open' only
    - get_customer_invoices_advanced defines "open" as status IN ('Open', 'Balanced') AND balance > 0
    - This causes mismatched counts shown in tabs vs actual results
    - "Balanced" count was catching everything that's not "Open" instead of the specific balanced tab definition

  2. Fix
    - Align count definitions with the advanced filter:
      - open_count: balance > 0 AND status IN ('Open', 'Balanced') -- matches "open" tab
      - balanced_count: balance > 0 AND status NOT IN ('Open', 'Balanced') -- matches "balanced" tab
      - paid_count: balance = 0 AND status != 'Voided' -- already correct
*/

CREATE OR REPLACE FUNCTION get_customer_invoices_count(p_customer_id text)
RETURNS TABLE(
  total_count bigint,
  open_count bigint,
  paid_count bigint,
  balanced_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE balance > 0 AND status IN ('Open', 'Balanced'))::bigint,
    COUNT(*) FILTER (WHERE balance = 0 AND status != 'Voided')::bigint,
    COUNT(*) FILTER (WHERE balance > 0 AND status NOT IN ('Open', 'Balanced'))::bigint
  FROM acumatica_invoices
  WHERE customer = p_customer_id AND status != 'On Hold';
END;
$$;