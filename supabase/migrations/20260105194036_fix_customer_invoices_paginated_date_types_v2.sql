/*
  # Fix Customer Invoices Paginated Function Date Types

  1. Issue
    - Function returns `date` and `due_date` as `timestamptz` but database columns are `date`
    - This causes "structure of query does not match function result type" error

  2. Solution
    - Drop and recreate function with correct return types (date instead of timestamptz)
*/

DROP FUNCTION IF EXISTS get_customer_invoices_paginated(text, text, text, text, integer, integer);

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
  date date,
  due_date date,
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

COMMENT ON FUNCTION get_customer_invoices_paginated IS
  'Returns paginated and sorted invoices for a specific customer for efficient loading of large invoice lists';

GRANT EXECUTE ON FUNCTION get_customer_invoices_paginated TO authenticated;
