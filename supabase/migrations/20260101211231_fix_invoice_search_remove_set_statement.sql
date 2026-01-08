/*
  # Fix Invoice Search - Remove SET Statement

  1. Changes
    - Remove SET LOCAL statement_timeout (not allowed in STABLE functions)
    - Keep optimized exact match logic
    - Rely on server-level timeout configuration

  2. Performance
    - Exact reference_number matches use direct index lookup
    - Pattern matches only used when exact match fails
*/

-- Drop existing function
DROP FUNCTION IF EXISTS search_invoices_fast(TEXT, TEXT, TEXT, TEXT[], TEXT, DATE, DATE, TEXT, TEXT, INTEGER);

-- Create optimized search function without SET
CREATE OR REPLACE FUNCTION search_invoices_fast(
  search_term TEXT DEFAULT NULL,
  status_filter TEXT DEFAULT NULL,
  customer_filter TEXT DEFAULT NULL,
  customer_ids TEXT[] DEFAULT NULL,
  balance_filter TEXT DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL,
  sort_by TEXT DEFAULT 'date',
  sort_order TEXT DEFAULT 'desc',
  result_limit INTEGER DEFAULT 5000
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
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    ORDER BY
      CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC,
      CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC,
      CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC,
      CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC,
      CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC,
      CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC,
      i.date DESC
    LIMIT result_limit;
    
    GET DIAGNOSTICS result_count = ROW_COUNT;
    
    -- If we got results, return immediately
    IF result_count > 0 THEN
      RETURN;
    END IF;
    
    -- Otherwise, fall back to pattern matching (limit to 1000 for performance)
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
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    ORDER BY
      CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC,
      CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC,
      CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC,
      CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC,
      CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC,
      CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC,
      i.date DESC
    LIMIT LEAST(result_limit, 1000);  -- Cap pattern matches at 1000 for performance
  ELSE
    -- No search term, just apply filters
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
      AND (date_from IS NULL OR i.date >= date_from)
      AND (date_to IS NULL OR i.date <= date_to)
    ORDER BY
      CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC,
      CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC,
      CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC,
      CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC,
      CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC,
      CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC,
      i.date DESC
    LIMIT result_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comment
COMMENT ON FUNCTION search_invoices_fast IS 'Optimized invoice search with exact match priority';
