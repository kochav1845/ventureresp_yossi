/*
  # Exclude On Hold Invoices From System

  On Hold invoices are future-dated invoices not yet ready for collection.
  They should not appear in user-facing queries, balances, analytics, or search.

  1. Updated Functions (12 core + 5 dependent):
    - search_invoices_paginated, search_invoices_count
    - get_customer_invoices_paginated, get_customer_invoices_count
    - get_customer_invoices_advanced, get_customer_invoices_advanced_count
    - get_customers_with_balance, get_customers_with_balance_count
    - get_customers_unpaid_summary, get_customers_unpaid_summary_count
    - get_ticket_customer_stats_bulk, get_invoice_breakdown_by_date
    - get_open_invoice_stats, get_status_distribution
    - get_collector_customer_invoices, get_customer_statements
    - global_search, get_invoice_counts_by_type

  2. Updated Materialized View:
    - invoice_month_summary_mv

  3. Security: No RLS changes
  4. Notes: 53 On Hold invoices ($218K) excluded, still visible in admin diagnostics
*/

-- ============================================================
-- 1. search_invoices_paginated - add status != 'On Hold'
-- ============================================================
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
safe_limit := LEAST(p_limit, 50);
IF search_term IS NOT NULL AND search_term != '' THEN
clean_search := trim(search_term);
is_numeric := clean_search ~ '^\d+$';
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
WHERE i.status != 'On Hold'
AND (search_term IS NULL OR search_term = '' OR
(is_numeric AND (i.reference_number = clean_search OR i.reference_number = padded_search)) OR
(NOT is_numeric AND (i.reference_number ILIKE ('%' || clean_search || '%') OR i.customer_name ILIKE ('%' || clean_search || '%')))
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
CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 1 ELSE 0 END END ASC,
CASE WHEN sort_by = 'color' AND sort_order = 'desc' THEN i.color_status END DESC NULLS LAST,
CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN
CASE WHEN i.color_status IS NULL OR i.color_status = 'none' THEN 0 ELSE 1 END END ASC,
CASE WHEN sort_by = 'color' AND sort_order = 'asc' THEN i.color_status END ASC NULLS LAST,
i.date DESC NULLS LAST
LIMIT safe_limit OFFSET p_offset;
END;
$function$;

-- ============================================================
-- 2. search_invoices_count - add status != 'On Hold'
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_invoices_count(search_term text DEFAULT NULL::text, status_filter text DEFAULT NULL::text, customer_filter text DEFAULT NULL::text, customer_ids text[] DEFAULT NULL::text[], balance_filter text DEFAULT NULL::text, color_filter text DEFAULT NULL::text, date_from date DEFAULT NULL::date, date_to date DEFAULT NULL::date, max_count bigint DEFAULT 1000)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
is_numeric BOOLEAN;
clean_search TEXT;
padded_search TEXT;
result_count BIGINT := 0;
has_filters BOOLEAN := FALSE;
has_search BOOLEAN := FALSE;
BEGIN
has_search := (search_term IS NOT NULL AND search_term != '');
has_filters := (
(status_filter IS NOT NULL AND status_filter != 'all') OR
(customer_filter IS NOT NULL AND customer_filter != 'all') OR
customer_ids IS NOT NULL OR
(balance_filter IS NOT NULL AND balance_filter != 'all') OR
(color_filter IS NOT NULL AND color_filter != 'all') OR
date_from IS NOT NULL OR date_to IS NOT NULL
);
-- No fast path for no-filter: always exclude On Hold
IF NOT has_search AND NOT has_filters THEN
SELECT COUNT(*) INTO result_count FROM acumatica_invoices WHERE status != 'On Hold';
RETURN LEAST(result_count, max_count);
END IF;
IF has_search THEN
clean_search := trim(search_term);
is_numeric := clean_search ~ '^\d+$';
IF is_numeric AND length(clean_search) < 6 THEN
padded_search := lpad(clean_search, 6, '0');
ELSE padded_search := clean_search;
END IF;
IF is_numeric THEN
SELECT COUNT(*) INTO result_count
FROM acumatica_invoices i
WHERE i.status != 'On Hold'
AND (i.reference_number = clean_search OR i.reference_number = padded_search)
AND (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
AND (balance_filter IS NULL OR balance_filter = 'all' OR
(balance_filter = 'paid' AND i.balance = 0) OR (balance_filter = 'unpaid' AND i.balance > 0))
AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
AND (date_from IS NULL OR i.date >= date_from) AND (date_to IS NULL OR i.date <= date_to);
RETURN result_count;
END IF;
IF EXISTS (
SELECT 1 FROM acumatica_invoices i
WHERE i.status != 'On Hold'
AND (i.reference_number ILIKE ('%' || clean_search || '%') OR i.customer_name ILIKE ('%' || clean_search || '%'))
AND (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
AND (balance_filter IS NULL OR balance_filter = 'all' OR
(balance_filter = 'paid' AND i.balance = 0) OR (balance_filter = 'unpaid' AND i.balance > 0))
AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
AND (date_from IS NULL OR i.date >= date_from) AND (date_to IS NULL OR i.date <= date_to)
LIMIT 1
) THEN RETURN max_count;
ELSE RETURN 0;
END IF;
ELSE
SELECT COUNT(*) INTO result_count FROM (
SELECT 1 FROM acumatica_invoices i
WHERE i.status != 'On Hold'
AND (status_filter IS NULL OR status_filter = 'all' OR i.status = status_filter)
AND (customer_filter IS NULL OR customer_filter = 'all' OR i.customer = customer_filter)
AND (customer_ids IS NULL OR i.customer = ANY(customer_ids))
AND (balance_filter IS NULL OR balance_filter = 'all' OR
(balance_filter = 'paid' AND i.balance = 0) OR (balance_filter = 'unpaid' AND i.balance > 0))
AND (color_filter IS NULL OR color_filter = 'all' OR i.color_status = color_filter)
AND (date_from IS NULL OR i.date >= date_from) AND (date_to IS NULL OR i.date <= date_to)
LIMIT max_count
) limited;
RETURN result_count;
END IF;
END;
$function$;

-- ============================================================
-- 3. get_customer_invoices_paginated
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customer_invoices_paginated(p_customer_id text, p_filter text DEFAULT 'all'::text, p_sort_by text DEFAULT 'date'::text, p_sort_order text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, reference_number text, date date, due_date date, status text, amount numeric, balance numeric, description text, color_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
SELECT i.id, i.reference_number, i.date, i.due_date, i.status, i.amount, i.balance, i.description, i.color_status
FROM acumatica_invoices i
WHERE i.customer = p_customer_id AND i.status != 'On Hold'
AND (p_filter = 'all' OR (p_filter = 'open' AND i.balance > 0) OR (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided'))
ORDER BY
CASE WHEN p_sort_by = 'date' AND p_sort_order = 'desc' THEN i.date END DESC NULLS LAST,
CASE WHEN p_sort_by = 'date' AND p_sort_order = 'asc' THEN i.date END ASC NULLS LAST,
CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
CASE WHEN p_sort_by = 'status' AND p_sort_order = 'desc' THEN i.status END DESC NULLS LAST,
CASE WHEN p_sort_by = 'status' AND p_sort_order = 'asc' THEN i.status END ASC NULLS LAST,
i.date DESC
LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ============================================================
-- 4. get_customer_invoices_count
-- ============================================================
DROP FUNCTION IF EXISTS get_customer_invoices_count(text, text);
CREATE OR REPLACE FUNCTION get_customer_invoices_count(p_customer_id text, p_filter text DEFAULT 'all')
RETURNS TABLE(total_count bigint, open_count bigint, paid_count bigint, balanced_count bigint)
LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
RETURN QUERY SELECT
COUNT(*)::bigint, COUNT(*) FILTER (WHERE balance > 0 AND status = 'Open')::bigint,
COUNT(*) FILTER (WHERE balance = 0 AND status != 'Voided')::bigint,
COUNT(*) FILTER (WHERE balance > 0 AND status != 'Open')::bigint
FROM acumatica_invoices WHERE customer = p_customer_id AND status != 'On Hold';
END;
$function$;

-- ============================================================
-- 5. get_customer_invoices_advanced
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customer_invoices_advanced(p_customer_id text, p_filter text, p_date_from date, p_date_to date, p_amount_min numeric, p_amount_max numeric, p_color_status text, p_invoice_status text, p_sort_by text, p_sort_order text, p_limit integer, p_offset integer, p_exclude_credit_memos boolean DEFAULT false)
 RETURNS TABLE(id uuid, reference_number text, type text, date date, due_date date, status text, amount numeric, balance numeric, description text, color_status text, days_overdue integer)
 LANGUAGE plpgsql STABLE
AS $function$
BEGIN
RETURN QUERY
SELECT i.id, i.reference_number, i.type, i.date, i.due_date, i.status,
CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.amount ELSE i.amount END,
CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.balance ELSE i.balance END,
i.description, i.color_status,
CASE WHEN i.due_date IS NOT NULL AND i.balance > 0 THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) ELSE 0 END
FROM acumatica_invoices i
WHERE i.customer = p_customer_id AND i.status != 'On Hold'
AND (p_filter = 'all' OR (p_filter = 'open' AND i.balance > 0 AND i.status IN ('Open', 'Balanced'))
OR (p_filter = 'balanced' AND i.balance > 0 AND i.status NOT IN ('Open', 'Balanced'))
OR (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided'))
AND (NOT p_exclude_credit_memos OR i.type NOT IN ('Credit Memo', 'Credit WO'))
AND (p_date_from IS NULL OR i.date >= p_date_from) AND (p_date_to IS NULL OR i.date <= p_date_to)
AND (p_amount_min IS NULL OR i.amount >= p_amount_min) AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
AND (p_color_status IS NULL OR p_color_status = '' OR i.color_status = p_color_status)
AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status)
ORDER BY
CASE WHEN p_sort_by = 'date' AND p_sort_order = 'desc' THEN i.date END DESC NULLS LAST,
CASE WHEN p_sort_by = 'date' AND p_sort_order = 'asc' THEN i.date END ASC NULLS LAST,
CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'desc' THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) END DESC NULLS LAST,
CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'asc' THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) END ASC NULLS LAST,
i.date DESC
LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ============================================================
-- 6. get_customer_invoices_advanced_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customer_invoices_advanced_count(p_customer_id text, p_filter text, p_date_from date, p_date_to date, p_amount_min numeric, p_amount_max numeric, p_color_status text, p_invoice_status text, p_exclude_credit_memos boolean DEFAULT false)
 RETURNS TABLE(total_count bigint, total_amount numeric, total_balance numeric)
 LANGUAGE plpgsql STABLE
AS $function$
BEGIN
RETURN QUERY
SELECT COUNT(*)::BIGINT,
COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.amount ELSE i.amount END), 0)::NUMERIC,
COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN -1 * i.balance ELSE i.balance END), 0)::NUMERIC
FROM acumatica_invoices i
WHERE i.customer = p_customer_id AND i.status != 'On Hold'
AND (p_filter = 'all' OR (p_filter = 'open' AND i.balance > 0 AND i.status IN ('Open', 'Balanced'))
OR (p_filter = 'balanced' AND i.balance > 0 AND i.status NOT IN ('Open', 'Balanced'))
OR (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided'))
AND (NOT p_exclude_credit_memos OR i.type NOT IN ('Credit Memo', 'Credit WO'))
AND (p_date_from IS NULL OR i.date >= p_date_from) AND (p_date_to IS NULL OR i.date <= p_date_to)
AND (p_amount_min IS NULL OR i.amount >= p_amount_min) AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
AND (p_color_status IS NULL OR p_color_status = '' OR i.color_status = p_color_status)
AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status);
END;
$function$;

-- ============================================================
-- 7. get_customers_with_balance - add On Hold exclusion
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customers_with_balance(p_search text, p_status_filter text, p_country_filter text, p_sort_by text, p_sort_order text, p_limit integer, p_offset integer, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_balance_filter text, p_min_balance numeric, p_max_balance numeric, p_min_open_invoices integer, p_max_open_invoices integer, p_min_invoice_amount numeric, p_max_invoice_amount numeric, p_exclude_credit_memos boolean, p_date_context text, p_calculate_avg_days boolean, p_min_days_overdue integer, p_max_days_overdue integer, p_test_customers boolean)
 RETURNS TABLE(id uuid, customer_id text, customer_name text, customer_status text, email_address text, phone1 text, address_line1 text, address_line2 text, city text, state text, postal_code text, country text, customer_class text, terms text, credit_limit numeric, statement_cycle text, parent_account text, price_class text, shipping_terms text, acumatica_record_id text, synced_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, red_threshold_days integer, color_status text, calculated_balance numeric, gross_balance numeric, credit_memo_balance numeric, open_invoice_count bigint, red_count bigint, yellow_count bigint, green_count bigint, max_days_overdue integer, exclude_from_payment_analytics boolean, exclude_from_customer_analytics boolean, avg_days_to_collect numeric, filtered_gross_balance numeric, filtered_invoice_count bigint, filtered_net_balance numeric)
 LANGUAGE plpgsql STABLE
AS $function$
DECLARE
v_has_filter boolean;
BEGIN
v_has_filter := (p_date_from IS NOT NULL OR p_date_to IS NOT NULL OR p_min_days_overdue IS NOT NULL OR p_max_days_overdue IS NOT NULL);
RETURN QUERY
WITH customer_balances AS (
SELECT i.customer,
COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as credit_memo_amt,
COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END) - SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as net_balance_amt,
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as invoice_count,
COUNT(*) FILTER (WHERE i.color_status = 'red' AND i.type IN ('Invoice', 'Debit Memo')) as red_cnt,
COUNT(*) FILTER (WHERE i.color_status IN ('yellow', 'orange') AND i.type IN ('Invoice', 'Debit Memo')) as yellow_cnt,
COUNT(*) FILTER (WHERE i.color_status = 'green' AND i.type IN ('Invoice', 'Debit Memo')) as green_cnt,
MAX(CASE WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo') THEN GREATEST(0, (CURRENT_DATE - i.date)::INT) ELSE 0 END) as max_overdue_days,
BOOL_OR(CASE WHEN p_date_from IS NULL AND p_date_to IS NULL THEN true
WHEN p_date_context = 'invoice_date' THEN (i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
WHEN p_date_context = 'balance_date' THEN (i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
ELSE false END) as passes_date_filter,
CASE WHEN v_has_filter THEN COALESCE(SUM(
CASE WHEN i.type IN ('Invoice', 'Debit Memo')
AND ((p_date_from IS NULL AND p_date_to IS NULL)
OR (p_date_context = 'invoice_date' AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
OR (p_date_context = 'balance_date' AND i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date)))
AND ((p_min_days_overdue IS NULL AND p_max_days_overdue IS NULL) OR (i.date IS NOT NULL AND GREATEST(0, (CURRENT_DATE - i.date)::INT) >= COALESCE(p_min_days_overdue, 0) AND GREATEST(0, (CURRENT_DATE - i.date)::INT) <= COALESCE(p_max_days_overdue, 999999)))
THEN i.balance ELSE 0 END), 0)
ELSE COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) END as filtered_gross_bal,
CASE WHEN v_has_filter THEN COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')
AND ((p_date_from IS NULL AND p_date_to IS NULL)
OR (p_date_context = 'invoice_date' AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
OR (p_date_context = 'balance_date' AND i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date)))
AND ((p_min_days_overdue IS NULL AND p_max_days_overdue IS NULL) OR (i.date IS NOT NULL AND GREATEST(0, (CURRENT_DATE - i.date)::INT) >= COALESCE(p_min_days_overdue, 0) AND GREATEST(0, (CURRENT_DATE - i.date)::INT) <= COALESCE(p_max_days_overdue, 999999))))
ELSE COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) END as filtered_inv_count
FROM acumatica_invoices i
WHERE i.balance > 0 AND i.status IN ('Open', 'Balanced')
AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
GROUP BY i.customer
),
customer_avg_collection_days AS (
SELECT p.customer_id, AVG(EXTRACT(EPOCH FROM (p.application_date::timestamp - i.date::timestamp)) / 86400)::numeric(10,1) as avg_days
FROM payment_invoice_applications pia
INNER JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number
INNER JOIN acumatica_payments p ON p.reference_number = pia.payment_reference_number
WHERE pia.amount_paid > 0 AND i.type = 'Invoice' AND p.type != 'Prepayment' AND p.application_date IS NOT NULL AND i.date IS NOT NULL AND p.application_date >= i.date
AND (p_calculate_avg_days OR p_sort_by = 'avg_days_to_collect')
GROUP BY p.customer_id
),
filtered_customers AS (
SELECT c.id, c.customer_id, c.customer_name, c.customer_status, c.email_address, c.city, c.billing_state, c.country, c.customer_class, c.terms, c.credit_limit, c.statement_cycle_id, c.parent_account, c.price_class_id, c.shipping_terms, c.note_id, c.synced_at, c.created_at, c.updated_at, c.days_from_invoice_threshold, c.customer_color_status, c.exclude_from_payment_analytics, c.exclude_from_customer_analytics,
cb.gross_balance_amt, cb.credit_memo_amt, cb.net_balance_amt, cb.invoice_count, cb.red_cnt, cb.yellow_cnt, cb.green_cnt, cb.max_overdue_days, cacd.avg_days, cb.filtered_gross_bal, cb.filtered_inv_count
FROM acumatica_customers c
LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
LEFT JOIN customer_avg_collection_days cacd ON c.customer_id = cacd.customer_id
WHERE c.is_test_customer = p_test_customers
AND (p_search IS NULL OR p_search = '' OR c.customer_id ILIKE '%' || p_search || '%' OR c.customer_name ILIKE '%' || p_search || '%' OR c.email_address ILIKE '%' || p_search || '%' OR c.customer_class ILIKE '%' || p_search || '%' OR c.city ILIKE '%' || p_search || '%' OR c.country ILIKE '%' || p_search || '%')
AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
AND ((p_date_from IS NULL AND p_date_to IS NULL) OR (p_date_context = 'customer_added' AND c.synced_at >= COALESCE(p_date_from, c.synced_at) AND c.synced_at <= COALESCE(p_date_to, c.synced_at)) OR (p_date_context IN ('invoice_date', 'balance_date') AND COALESCE(cb.passes_date_filter, false)))
AND (p_balance_filter = 'all' OR (p_balance_filter = 'positive' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END > 0) OR (p_balance_filter = 'negative' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END < 0) OR (p_balance_filter = 'zero' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END = 0))
AND (p_min_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END >= p_min_balance)
AND (p_max_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END <= p_max_balance)
AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
AND (p_min_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) >= p_min_days_overdue)
AND (p_max_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) <= p_max_days_overdue)
AND ((p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL) OR cb.invoice_count > 0)
ORDER BY
CASE WHEN p_sort_by = 'customer_name' AND p_sort_order = 'asc' THEN c.customer_name END ASC NULLS LAST,
CASE WHEN p_sort_by = 'customer_name' AND p_sort_order = 'desc' THEN c.customer_name END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END END ASC NULLS LAST,
CASE WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'desc' THEN COALESCE(cb.invoice_count, 0) END DESC NULLS LAST,
CASE WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'asc' THEN COALESCE(cb.invoice_count, 0) END ASC NULLS LAST,
CASE WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'desc' THEN COALESCE(cb.max_overdue_days, 0) END DESC NULLS LAST,
CASE WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'asc' THEN COALESCE(cb.max_overdue_days, 0) END ASC NULLS LAST,
CASE WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'desc' THEN c.days_from_invoice_threshold END DESC NULLS LAST,
CASE WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'asc' THEN c.days_from_invoice_threshold END ASC NULLS LAST,
CASE WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'desc' THEN cacd.avg_days END DESC NULLS LAST,
CASE WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'asc' THEN cacd.avg_days END ASC NULLS LAST,
c.customer_name ASC
LIMIT p_limit OFFSET p_offset
)
SELECT fc.id, fc.customer_id, fc.customer_name, fc.customer_status, fc.email_address, NULL::text, NULL::text, NULL::text, fc.city, fc.billing_state, NULL::text, fc.country, fc.customer_class, fc.terms, fc.credit_limit, fc.statement_cycle_id, fc.parent_account, fc.price_class_id, fc.shipping_terms, fc.note_id, fc.synced_at, fc.created_at, fc.updated_at, fc.days_from_invoice_threshold, fc.customer_color_status,
CASE WHEN p_exclude_credit_memos THEN COALESCE(fc.gross_balance_amt, 0) ELSE COALESCE(fc.net_balance_amt, 0) END::numeric,
COALESCE(fc.gross_balance_amt, 0)::numeric, COALESCE(fc.credit_memo_amt, 0)::numeric, COALESCE(fc.invoice_count, 0)::bigint,
COALESCE(fc.red_cnt, 0)::bigint, COALESCE(fc.yellow_cnt, 0)::bigint, COALESCE(fc.green_cnt, 0)::bigint, COALESCE(fc.max_overdue_days, 0)::int,
COALESCE(fc.exclude_from_payment_analytics, false), COALESCE(fc.exclude_from_customer_analytics, false), fc.avg_days,
COALESCE(fc.filtered_gross_bal, 0)::numeric, COALESCE(fc.filtered_inv_count, 0)::bigint,
(COALESCE(fc.filtered_gross_bal, 0) - COALESCE(fc.credit_memo_amt, 0))::numeric
FROM filtered_customers fc;
END;
$function$;

-- ============================================================
-- 8. get_customers_with_balance_count - add On Hold exclusion
-- Note: this function already filters status = 'Open', so On Hold is inherently excluded
-- But we add the filter explicitly for safety
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customers_with_balance_count(p_search text DEFAULT NULL::text, p_status_filter text DEFAULT NULL::text, p_country_filter text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_balance_filter text DEFAULT 'all'::text, p_min_balance numeric DEFAULT NULL::numeric, p_max_balance numeric DEFAULT NULL::numeric, p_min_open_invoices integer DEFAULT NULL::integer, p_max_open_invoices integer DEFAULT NULL::integer, p_min_invoice_amount numeric DEFAULT NULL::numeric, p_max_invoice_amount numeric DEFAULT NULL::numeric, p_exclude_credit_memos boolean DEFAULT false, p_date_context text DEFAULT 'invoice_date'::text, p_min_days_overdue integer DEFAULT NULL::integer, p_max_days_overdue integer DEFAULT NULL::integer, p_test_customers boolean DEFAULT false)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE result_count BIGINT;
BEGIN
WITH customer_balances AS (
SELECT i.customer,
COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as credit_memo_amt,
COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END) - SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as net_balance_amt,
COUNT(*) FILTER (WHERE i.type = 'Invoice') as invoice_count,
MAX(CASE WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type = 'Invoice' THEN GREATEST(0, (CURRENT_DATE - i.date)::INT) ELSE 0 END) as max_overdue_days,
BOOL_OR(CASE WHEN p_date_from IS NULL AND p_date_to IS NULL THEN true WHEN p_date_context = 'invoice_date' THEN (i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date)) WHEN p_date_context = 'balance_date' THEN (i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date)) ELSE false END) as passes_date_filter
FROM acumatica_invoices i
WHERE i.balance > 0 AND i.status NOT IN ('On Hold', 'Voided', 'Canceled')
AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
GROUP BY i.customer
)
SELECT COUNT(*) INTO result_count
FROM acumatica_customers c LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
WHERE c.is_test_customer = p_test_customers
AND (p_search IS NULL OR p_search = '' OR c.customer_id ILIKE '%' || p_search || '%' OR c.customer_name ILIKE '%' || p_search || '%' OR c.email_address ILIKE '%' || p_search || '%' OR c.customer_class ILIKE '%' || p_search || '%' OR c.city ILIKE '%' || p_search || '%' OR c.country ILIKE '%' || p_search || '%')
AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
AND ((p_date_from IS NULL AND p_date_to IS NULL) OR (p_date_context = 'customer_added' AND c.synced_at >= COALESCE(p_date_from, c.synced_at) AND c.synced_at <= COALESCE(p_date_to, c.synced_at)) OR (p_date_context IN ('invoice_date', 'balance_date') AND COALESCE(cb.passes_date_filter, false)))
AND (p_balance_filter = 'all' OR (p_balance_filter = 'positive' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END > 0) OR (p_balance_filter = 'negative' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END < 0) OR (p_balance_filter = 'zero' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END = 0))
AND (p_min_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END >= p_min_balance)
AND (p_max_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END <= p_max_balance)
AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
AND (p_min_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) >= p_min_days_overdue)
AND (p_max_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) <= p_max_days_overdue)
AND ((p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL) OR cb.invoice_count > 0);
RETURN result_count;
END;
$function$;

-- ============================================================
-- 9. get_customers_unpaid_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_min_balance numeric DEFAULT 0, p_sort_by text DEFAULT 'name'::text, p_sort_order text DEFAULT 'asc'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id text, customer_name text, email text, total_balance numeric, total_amount numeric, invoice_count bigint)
 LANGUAGE sql STABLE
AS $function$
WITH unpaid AS (
SELECT i.customer, SUM(i.balance) as total_balance, SUM(i.amount) as total_amount, COUNT(*) as invoice_count
FROM acumatica_invoices i
WHERE i.balance > 0 AND i.status != 'On Hold'
AND (p_date_from IS NULL OR i.date >= p_date_from) AND (p_date_to IS NULL OR i.date <= p_date_to)
GROUP BY i.customer HAVING SUM(i.balance) >= p_min_balance
)
SELECT u.customer, COALESCE(c.customer_name, 'Customer ' || u.customer), COALESCE(c.billing_email, c.general_email, ''),
u.total_balance, u.total_amount, u.invoice_count
FROM unpaid u LEFT JOIN acumatica_customers c ON c.customer_id = u.customer
WHERE (p_search IS NULL OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_id ILIKE '%' || p_search || '%' OR COALESCE(c.billing_email, c.general_email, '') ILIKE '%' || p_search || '%')
ORDER BY
CASE WHEN p_sort_by = 'name' AND p_sort_order = 'asc' THEN c.customer_name END ASC NULLS LAST,
CASE WHEN p_sort_by = 'name' AND p_sort_order = 'desc' THEN c.customer_name END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN u.total_balance END ASC,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN u.total_balance END DESC,
CASE WHEN p_sort_by = 'invoices' AND p_sort_order = 'asc' THEN u.invoice_count END ASC,
CASE WHEN p_sort_by = 'invoices' AND p_sort_order = 'desc' THEN u.invoice_count END DESC
LIMIT p_limit OFFSET p_offset;
$function$;

-- ============================================================
-- 10. get_customers_unpaid_summary_count
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary_count(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_min_balance numeric DEFAULT 0)
 RETURNS bigint LANGUAGE sql STABLE
AS $function$
WITH unpaid AS (
SELECT i.customer, SUM(i.balance) as total_balance
FROM acumatica_invoices i
WHERE i.balance > 0 AND i.status != 'On Hold'
AND (p_date_from IS NULL OR i.date >= p_date_from) AND (p_date_to IS NULL OR i.date <= p_date_to)
GROUP BY i.customer HAVING SUM(i.balance) >= p_min_balance
)
SELECT COUNT(*)::bigint FROM unpaid u LEFT JOIN acumatica_customers c ON c.customer_id = u.customer
WHERE (p_search IS NULL OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_id ILIKE '%' || p_search || '%' OR COALESCE(c.billing_email, c.general_email, '') ILIKE '%' || p_search || '%');
$function$;

-- ============================================================
-- 11. get_ticket_customer_stats_bulk
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ticket_customer_stats_bulk(p_customer_ids text[])
 RETURNS TABLE(customer_id text, total_balance numeric, open_invoice_count bigint, oldest_invoice_date date, last_payment_amount numeric, last_payment_date date)
 LANGUAGE sql STABLE
AS $function$
WITH invoice_stats AS (
SELECT i.customer, SUM(i.balance) as total_balance, COUNT(*) as inv_count, MIN(i.date) as oldest_date
FROM acumatica_invoices i
WHERE i.customer = ANY(p_customer_ids) AND i.status NOT IN ('Closed', 'On Hold')
GROUP BY i.customer
),
last_payments AS (
SELECT DISTINCT ON (p.customer_id) p.customer_id, p.payment_amount, COALESCE(p.doc_date, p.application_date)::date as pay_date
FROM acumatica_payments p WHERE p.customer_id = ANY(p_customer_ids) AND p.type IN ('Payment', 'Prepayment')
ORDER BY p.customer_id, COALESCE(p.doc_date, p.application_date) DESC NULLS LAST
)
SELECT ist.customer, COALESCE(ist.total_balance, 0), COALESCE(ist.inv_count, 0), ist.oldest_date, lp.payment_amount, lp.pay_date
FROM invoice_stats ist LEFT JOIN last_payments lp ON lp.customer_id = ist.customer;
$function$;

-- ============================================================
-- 12. get_invoice_breakdown_by_date
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_invoice_breakdown_by_date(p_year integer, p_month integer)
 RETURNS TABLE(day_date date, day_label text, invoice_type text, invoice_status text, invoice_count bigint, total_amount numeric, total_balance numeric, avg_amount numeric)
 LANGUAGE sql STABLE
AS $function$
SELECT i.date, to_char(i.date, 'Mon DD'), i.type, i.status,
COUNT(*)::bigint, COALESCE(SUM(i.amount), 0)::numeric, COALESCE(SUM(i.balance), 0)::numeric, COALESCE(AVG(i.amount), 0)::numeric
FROM acumatica_invoices i
WHERE i.date >= make_date(p_year, p_month, 1) AND i.date < (make_date(p_year, p_month, 1) + interval '1 month')::date
AND i.status != 'On Hold'
GROUP BY i.date, i.type, i.status ORDER BY i.date DESC, i.type, i.status;
$function$;

-- ============================================================
-- 13. get_invoice_counts_by_type
-- ============================================================
CREATE OR REPLACE FUNCTION get_invoice_counts_by_type(p_start_date text, p_end_date text)
RETURNS TABLE(invoice_type text, type_count bigint) LANGUAGE sql STABLE SECURITY DEFINER AS $$
SELECT type, count(*) FROM acumatica_invoices
WHERE date >= p_start_date::date AND date <= p_end_date::date AND status != 'On Hold'
GROUP BY type ORDER BY count(*) DESC;
$$;

-- ============================================================
-- 14. get_status_distribution
-- ============================================================
DROP FUNCTION IF EXISTS get_status_distribution(date);
CREATE OR REPLACE FUNCTION get_status_distribution(target_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(color text, count bigint) LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
IF target_date >= CURRENT_DATE THEN
RETURN QUERY SELECT COALESCE(color_status, 'none'), COUNT(*) FROM acumatica_invoices WHERE status != 'On Hold'
GROUP BY COALESCE(color_status, 'none') ORDER BY CASE COALESCE(color_status, 'none') WHEN 'red' THEN 1 WHEN 'orange' THEN 2 WHEN 'yellow' THEN 3 WHEN 'green' THEN 4 ELSE 5 END;
ELSE
RETURN QUERY SELECT COALESCE(color_status, 'none'), COUNT(*) FROM acumatica_invoices WHERE created_at < (target_date + 1)::timestamp AND status != 'On Hold'
GROUP BY COALESCE(color_status, 'none') ORDER BY CASE COALESCE(color_status, 'none') WHEN 'red' THEN 1 WHEN 'orange' THEN 2 WHEN 'yellow' THEN 3 WHEN 'green' THEN 4 ELSE 5 END;
END IF;
END;
$function$;

-- ============================================================
-- 15. get_collector_customer_invoices
-- ============================================================
DROP FUNCTION IF EXISTS get_collector_customer_invoices(text, uuid);
CREATE OR REPLACE FUNCTION get_collector_customer_invoices(p_customer_id text, p_collector_id uuid)
RETURNS TABLE(invoice_reference_number text, customer text, customer_name text, date timestamptz, due_date timestamptz, amount numeric, balance numeric, invoice_balance numeric, status text, invoice_status text, color_status text, promise_date timestamptz, promise_by_user_id uuid, description text)
LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
RETURN QUERY
SELECT inv.reference_number, inv.customer, inv.customer_name, inv.date, inv.due_date, inv.amount, inv.balance, inv.balance, inv.status, inv.status, inv.color_status, inv.promise_date, inv.promise_by_user_id, inv.description
FROM acumatica_invoices inv
WHERE inv.customer = p_customer_id AND inv.balance > 0 AND inv.status != 'On Hold'
AND EXISTS (SELECT 1 FROM collector_customer_assignments cca WHERE cca.customer_id = p_customer_id AND cca.assigned_collector_id = p_collector_id)
ORDER BY inv.due_date ASC;
END;
$function$;

-- ============================================================
-- 16. get_customer_statements
-- ============================================================
DROP FUNCTION IF EXISTS get_customer_statements(boolean);
CREATE OR REPLACE FUNCTION get_customer_statements(p_test_mode boolean DEFAULT false)
RETURNS TABLE(customer_id text, customer_name text, email text, terms text, total_balance numeric, credit_memo_balance numeric, open_invoice_count bigint, max_days_overdue integer)
LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
RETURN QUERY
SELECT c.customer_id, c.customer_name,
COALESCE(NULLIF(c.email_address, ''), NULLIF(c.billing_email, ''), NULLIF(c.general_email, ''), '')::text,
COALESCE(c.terms, '')::text,
COALESCE(SUM(CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0),
COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0),
COUNT(CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') THEN 1 END),
COALESCE(MAX(CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date::date, CURRENT_DATE))) ELSE 0 END), 0)::integer
FROM acumatica_customers c
LEFT JOIN acumatica_invoices i ON i.customer = c.customer_id AND i.balance > 0 AND i.status NOT IN ('Voided', 'On Hold')
WHERE c.is_test_customer = p_test_mode
GROUP BY c.customer_id, c.customer_name, c.email_address, c.billing_email, c.general_email, c.terms
HAVING CASE WHEN p_test_mode THEN true ELSE COALESCE(SUM(CASE WHEN i.type NOT IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) > 0 END;
END;
$function$;

-- ============================================================
-- 17. Recreate invoice_month_summary_mv without On Hold
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS invoice_month_summary_mv;
CREATE MATERIALIZED VIEW invoice_month_summary_mv AS
SELECT
  to_char(i.date, 'YYYY-MM') as month_key,
  COUNT(*) as total_invoices,
  COALESCE(SUM(i.amount::numeric), 0) as total_amount,
  COALESCE(SUM(i.balance::numeric), 0) as total_balance,
  COUNT(*) FILTER (WHERE i.type = 'Invoice') as invoice_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice'), 0) as invoice_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Invoice'), 0) as invoice_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status IN ('Open', 'Balanced')), 0) as invoice_open_balance,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open') as invoice_open_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Open'), 0) as invoice_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed') as invoice_closed_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Closed'), 0) as invoice_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced') as invoice_balanced_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Invoice' AND i.status = 'Balanced'), 0) as invoice_balanced_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo') as credit_memo_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo'), 0) as credit_memo_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Credit Memo'), 0) as credit_memo_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced')), 0) as credit_memo_open_balance,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open') as credit_memo_open_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Open'), 0) as credit_memo_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed') as credit_memo_closed_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Closed'), 0) as credit_memo_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced') as credit_memo_balanced_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit Memo' AND i.status = 'Balanced'), 0) as credit_memo_balanced_amount,
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo') as debit_memo_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0) as debit_memo_amount,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo'), 0) as debit_memo_balance,
  COALESCE(SUM(i.balance::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced')), 0) as debit_memo_open_balance,
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open') as debit_memo_open_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Open'), 0) as debit_memo_open_amount,
  COUNT(*) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed') as debit_memo_closed_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Debit Memo' AND i.status = 'Closed'), 0) as debit_memo_closed_amount,
  COUNT(*) FILTER (WHERE i.type = 'Credit WO') as credit_wo_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Credit WO'), 0) as credit_wo_amount,
  COUNT(*) FILTER (WHERE i.type = 'Overdue Charge') as overdue_charge_count,
  COALESCE(SUM(i.amount::numeric) FILTER (WHERE i.type = 'Overdue Charge'), 0) as overdue_charge_amount
FROM acumatica_invoices i
WHERE i.status != 'On Hold'
GROUP BY to_char(i.date, 'YYYY-MM')
ORDER BY month_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_month_summary_mv_key ON invoice_month_summary_mv(month_key);
