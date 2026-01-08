/*
  # Optimize Invoice Search for Exact Matches

  1. Changes
    - Add exact match optimization for reference numbers
    - Prioritize exact matches over pattern matches
    - Add timeout protection with statement_timeout
    - Improve query performance for numeric searches

  2. Performance
    - Exact reference_number matches use direct index lookup (fast)
    - Pattern matches only used when exact match fails
    - Statement timeout prevents long-running queries
*/

-- Drop existing function
DROP FUNCTION IF EXISTS search_invoices_fast(TEXT, TEXT, TEXT, TEXT[], TEXT, DATE, DATE, TEXT, TEXT, INTEGER);

-- Create optimized search function
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
BEGIN
  -- Set statement timeout to 5 seconds
  SET LOCAL statement_timeout = '5s';

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
    RETURN QUERY EXECUTE format('
      SELECT 
        i.id, i.customer, i.customer_name, i.reference_number,
        i.type, i.status, i.color_status, i.date, i.due_date,
        i.amount, i.balance, i.terms, i.last_modified_by_color,
        i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE 
        (i.reference_number = $1 OR i.reference_number = $2)
        AND ($3 IS NULL OR $3 = ''all'' OR i.status = $3)
        AND ($4 IS NULL OR $4 = ''all'' OR i.customer = $4)
        AND ($5 IS NULL OR i.customer = ANY($5))
        AND ($6 IS NULL OR $6 = ''all'' OR 
          ($6 = ''paid'' AND i.balance = 0) OR
          ($6 = ''unpaid'' AND i.balance > 0))
        AND ($7 IS NULL OR i.date >= $7)
        AND ($8 IS NULL OR i.date <= $8)
      ORDER BY %s
      LIMIT $9',
      CASE 
        WHEN sort_by = 'date' AND sort_order = 'desc' THEN 'i.date DESC'
        WHEN sort_by = 'date' AND sort_order = 'asc' THEN 'i.date ASC'
        WHEN sort_by = 'amount' AND sort_order = 'desc' THEN 'i.amount DESC'
        WHEN sort_by = 'amount' AND sort_order = 'asc' THEN 'i.amount ASC'
        WHEN sort_by = 'balance' AND sort_order = 'desc' THEN 'i.balance DESC'
        WHEN sort_by = 'balance' AND sort_order = 'asc' THEN 'i.balance ASC'
        ELSE 'i.date DESC'
      END
    ) USING clean_search, padded_search, status_filter, customer_filter, customer_ids, 
            balance_filter, date_from, date_to, result_limit;
    
    -- If we got results, return immediately
    IF FOUND THEN
      RETURN;
    END IF;
    
    -- Otherwise, fall back to pattern matching
    RETURN QUERY EXECUTE format('
      SELECT 
        i.id, i.customer, i.customer_name, i.reference_number,
        i.type, i.status, i.color_status, i.date, i.due_date,
        i.amount, i.balance, i.terms, i.last_modified_by_color,
        i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE 
        (i.reference_number ILIKE $1 OR 
         i.customer ILIKE $1 OR 
         i.customer_name ILIKE $1 OR 
         i.customer_order ILIKE $1 OR 
         i.description ILIKE $1)
        AND ($2 IS NULL OR $2 = ''all'' OR i.status = $2)
        AND ($3 IS NULL OR $3 = ''all'' OR i.customer = $3)
        AND ($4 IS NULL OR i.customer = ANY($4))
        AND ($5 IS NULL OR $5 = ''all'' OR 
          ($5 = ''paid'' AND i.balance = 0) OR
          ($5 = ''unpaid'' AND i.balance > 0))
        AND ($6 IS NULL OR i.date >= $6)
        AND ($7 IS NULL OR i.date <= $7)
      ORDER BY %s
      LIMIT $8',
      CASE 
        WHEN sort_by = 'date' AND sort_order = 'desc' THEN 'i.date DESC'
        WHEN sort_by = 'date' AND sort_order = 'asc' THEN 'i.date ASC'
        WHEN sort_by = 'amount' AND sort_order = 'desc' THEN 'i.amount DESC'
        WHEN sort_by = 'amount' AND sort_order = 'asc' THEN 'i.amount ASC'
        WHEN sort_by = 'balance' AND sort_order = 'desc' THEN 'i.balance DESC'
        WHEN sort_by = 'balance' AND sort_order = 'asc' THEN 'i.balance ASC'
        ELSE 'i.date DESC'
      END
    ) USING '%' || clean_search || '%', status_filter, customer_filter, customer_ids, 
            balance_filter, date_from, date_to, result_limit;
  ELSE
    -- No search term, just apply filters
    RETURN QUERY EXECUTE format('
      SELECT 
        i.id, i.customer, i.customer_name, i.reference_number,
        i.type, i.status, i.color_status, i.date, i.due_date,
        i.amount, i.balance, i.terms, i.last_modified_by_color,
        i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE 
        ($1 IS NULL OR $1 = ''all'' OR i.status = $1)
        AND ($2 IS NULL OR $2 = ''all'' OR i.customer = $2)
        AND ($3 IS NULL OR i.customer = ANY($3))
        AND ($4 IS NULL OR $4 = ''all'' OR 
          ($4 = ''paid'' AND i.balance = 0) OR
          ($4 = ''unpaid'' AND i.balance > 0))
        AND ($5 IS NULL OR i.date >= $5)
        AND ($6 IS NULL OR i.date <= $6)
      ORDER BY %s
      LIMIT $7',
      CASE 
        WHEN sort_by = 'date' AND sort_order = 'desc' THEN 'i.date DESC'
        WHEN sort_by = 'date' AND sort_order = 'asc' THEN 'i.date ASC'
        WHEN sort_by = 'amount' AND sort_order = 'desc' THEN 'i.amount DESC'
        WHEN sort_by = 'amount' AND sort_order = 'asc' THEN 'i.amount ASC'
        WHEN sort_by = 'balance' AND sort_order = 'desc' THEN 'i.balance DESC'
        WHEN sort_by = 'balance' AND sort_order = 'asc' THEN 'i.balance ASC'
        ELSE 'i.date DESC'
      END
    ) USING status_filter, customer_filter, customer_ids, balance_filter, date_from, date_to, result_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add exact match index on reference_number if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_invoices_reference_number_exact 
  ON acumatica_invoices (reference_number);

-- Add comment
COMMENT ON FUNCTION search_invoices_fast IS 'Optimized invoice search with exact match priority and timeout protection';
