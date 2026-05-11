CREATE OR REPLACE FUNCTION public.search_invoices_paginated(search_term text DEFAULT NULL::text, status_filter text DEFAULT 'all'::text, customer_filter text DEFAULT 'all'::text, customer_ids text[] DEFAULT NULL::text[], balance_filter text DEFAULT 'all'::text, color_filter text DEFAULT 'all'::text, date_from date DEFAULT NULL::date, date_to date DEFAULT NULL::date, sort_by text DEFAULT 'date'::text, sort_order text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, customer text, customer_name text, reference_number text, type text, status text, color_status text, date date, due_date date, amount numeric, balance numeric, terms text, last_modified_by_color text, customer_order text, description text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
is_numeric BOOLEAN;
clean_search TEXT;
padded_search TEXT;
safe_limit INTEGER;
BEGIN
-- Hard cap limit at 50 to prevent expensive queries
safe_limit := LEAST(p_limit, 50);

-- Prepare search terms
IF search_term IS NOT NULL AND search_term != '' THEN
clean_search := trim(search_term);
is_numeric := clean_search ~ '^\d+$';

-- Pad numeric searches to 6 digits (invoice format)
IF is_numeric AND length(clean_search) < 6 THEN
padded_search := lpad(clean_search, 6, '0');
ELSE
padded_search := clean_search;
END IF;
END IF;

RETURN QUERY
SELECT 
i.id, i.customer, i.customer_name, i.reference_number,
i.type, i.status, i.color_status, i.date, i.due_date,
i.amount, i.balance, i.terms, i.last_modified_by_color,
i.customer_order, i.description
FROM acumatica_invoices i
WHERE 
-- Smart search logic: exact match for invoice numbers, fuzzy for customer names
(search_term IS NULL OR search_term = '' OR
-- If numeric: try exact matches first (VERY fast with index)
(is_numeric AND (
i.reference_number = clean_search OR 
i.reference_number = padded_search
)) OR
-- If not numeric or no exact match: use trigram search (fast with GIN index)
(NOT is_numeric AND (
i.reference_number ILIKE ('%' || clean_search || '%') OR
i.customer_name ILIKE ('%' || clean_search || '%')
))
)
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
CASE WHEN sort_by = 'date' AND sort_order = 'desc' THEN i.date END DESC NULLS LAST,
CASE WHEN sort_by = 'date' AND sort_order = 'asc' THEN i.date END ASC NULLS LAST,
CASE WHEN sort_by = 'balance' AND sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
CASE WHEN sort_by = 'balance' AND sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
CASE WHEN sort_by = 'amount' AND sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
CASE WHEN sort_by = 'amount' AND sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
CASE WHEN sort_by = 'due_date' AND sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
CASE WHEN sort_by = 'due_date' AND sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
CASE WHEN sort_by = 'reference_number' AND sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
CASE WHEN sort_by = 'reference_number' AND sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
CASE WHEN sort_by = 'customer_name' AND sort_order = 'desc' THEN i.customer_name END DESC NULLS LAST,
CASE WHEN sort_by = 'customer_name' AND sort_order = 'asc' THEN i.customer_name END ASC NULLS LAST,
CASE WHEN sort_by = 'status' AND sort_order = 'desc' THEN i.status END DESC NULLS LAST,
CASE WHEN sort_by = 'status' AND sort_order = 'asc' THEN i.status END ASC NULLS LAST,
CASE WHEN sort_by = 'type' AND sort_order = 'desc' THEN i.type END DESC NULLS LAST,
CASE WHEN sort_by = 'type' AND sort_order = 'asc' THEN i.type END ASC NULLS LAST,
CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN 
CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 1 ELSE 0 END
END ASC,
CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN i.color_status END DESC NULLS LAST,
CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN 
CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 0 ELSE 1 END
END ASC,
CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN i.color_status END ASC NULLS LAST,
i.date DESC NULLS LAST
LIMIT safe_limit OFFSET p_offset;
END;
$function$
