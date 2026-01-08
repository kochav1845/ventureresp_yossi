/*
  # Optimize Invoice Search Performance

  1. Changes
    - Replace exact COUNT(*) with fast approximate count
    - Add maximum count limit (10000) to prevent timeouts
    - Use pg_class statistics for unfiltered queries
    - Add early exit when count exceeds maximum
    - Add composite indexes for common filter patterns

  2. Performance Improvements
    - Approximate counts return in milliseconds vs seconds
    - Pattern matching limited to prevent full table scans
    - Indexes speed up filtered queries
    - Maximum count prevents statement timeouts

  3. New Behavior
    - Returns "10000+" when results exceed limit
    - Fast approximate count for unfiltered queries
    - Exact counts only for small result sets
*/

-- Drop existing function
DROP FUNCTION IF EXISTS search_invoices_count(TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT, DATE, DATE);

-- Create optimized count function with maximum limit
CREATE OR REPLACE FUNCTION search_invoices_count(
  search_term TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT NULL,
  customer_filter TEXT DEFAULT NULL,
  customer_ids TEXT[] DEFAULT NULL,
  balance_filter TEXT DEFAULT NULL,
  color_filter TEXT DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL,
  max_count BIGINT DEFAULT 10000
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
    
    -- Cap at max_count for display purposes
    IF approx_count > max_count THEN
      RETURN max_count;
    ELSE
      RETURN approx_count;
    END IF;
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
    
    -- Pattern matching count with limit
    -- Use a subquery with LIMIT to prevent scanning entire table
    SELECT COUNT(*) INTO result_count
    FROM (
      SELECT 1
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
      LIMIT max_count
    ) limited;
    
    RETURN result_count;
  ELSE
    -- No search term, just count with filters (with limit)
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

-- Add composite indexes for common filter combinations (without CONCURRENTLY)
CREATE INDEX IF NOT EXISTS idx_invoices_status_date 
  ON acumatica_invoices(status, date DESC) WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_customer_date 
  ON acumatica_invoices(customer, date DESC) WHERE customer IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_balance_date 
  ON acumatica_invoices(balance, date DESC) WHERE balance > 0;

CREATE INDEX IF NOT EXISTS idx_invoices_color_status_date 
  ON acumatica_invoices(color_status, date DESC) WHERE color_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status 
  ON acumatica_invoices(customer, status) WHERE customer IS NOT NULL AND status IS NOT NULL;

-- Add trigram indexes for faster ILIKE searches (if pg_trgm extension available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_invoices_customer_name_trgm 
      ON acumatica_invoices USING gin(customer_name gin_trgm_ops);
    
    CREATE INDEX IF NOT EXISTS idx_invoices_description_trgm 
      ON acumatica_invoices USING gin(description gin_trgm_ops);
  END IF;
END $$;

-- Update function grants
GRANT EXECUTE ON FUNCTION search_invoices_count TO authenticated;

-- Update comments
COMMENT ON FUNCTION search_invoices_count IS 
  'Returns fast approximate count of invoices (max 10000) to prevent timeouts. Uses pg_class statistics for unfiltered queries and limited counting for filtered queries.';
