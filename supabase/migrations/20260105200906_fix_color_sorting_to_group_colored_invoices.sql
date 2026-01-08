/*
  # Fix Color Sorting to Group All Colored Invoices Together

  1. Updates
    - Modify `search_invoices_paginated` function to properly handle color sorting
    - When sorting by color, ALL colored invoices appear first, then non-colored
    - Within colored group, sort by color name alphabetically
    - Within non-colored group, sort by date

  2. Behavior
    - sort_by = 'color', sort_order = 'desc': Colored invoices first (A-Z by color), then no-color invoices
    - sort_by = 'color', sort_order = 'asc': No-color invoices first, then colored invoices (Z-A by color)
*/

CREATE OR REPLACE FUNCTION search_invoices_paginated(
  search_term TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT NULL,
  customer_filter TEXT DEFAULT NULL,
  customer_ids TEXT[] DEFAULT NULL,
  balance_filter TEXT DEFAULT NULL,
  color_filter TEXT DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL,
  sort_by TEXT DEFAULT 'date',
  sort_order TEXT DEFAULT 'desc',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  customer TEXT,
  customer_name TEXT,
  reference_number TEXT,
  type TEXT,
  status TEXT,
  color_status TEXT,
  date DATE,
  due_date DATE,
  amount NUMERIC,
  balance NUMERIC,
  terms TEXT,
  last_modified_by_color TEXT,
  customer_order TEXT,
  description TEXT
) AS $$
DECLARE
  is_numeric BOOLEAN;
  clean_search TEXT;
  padded_search TEXT;
  result_count INTEGER := 0;
BEGIN
  -- Clean and prepare search term
  IF search_term IS NOT NULL AND search_term != '' THEN
    clean_search := search_term;
    is_numeric := search_term ~ '^\d+$';

    -- For numeric searches, try padded version (e.g., "99906" -> "099906")
    IF is_numeric AND length(search_term) < 6 THEN
      padded_search := lpad(search_term, 6, '0');
    ELSE
      padded_search := clean_search;
    END IF;
  END IF;

  -- If we have a search term, try exact match first
  IF search_term IS NOT NULL AND search_term != '' THEN
    -- Try exact reference number match first (fast index lookup)
    RETURN QUERY
    SELECT
      i.id, i.customer, i.customer_name, i.reference_number,
      i.type, i.status, i.color_status, i.date, i.due_date,
      i.amount, i.balance, i.terms, i.last_modified_by_color,
      i.customer_order, i.description
    FROM acumatica_invoices i
    WHERE
      (i.reference_number = clean_search OR i.reference_number = padded_search)
      AND (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
      AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
      AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
      AND (balance_filter IS NULL OR balance_filter = 'all' OR
        (balance_filter = 'paid' AND i.balance = 0) OR
        (balance_filter = 'unpaid' AND i.balance > 0))
      AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    ORDER BY
      -- Color sorting: group colored invoices together first
      CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 1 ELSE 0 END
      END ASC,
      CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 0 ELSE 1 END
      END ASC,
      CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN i.color_status END DESC NULLS LAST,
      CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN i.color_status END ASC NULLS LAST,
      -- Other sorting options
      CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC NULLS LAST,
      CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC NULLS LAST,
      CASE WHEN sort_by = 'due_date' AND sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
      CASE WHEN sort_by = 'due_date' AND sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
      CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
      CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
      CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
      CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
      CASE WHEN sort_by = 'reference_number' AND sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
      CASE WHEN sort_by = 'reference_number' AND sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
      CASE WHEN sort_by = 'status' AND sort_order = 'desc' THEN i.status END DESC NULLS LAST,
      CASE WHEN sort_by = 'status' AND sort_order = 'asc' THEN i.status END ASC NULLS LAST,
      CASE WHEN sort_by = 'customer_name' AND sort_order = 'desc' THEN i.customer_name END DESC NULLS LAST,
      CASE WHEN sort_by = 'customer_name' AND sort_order = 'asc' THEN i.customer_name END ASC NULLS LAST,
      i.date DESC
    LIMIT p_limit
    OFFSET p_offset;

    GET DIAGNOSTICS result_count = ROW_COUNT;

    -- If we got results, return immediately
    IF result_count > 0 THEN
      RETURN;
    END IF;

    -- Otherwise, fall back to pattern matching
    RETURN QUERY
    SELECT
      i.id, i.customer, i.customer_name, i.reference_number,
      i.type, i.status, i.color_status, i.date, i.due_date,
      i.amount, i.balance, i.terms, i.last_modified_by_color,
      i.customer_order, i.description
    FROM acumatica_invoices i
    WHERE
      (i.reference_number ILIKE '%' || clean_search || '%' OR
       i.customer ILIKE '%' || clean_search || '%' OR
       i.customer_name ILIKE '%' || clean_search || '%' OR
       i.customer_order ILIKE '%' || clean_search || '%' OR
       i.description ILIKE '%' || clean_search || '%')
      AND (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
      AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
      AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
      AND (balance_filter IS NULL OR balance_filter = 'all' OR
        (balance_filter = 'paid' AND i.balance = 0) OR
        (balance_filter = 'unpaid' AND i.balance > 0))
      AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    ORDER BY
      -- Color sorting: group colored invoices together first
      CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 1 ELSE 0 END
      END ASC,
      CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 0 ELSE 1 END
      END ASC,
      CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN i.color_status END DESC NULLS LAST,
      CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN i.color_status END ASC NULLS LAST,
      -- Other sorting options
      CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC NULLS LAST,
      CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC NULLS LAST,
      CASE WHEN sort_by = 'due_date' AND sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
      CASE WHEN sort_by = 'due_date' AND sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
      CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
      CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
      CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
      CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
      CASE WHEN sort_by = 'reference_number' AND sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
      CASE WHEN sort_by = 'reference_number' AND sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
      CASE WHEN sort_by = 'status' AND sort_order = 'desc' THEN i.status END DESC NULLS LAST,
      CASE WHEN sort_by = 'status' AND sort_order = 'asc' THEN i.status END ASC NULLS LAST,
      CASE WHEN sort_by = 'customer_name' AND sort_order = 'desc' THEN i.customer_name END DESC NULLS LAST,
      CASE WHEN sort_by = 'customer_name' AND sort_order = 'asc' THEN i.customer_name END ASC NULLS LAST,
      i.date DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    -- No search term, just apply filters with pagination
    RETURN QUERY
    SELECT
      i.id, i.customer, i.customer_name, i.reference_number,
      i.type, i.status, i.color_status, i.date, i.due_date,
      i.amount, i.balance, i.terms, i.last_modified_by_color,
      i.customer_order, i.description
    FROM acumatica_invoices i
    WHERE
      (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
      AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
      AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
      AND (balance_filter IS NULL OR balance_filter = 'all' OR
        (balance_filter = 'paid' AND i.balance = 0) OR
        (balance_filter = 'unpaid' AND i.balance > 0))
      AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    ORDER BY
      -- Color sorting: group colored invoices together first
      CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 1 ELSE 0 END
      END ASC,
      CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 0 ELSE 1 END
      END ASC,
      CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN i.color_status END DESC NULLS LAST,
      CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN i.color_status END ASC NULLS LAST,
      -- Other sorting options
      CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC NULLS LAST,
      CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC NULLS LAST,
      CASE WHEN sort_by = 'due_date' AND sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
      CASE WHEN sort_by = 'due_date' AND sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
      CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
      CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
      CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
      CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
      CASE WHEN sort_by = 'reference_number' AND sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
      CASE WHEN sort_by = 'reference_number' AND sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
      CASE WHEN sort_by = 'status' AND sort_order = 'desc' THEN i.status END DESC NULLS LAST,
      CASE WHEN sort_by = 'status' AND sort_order = 'asc' THEN i.status END ASC NULLS LAST,
      CASE WHEN sort_by = 'customer_name' AND sort_order = 'desc' THEN i.customer_name END DESC NULLS LAST,
      CASE WHEN sort_by = 'customer_name' AND sort_order = 'asc' THEN i.customer_name END ASC NULLS LAST,
      i.date DESC
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_invoices_paginated IS
  'Returns paginated invoice search results (50 at a time) with all filters and sorting on server side. Color sorting groups ALL colored invoices first, then non-colored.';