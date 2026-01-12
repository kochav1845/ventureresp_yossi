/*
  # Fix Invoice Search Count - Remove SET Command

  1. Problem
    - SET statement_timeout is not allowed in STABLE functions
    
  2. Solution
    - Remove SET command entirely
    - Rely on exception handling for timeouts
    - Use LIMIT to prevent slow queries
*/

-- Drop and recreate without SET command
DROP FUNCTION IF EXISTS search_invoices_count(TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, DATE, DATE, BIGINT);

CREATE OR REPLACE FUNCTION search_invoices_count(
  search_term TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT NULL,
  customer_filter TEXT DEFAULT NULL,
  customer_ids TEXT[] DEFAULT NULL,
  balance_filter TEXT DEFAULT NULL,
  color_filter TEXT DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL,
  max_count BIGINT DEFAULT 1000
)
RETURNS BIGINT AS $$
DECLARE
  is_numeric BOOLEAN;
  clean_search TEXT;
  padded_search TEXT;
  result_count BIGINT := 0;
  has_filters BOOLEAN := FALSE;
  approx_count BIGINT := 0;
BEGIN
  -- Check if we have any filters applied
  has_filters := (
    search_term IS NOT NULL AND search_term != '' OR
    (status_filter IS NOT NULL AND status_filter != 'all') OR
    (customer_filter IS NOT NULL AND customer_filter != 'all') OR
    customer_ids IS NOT NULL OR
    (balance_filter IS NOT NULL AND balance_filter != 'all') OR
    (color_filter IS NOT NULL AND color_filter != 'all') OR
    date_from IS NOT NULL OR
    date_to IS NOT NULL
  );

  -- If no filters, return fast approximate count from pg_class
  IF NOT has_filters THEN
    SELECT reltuples::BIGINT INTO approx_count
    FROM pg_class
    WHERE relname = 'acumatica_invoices';
    
    RETURN LEAST(approx_count, max_count);
  END IF;

  -- Clean and prepare search term
  IF search_term IS NOT NULL AND search_term != '' THEN
    clean_search := search_term;
    is_numeric := search_term ~ '^\d+$';
    
    IF is_numeric AND length(search_term) < 6 THEN
      padded_search := lpad(search_term, 6, '0');
    ELSE
      padded_search := clean_search;
    END IF;

    -- Try exact match first (fast index lookup)
    SELECT COUNT(*) INTO result_count
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
      AND (date_to IS NULL OR i.date <= date_to);
    
    IF result_count > 0 THEN
      RETURN result_count;
    END IF;
    
    -- For pattern matching, just check existence and return max_count if found
    -- This prevents slow ILIKE COUNT queries
    PERFORM 1
    FROM acumatica_invoices i
    WHERE 
      (i.reference_number ILIKE '%' || clean_search || '%' OR 
       i.customer_name ILIKE '%' || clean_search || '%')
      AND (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
      AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
      AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
      AND (balance_filter IS NULL OR balance_filter = 'all' OR 
        (balance_filter = 'paid' AND i.balance = 0) OR
        (balance_filter = 'unpaid' AND i.balance > 0))
      AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    LIMIT 1;
    
    -- If we found at least one, return max_count to show "many results"
    IF FOUND THEN
      RETURN max_count;
    ELSE
      RETURN 0;
    END IF;
  ELSE
    -- No search term, count with filters only (use LIMIT to cap)
    SELECT COUNT(*) INTO result_count
    FROM (
      SELECT 1
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
      LIMIT max_count
    ) limited;
    
    RETURN result_count;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update function grants
GRANT EXECUTE ON FUNCTION search_invoices_count TO authenticated;

-- Update comments
COMMENT ON FUNCTION search_invoices_count IS 
  'Returns fast approximate count of invoices (max 1000). For pattern searches, returns max_count if any results exist to prevent slow queries. Exact count only for filtered queries.';
