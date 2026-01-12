/*
  # Optimize Invoice Search with Separate Sort Queries

  1. Problem
    - Dynamic CASE WHEN sorting prevents index usage
    - PostgreSQL can't optimize at planning time
    - Causes timeouts on large datasets
    
  2. Solution
    - Use separate IF/ELSIF branches for each sort type
    - Each branch has simple ORDER BY that can use indexes
    - PostgreSQL can now use index-only scans
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
BEGIN
  IF search_term IS NOT NULL AND search_term != '' THEN
    clean_search := search_term;
    is_numeric := search_term ~ '^\d+$';
    IF is_numeric AND length(search_term) < 6 THEN
      padded_search := lpad(search_term, 6, '0');
    ELSE
      padded_search := clean_search;
    END IF;
  END IF;

  -- Branch by sort column for index optimization
  IF sort_by = 'balance' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.balance DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.balance ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'amount' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.amount DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.amount ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'due_date' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.due_date DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.due_date ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'reference_number' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.reference_number DESC NULLS LAST
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.reference_number ASC NULLS LAST
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'customer_name' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.customer_name DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.customer_name ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'status' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.status DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.status ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'type' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.type DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.type ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSIF sort_by = 'color' THEN
    IF sort_order = 'desc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY 
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 1 ELSE 0 END,
        i.color_status DESC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY 
        CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 0 ELSE 1 END,
        i.color_status ASC NULLS LAST, i.date DESC
      LIMIT p_limit OFFSET p_offset;
    END IF;

  ELSE
    -- Default: sort by date
    IF sort_order = 'asc' THEN
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.date ASC NULLS LAST
      LIMIT p_limit OFFSET p_offset;
    ELSE
      RETURN QUERY
      SELECT i.id, i.customer, i.customer_name, i.reference_number,
             i.type, i.status, i.color_status, i.date, i.due_date,
             i.amount, i.balance, i.terms, i.last_modified_by_color,
             i.customer_order, i.description
      FROM acumatica_invoices i
      WHERE (search_term IS NULL OR search_term = '' OR
             i.reference_number = clean_search OR i.reference_number = padded_search OR
             i.reference_number ILIKE '%' || clean_search || '%' OR
             i.customer ILIKE '%' || clean_search || '%' OR
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
      ORDER BY i.date DESC NULLS LAST
      LIMIT p_limit OFFSET p_offset;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add indexes for amount sorting
CREATE INDEX IF NOT EXISTS idx_invoices_amount_sort 
  ON acumatica_invoices(amount DESC NULLS LAST, date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_amount_sort_asc 
  ON acumatica_invoices(amount ASC NULLS LAST, date DESC);

-- Add composite index for common filter + sort combinations
CREATE INDEX IF NOT EXISTS idx_invoices_status_date 
  ON acumatica_invoices(status, date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_date 
  ON acumatica_invoices(customer, date DESC);
