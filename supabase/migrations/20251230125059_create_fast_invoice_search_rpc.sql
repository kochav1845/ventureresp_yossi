/*
  # Create Fast Invoice Search RPC Function
  
  1. Purpose
    - Create optimized server-side search function
    - Use existing trigram indexes
    - Handle complex filters efficiently
    - Prevent SQL injection and malformed queries
    
  2. Performance
    - Executes search server-side in PostgreSQL
    - Uses existing trigram indexes
    - Returns only needed columns
    - Applies all filters in single query
*/

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
BEGIN
  -- Clean and prepare search term
  IF search_term IS NOT NULL AND search_term != '' THEN
    clean_search := '%' || search_term || '%';
    is_numeric := search_term ~ '^\d+$';
  END IF;

  RETURN QUERY EXECUTE format('
    SELECT 
      i.id,
      i.customer,
      i.customer_name,
      i.reference_number,
      i.type,
      i.status,
      i.color_status,
      i.date,
      i.due_date,
      i.amount,
      i.balance,
      i.terms,
      i.last_modified_by_color,
      i.customer_order,
      i.description
    FROM acumatica_invoices i
    WHERE 
      -- Search filter (uses trigram indexes)
      ($1 IS NULL OR (
        %s
      ))
      -- Status filter
      AND ($2 IS NULL OR $2 = ''all'' OR i.status = $2)
      -- Customer filter
      AND ($3 IS NULL OR $3 = ''all'' OR i.customer = $3)
      -- Customer IDs filter
      AND ($4 IS NULL OR i.customer = ANY($4))
      -- Balance filter
      AND (
        $5 IS NULL OR 
        $5 = ''all'' OR 
        ($5 = ''paid'' AND i.balance = 0) OR
        ($5 = ''unpaid'' AND i.balance > 0)
      )
      -- Date filters
      AND ($6 IS NULL OR i.date >= $6)
      AND ($7 IS NULL OR i.date <= $7)
    ORDER BY
      %s
    LIMIT $8',
    -- Search condition based on numeric or text
    CASE 
      WHEN is_numeric THEN 
        'i.reference_number ILIKE $1 OR i.customer ILIKE $1 OR i.customer_order ILIKE $1'
      ELSE 
        'i.reference_number ILIKE $1 OR i.customer ILIKE $1 OR i.customer_name ILIKE $1 OR i.customer_order ILIKE $1 OR i.description ILIKE $1 OR i.type ILIKE $1'
    END,
    -- Sort clause
    CASE 
      WHEN sort_by = 'date' AND sort_order = 'desc' THEN 'i.date DESC'
      WHEN sort_by = 'date' AND sort_order = 'asc' THEN 'i.date ASC'
      WHEN sort_by = 'amount' AND sort_order = 'desc' THEN 'i.amount DESC'
      WHEN sort_by = 'amount' AND sort_order = 'asc' THEN 'i.amount ASC'
      WHEN sort_by = 'balance' AND sort_order = 'desc' THEN 'i.balance DESC'
      WHEN sort_by = 'balance' AND sort_order = 'asc' THEN 'i.balance ASC'
      ELSE 'i.date DESC'
    END
  )
  USING clean_search, status_filter, customer_filter, customer_ids, balance_filter, date_from, date_to, result_limit;
END;
$$ LANGUAGE plpgsql STABLE;
