CREATE OR REPLACE FUNCTION public.search_invoices_fast(search_term text DEFAULT NULL::text, status_filter text DEFAULT NULL::text, customer_filter text DEFAULT NULL::text, customer_ids text[] DEFAULT NULL::text[], balance_filter text DEFAULT NULL::text, date_from date DEFAULT NULL::date, date_to date DEFAULT NULL::date, sort_by text DEFAULT 'date'::text, sort_order text DEFAULT 'desc'::text, result_limit integer DEFAULT 5000)
 RETURNS TABLE(id uuid, customer text, customer_name text, reference_number text, type text, status text, color_status text, date date, due_date date, amount numeric, balance numeric, terms text, last_modified_by_color text, customer_order text, description text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
