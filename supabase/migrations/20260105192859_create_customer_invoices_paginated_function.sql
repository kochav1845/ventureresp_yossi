/*
  # Create Paginated Customer Invoices Function

  1. New Function
    - `get_customer_invoices_paginated` - Returns invoices for a specific customer with pagination and sorting
    - Supports sorting by any invoice column
    - Returns data in chunks for efficient loading
    - Supports filtering by status (open/paid/all)

  2. Purpose
    - Enable efficient loading of large invoice lists (2000+ invoices per customer)
    - Backend sorting and filtering for better performance
    - Supports infinite scroll pattern on frontend

  3. Performance
    - Uses indexes on customer and date columns
    - Efficient pagination with OFFSET/LIMIT
    - Returns minimal required fields
*/

CREATE OR REPLACE FUNCTION get_customer_invoices_paginated(
  p_customer_id text,
  p_filter text DEFAULT 'all',
  p_sort_by text DEFAULT 'date',
  p_sort_order text DEFAULT 'desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  reference_number text,
  date timestamptz,
  due_date timestamptz,
  status text,
  amount numeric,
  balance numeric,
  description text,
  color_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.reference_number,
    i.date,
    i.due_date,
    i.status,
    i.amount,
    i.balance,
    i.description,
    i.color_status
  FROM acumatica_invoices i
  WHERE
    i.customer = p_customer_id
    AND (
      p_filter = 'all' OR
      (p_filter = 'open' AND i.balance > 0) OR
      (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided')
    )
  ORDER BY
    CASE WHEN p_sort_by = 'date' AND p_sort_order = 'desc' THEN i.date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'date' AND p_sort_order = 'asc' THEN i.date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'status' AND p_sort_order = 'desc' THEN i.status END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'status' AND p_sort_order = 'asc' THEN i.status END ASC NULLS LAST,
    i.date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get counts
CREATE OR REPLACE FUNCTION get_customer_invoices_count(
  p_customer_id text,
  p_filter text DEFAULT 'all'
)
RETURNS TABLE (
  total_count bigint,
  open_count bigint,
  paid_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_count,
    COUNT(*) FILTER (WHERE balance > 0)::bigint as open_count,
    COUNT(*) FILTER (WHERE balance = 0 AND status != 'Voided')::bigint as paid_count
  FROM acumatica_invoices
  WHERE customer = p_customer_id;
END;
$$;

COMMENT ON FUNCTION get_customer_invoices_paginated IS
  'Returns paginated and sorted invoices for a specific customer for efficient loading of large invoice lists';

COMMENT ON FUNCTION get_customer_invoices_count IS
  'Returns invoice counts (total, open, paid) for a specific customer';

GRANT EXECUTE ON FUNCTION get_customer_invoices_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_invoices_count TO authenticated;
