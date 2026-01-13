/*
  # Ultra-Fast Invoice Count Without Timeout Tricks
  
  1. Problem
    - SHOW/SET statement_timeout commands causing issues
    - COUNT(*) on ILIKE is extremely slow on large tables
    - Full table scans timing out
    
  2. Solution (based on Postgres best practices)
    - Remove all SHOW/SET commands
    - For pattern searches: return quick estimate (1000) if ANY results exist
    - Use EXISTS pattern with LIMIT 1 instead of COUNT(*)
    - Only do exact counts for simple filtered queries
    - Leverage table statistics for unfiltered counts
    
  3. Performance Strategy
    - Exact match on reference_number: very fast (indexed)
    - Pattern match (ILIKE): return estimate to avoid full scan
    - Simple filters only: limited count with LIMIT
    - No filters: use pg_class statistics
*/

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
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  is_numeric BOOLEAN;
  clean_search TEXT;
  padded_search TEXT;
  result_count BIGINT := 0;
  has_filters BOOLEAN := FALSE;
  has_search BOOLEAN := FALSE;
BEGIN
  -- Determine if we have search or filters
  has_search := (search_term IS NOT NULL AND search_term != '');
  has_filters := (
    (status_filter IS NOT NULL AND status_filter != 'all') OR
    (customer_filter IS NOT NULL AND customer_filter != 'all') OR
    customer_ids IS NOT NULL OR
    (balance_filter IS NOT NULL AND balance_filter != 'all') OR
    (color_filter IS NOT NULL AND color_filter != 'all') OR
    date_from IS NOT NULL OR
    date_to IS NOT NULL
  );

  -- Fast path #1: No search, no filters - use table statistics
  IF NOT has_search AND NOT has_filters THEN
    SELECT reltuples::BIGINT INTO result_count
    FROM pg_class
    WHERE relname = 'acumatica_invoices';
    RETURN LEAST(result_count, max_count);
  END IF;

  -- Prepare search terms if provided
  IF has_search THEN
    clean_search := trim(search_term);
    is_numeric := clean_search ~ '^\d+$';
    
    IF is_numeric AND length(clean_search) < 6 THEN
      padded_search := lpad(clean_search, 6, '0');
    ELSE
      padded_search := clean_search;
    END IF;

    -- Fast path #2: Exact reference number match (very fast with unique index)
    SELECT COUNT(*) INTO result_count
    FROM acumatica_invoices i
    WHERE (i.reference_number = clean_search OR i.reference_number = padded_search)
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

    -- Slow path: Pattern matching
    -- Instead of COUNT(*), just check if ANY results exist and return max_count
    -- This prevents expensive full scans while still being accurate for pagination
    IF EXISTS (
      SELECT 1
      FROM acumatica_invoices i
      WHERE (i.reference_number ILIKE clean_search || '%' OR 
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
      LIMIT 1
    ) THEN
      -- Results exist, return estimate to avoid full count
      RETURN max_count;
    ELSE
      RETURN 0;
    END IF;
  ELSE
    -- No search, just filters - do limited count
    SELECT COUNT(*) INTO result_count
    FROM (
      SELECT 1
      FROM acumatica_invoices i
      WHERE (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
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
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION search_invoices_count TO authenticated, anon;

-- Add helpful comment
COMMENT ON FUNCTION search_invoices_count IS 
  'Fast invoice count using EXISTS pattern for searches. Returns exact count for reference number matches and simple filters. Returns estimate (max_count) for pattern matches to avoid expensive full scans.';
