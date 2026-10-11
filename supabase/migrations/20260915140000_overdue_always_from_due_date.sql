/*
  # Age every overdue figure from the DUE date

  "Days overdue" was computed from the INVOICE date in most server-side
  functions and from the DUE date in others (get_customer_invoices_advanced,
  get_single_customer_timeline, the statements RPC). Two controls both labelled
  "90+ days overdue" could therefore disagree badly -- for customer 15278995 the
  Customers page quick filter reported 33 invoices / $173,883.04 while the
  customer window's own filter reported 13 / $126,313.18.

  Everything now uses COALESCE(due_date, date): the due date, falling back to
  the invoice date only when an invoice has no due date (so those still age
  rather than counting as current). This matches what
  get_customer_invoices_advanced already did.

  Functions rewritten below -- bodies are otherwise byte-identical to what was
  deployed; only the ageing expression and its NOT NULL guard changed:
    - get_customers_with_balance_count   (must match get_customers_with_balance,
                                          which is already basis-driven, or the
                                          list and its count disagree)
    - get_customers_with_balance_fast
    - get_customer_dashboard_stats
    - get_customer_analytics             (was already due-date for "is overdue"
                                          but invoice-date for the day count)
    - refresh_cached_customer_stats

  NOT changed, deliberately:
    - refresh_cached_customer_balances writes BOTH max_days_overdue (invoice
      basis) and max_days_overdue_due (due basis); the frontend picks. Both stay.
    - acumatica_invoices.color_status is driven by the per-customer
      days_from_invoice_threshold, which is explicitly an invoice-date setting.
*/


CREATE OR REPLACE FUNCTION public.get_customers_with_balance_count(p_search text DEFAULT NULL::text, p_status_filter text DEFAULT 'all'::text, p_country_filter text DEFAULT 'all'::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_balance_filter text DEFAULT 'all'::text, p_min_balance numeric DEFAULT NULL::numeric, p_max_balance numeric DEFAULT NULL::numeric, p_min_open_invoices integer DEFAULT NULL::integer, p_max_open_invoices integer DEFAULT NULL::integer, p_min_invoice_amount numeric DEFAULT NULL::numeric, p_max_invoice_amount numeric DEFAULT NULL::numeric, p_exclude_credit_memos boolean DEFAULT false, p_date_context text DEFAULT 'invoice_date'::text, p_min_days_overdue integer DEFAULT NULL::integer, p_max_days_overdue integer DEFAULT NULL::integer, p_test_customers boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
v_count bigint;
v_has_filter boolean;
BEGIN

v_has_filter := (
p_date_from IS NOT NULL OR p_date_to IS NOT NULL
OR p_min_days_overdue IS NOT NULL OR p_max_days_overdue IS NOT NULL
OR p_min_invoice_amount IS NOT NULL OR p_max_invoice_amount IS NOT NULL
);

SELECT COUNT(*) INTO v_count
FROM (
SELECT c.customer_id
FROM acumatica_customers c
LEFT JOIN (
SELECT
i.customer,
COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
COALESCE(
SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END) -
SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END),
0
) as net_balance_amt,
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as invoice_count,
MAX(
CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) ELSE 0 END
) as max_overdue_days,
BOOL_OR(
CASE
WHEN p_date_from IS NULL AND p_date_to IS NULL THEN true
WHEN p_date_context = 'invoice_date'
THEN (i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
WHEN p_date_context = 'balance_date'
THEN (i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
ELSE false
END
) as passes_date_filter,
CASE WHEN v_has_filter THEN
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')
AND (
(p_date_from IS NULL AND p_date_to IS NULL)
OR (p_date_context = 'invoice_date' AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
OR (p_date_context = 'balance_date' AND i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
)
AND (
(p_min_days_overdue IS NULL AND p_max_days_overdue IS NULL)
OR (COALESCE(i.due_date, i.date) IS NOT NULL AND GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) >= COALESCE(p_min_days_overdue, 0) AND GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) <= COALESCE(p_max_days_overdue, 999999))
)
AND (p_min_invoice_amount IS NULL OR i.amount >= p_min_invoice_amount)
AND (p_max_invoice_amount IS NULL OR i.amount <= p_max_invoice_amount)
)
ELSE
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo'))
END as filtered_inv_count
FROM acumatica_invoices i
WHERE i.balance > 0 AND i.status IN ('Open', 'Balanced')
GROUP BY i.customer
) cb ON c.customer_id = cb.customer
WHERE
c.is_test_customer = p_test_customers
AND (p_search IS NULL OR p_search = '' OR
c.customer_id ILIKE '%' || p_search || '%' OR
c.customer_name ILIKE '%' || p_search || '%' OR
c.email_address ILIKE '%' || p_search || '%' OR
c.customer_class ILIKE '%' || p_search || '%' OR
c.city ILIKE '%' || p_search || '%' OR
c.country ILIKE '%' || p_search || '%')
AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
AND (
(p_date_from IS NULL AND p_date_to IS NULL)
OR (p_date_context = 'customer_added' AND c.synced_at >= COALESCE(p_date_from, c.synced_at) AND c.synced_at <= COALESCE(p_date_to, c.synced_at))
OR (p_date_context IN ('invoice_date', 'balance_date') AND COALESCE(cb.passes_date_filter, false))
)
AND (
p_balance_filter = 'all' OR
(p_balance_filter = 'positive' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END > 0) OR
(p_balance_filter = 'negative' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END < 0) OR
(p_balance_filter = 'zero' AND CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END = 0)
)
AND (p_min_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END >= p_min_balance)
AND (p_max_balance IS NULL OR CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END <= p_max_balance)
AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
AND (p_min_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) >= p_min_days_overdue)
AND (p_max_days_overdue IS NULL OR COALESCE(cb.filtered_inv_count, 0) > 0)
AND ((p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL) OR COALESCE(cb.filtered_inv_count, 0) > 0)
) sub;

RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customers_with_balance_fast(p_test_customers boolean DEFAULT false, p_exclude_credit_memos boolean DEFAULT false)
 RETURNS TABLE(id uuid, customer_id text, customer_name text, customer_status text, email_address text, city text, state text, country text, customer_class text, terms text, credit_limit numeric, created_at timestamp with time zone, updated_at timestamp with time zone, synced_at timestamp with time zone, red_threshold_days integer, color_status text, calculated_balance numeric, gross_balance numeric, credit_memo_balance numeric, open_invoice_count bigint, red_count bigint, yellow_count bigint, green_count bigint, max_days_overdue integer, exclude_from_payment_analytics boolean, exclude_from_customer_analytics boolean, filtered_gross_balance numeric, filtered_invoice_count bigint, filtered_net_balance numeric, is_active boolean, responded_this_month boolean, postpone_until timestamp with time zone, postpone_reason text)
 LANGUAGE sql
 STABLE
AS $function$
WITH customer_balances AS (
SELECT
i.customer,
COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) as gross_bal,
COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as cm_bal,
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as inv_count,
COUNT(*) FILTER (WHERE i.color_status = 'red' AND i.type IN ('Invoice', 'Debit Memo')) as red_cnt,
COUNT(*) FILTER (WHERE i.color_status IN ('yellow', 'orange') AND i.type IN ('Invoice', 'Debit Memo')) as yellow_cnt,
COUNT(*) FILTER (WHERE i.color_status = 'green' AND i.type IN ('Invoice', 'Debit Memo')) as green_cnt,
MAX(
CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT)
ELSE 0
END
) as max_overdue
FROM acumatica_invoices i
WHERE i.balance > 0
AND i.status IN ('Open', 'Balanced')
GROUP BY i.customer
)
SELECT
c.id,
c.customer_id,
c.customer_name,
c.customer_status,
c.email_address,
c.city,
c.billing_state as state,
c.country,
c.customer_class,
c.terms,
c.credit_limit,
c.created_at,
c.updated_at,
c.synced_at,
c.days_from_invoice_threshold as red_threshold_days,
c.customer_color_status as color_status,
CASE
WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_bal, 0)
ELSE COALESCE(cb.gross_bal, 0) - COALESCE(cb.cm_bal, 0)
END as calculated_balance,
COALESCE(cb.gross_bal, 0) as gross_balance,
COALESCE(cb.cm_bal, 0) as credit_memo_balance,
COALESCE(cb.inv_count, 0)::bigint as open_invoice_count,
COALESCE(cb.red_cnt, 0)::bigint as red_count,
COALESCE(cb.yellow_cnt, 0)::bigint as yellow_count,
COALESCE(cb.green_cnt, 0)::bigint as green_count,
COALESCE(cb.max_overdue, 0)::int as max_days_overdue,
COALESCE(c.exclude_from_payment_analytics, false) as exclude_from_payment_analytics,
COALESCE(c.exclude_from_customer_analytics, false) as exclude_from_customer_analytics,
COALESCE(cb.gross_bal, 0) as filtered_gross_balance,
COALESCE(cb.inv_count, 0)::bigint as filtered_invoice_count,
(COALESCE(cb.gross_bal, 0) - COALESCE(cb.cm_bal, 0)) as filtered_net_balance,
COALESCE(c.is_active, true) as is_active,
COALESCE(c.responded_this_month, false) as responded_this_month,
c.postpone_until,
c.postpone_reason
FROM acumatica_customers c
LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
WHERE c.is_test_customer = p_test_customers
ORDER BY c.customer_name ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_dashboard_stats(p_exclude_credit_memos boolean DEFAULT false, p_test_customers boolean DEFAULT false)
 RETURNS TABLE(total_customers bigint, customers_with_debt bigint, total_balance numeric, avg_balance numeric, total_open_invoices bigint, customers_with_overdue bigint)
 LANGUAGE sql
 STABLE
AS $function$
WITH customer_balances AS (
SELECT
i.customer,
COALESCE(SUM(
CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END
), 0) as positive_balance,
COALESCE(SUM(
CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END
), 0) as negative_balance,
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as invoice_count,
COUNT(*) FILTER (WHERE i.type IN ('Credit Memo', 'Credit WO')) as credit_count,
MAX(
CASE
WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date)::date))
ELSE 0
END
) as max_overdue_days
FROM acumatica_invoices i
WHERE i.balance > 0
AND i.status IN ('Open', 'Balanced')
GROUP BY i.customer
),
per_customer AS (
SELECT
c.customer_id,
CASE
WHEN p_exclude_credit_memos THEN COALESCE(cb.positive_balance, 0)
ELSE COALESCE(cb.positive_balance - cb.negative_balance, 0)
END as net_bal,
COALESCE(cb.invoice_count, 0) + COALESCE(cb.credit_count, 0) as total_doc_count,
COALESCE(cb.max_overdue_days, 0) as overdue_days
FROM acumatica_customers c
LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
WHERE c.is_test_customer = p_test_customers
)
SELECT
COUNT(*)::bigint as total_customers,
COUNT(*) FILTER (WHERE net_bal > 0)::bigint as customers_with_debt,
COALESCE(SUM(net_bal) FILTER (WHERE net_bal > 0), 0)::numeric as total_balance,
CASE
WHEN COUNT(*) FILTER (WHERE net_bal > 0) > 0
THEN (SUM(net_bal) FILTER (WHERE net_bal > 0) / COUNT(*) FILTER (WHERE net_bal > 0))::numeric
ELSE 0
END as avg_balance,
COALESCE(SUM(total_doc_count), 0)::bigint as total_open_invoices,
COUNT(*) FILTER (WHERE overdue_days > 0)::bigint as customers_with_overdue
FROM per_customer;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_analytics(p_search text DEFAULT NULL::text, p_status_filter text DEFAULT 'all'::text, p_country_filter text DEFAULT 'all'::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_excluded_customer_ids text[] DEFAULT NULL::text[], p_balance_filter text DEFAULT 'all'::text, p_min_balance numeric DEFAULT NULL::numeric, p_max_balance numeric DEFAULT NULL::numeric, p_min_open_invoices integer DEFAULT NULL::integer, p_max_open_invoices integer DEFAULT NULL::integer, p_date_context text DEFAULT 'invoice_date'::text, p_min_days_overdue integer DEFAULT NULL::integer, p_max_days_overdue integer DEFAULT NULL::integer, p_exclude_credit_memos boolean DEFAULT false, p_test_customers boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
v_has_filters boolean;
v_total_customers int := 0;
v_active_customers int := 0;
v_total_balance numeric := 0;
v_customers_with_debt int := 0;
v_total_open_invoices bigint := 0;
v_customers_with_overdue int := 0;
BEGIN
v_has_filters := (p_search IS NOT NULL AND p_search != '') OR 
(p_status_filter IS NOT NULL AND p_status_filter != 'all') OR 
(p_country_filter IS NOT NULL AND p_country_filter != 'all') OR 
(p_date_from IS NOT NULL) OR 
(p_date_to IS NOT NULL) OR
(p_excluded_customer_ids IS NOT NULL AND array_length(p_excluded_customer_ids, 1) > 0) OR
(p_balance_filter IS NOT NULL AND p_balance_filter != 'all') OR
(p_min_balance IS NOT NULL) OR
(p_max_balance IS NOT NULL) OR
(p_min_open_invoices IS NOT NULL) OR
(p_max_open_invoices IS NOT NULL) OR
(p_min_days_overdue IS NOT NULL) OR
(p_max_days_overdue IS NOT NULL) OR
(p_exclude_credit_memos = true) OR
(p_test_customers = true);

IF NOT v_has_filters THEN
SELECT COUNT(*) INTO v_total_customers FROM acumatica_customers;
SELECT COUNT(*) INTO v_active_customers FROM acumatica_customers WHERE customer_status = 'Active';
SELECT COALESCE(SUM(balance), 0) INTO v_total_balance FROM acumatica_invoices WHERE status = 'Open';
SELECT COUNT(*) INTO v_total_open_invoices FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
SELECT COUNT(DISTINCT customer) INTO v_customers_with_debt FROM acumatica_invoices WHERE status = 'Open' AND balance > 0;
SELECT COUNT(DISTINCT customer) INTO v_customers_with_overdue FROM acumatica_invoices WHERE status = 'Open' AND balance > 0 AND due_date < CURRENT_DATE;

RETURN json_build_object(
'total_customers', v_total_customers,
'active_customers', v_active_customers,
'total_balance', v_total_balance,
'avg_balance', CASE WHEN v_customers_with_debt > 0 THEN v_total_balance / v_customers_with_debt ELSE 0 END,
'customers_with_debt', v_customers_with_debt,
'total_open_invoices', v_total_open_invoices,
'customers_with_overdue', v_customers_with_overdue
);
END IF;

WITH base_customers AS (
SELECT c.customer_id, c.customer_status
FROM acumatica_customers c
WHERE
(p_search IS NULL OR p_search = '' OR 
c.customer_id ILIKE '%' || p_search || '%' OR
c.customer_name ILIKE '%' || p_search || '%')
AND (p_status_filter IS NULL OR p_status_filter = 'all' OR c.customer_status = p_status_filter)
AND (p_country_filter IS NULL OR p_country_filter = 'all' OR c.country = p_country_filter)
AND (p_excluded_customer_ids IS NULL OR array_length(p_excluded_customer_ids, 1) IS NULL OR c.customer_id != ALL(p_excluded_customer_ids))
AND (
CASE WHEN p_test_customers THEN
c.customer_id LIKE 'TEST-%'
ELSE
c.customer_id NOT LIKE 'TEST-%'
END
)
),
customer_balances AS (
SELECT 
bc.customer_id,
bc.customer_status,
COALESCE(SUM(CASE 
WHEN i.status = 'Open' AND (NOT p_exclude_credit_memos OR i.type != 'Credit Memo') 
THEN i.balance ELSE 0 
END), 0) as balance,
COUNT(CASE 
WHEN i.status = 'Open' AND i.balance > 0 AND (NOT p_exclude_credit_memos OR i.type != 'Credit Memo') 
THEN 1 
END)::int as inv_count,
BOOL_OR(i.status = 'Open' AND i.balance > 0 AND i.due_date < CURRENT_DATE AND (NOT p_exclude_credit_memos OR i.type != 'Credit Memo')) as is_overdue,
MAX(CASE 
WHEN i.status = 'Open' AND i.balance > 0 AND (NOT p_exclude_credit_memos OR i.type != 'Credit Memo')
THEN GREATEST(0, CURRENT_DATE - COALESCE(i.due_date, i.date))
ELSE 0
END)::int as max_days_overdue
FROM base_customers bc
LEFT JOIN acumatica_invoices i ON i.customer = bc.customer_id
AND (p_date_from IS NULL OR i.date >= p_date_from::date)
AND (p_date_to IS NULL OR i.date <= p_date_to::date)
GROUP BY bc.customer_id, bc.customer_status
),
filtered AS (
SELECT * FROM customer_balances
WHERE
(p_balance_filter IS NULL OR p_balance_filter = 'all' OR
(p_balance_filter = 'positive' AND balance > 0) OR
(p_balance_filter = 'negative' AND balance < 0) OR
(p_balance_filter = 'zero' AND balance = 0))
AND (p_min_balance IS NULL OR balance >= p_min_balance)
AND (p_max_balance IS NULL OR balance <= p_max_balance)
AND (p_min_open_invoices IS NULL OR inv_count >= p_min_open_invoices)
AND (p_max_open_invoices IS NULL OR inv_count <= p_max_open_invoices)
AND (p_min_days_overdue IS NULL OR max_days_overdue >= p_min_days_overdue)
AND (p_max_days_overdue IS NULL OR max_days_overdue <= p_max_days_overdue)
)
SELECT
COUNT(*)::int,
COUNT(CASE WHEN customer_status = 'Active' THEN 1 END)::int,
COALESCE(SUM(balance), 0),
COUNT(CASE WHEN balance > 0 THEN 1 END)::int,
COALESCE(SUM(inv_count), 0),
COUNT(CASE WHEN is_overdue THEN 1 END)::int
INTO
v_total_customers,
v_active_customers,
v_total_balance,
v_customers_with_debt,
v_total_open_invoices,
v_customers_with_overdue
FROM filtered;

RETURN json_build_object(
'total_customers', v_total_customers,
'active_customers', v_active_customers,
'total_balance', v_total_balance,
'avg_balance', CASE WHEN v_customers_with_debt > 0 THEN v_total_balance / v_customers_with_debt ELSE 0 END,
'customers_with_debt', v_customers_with_debt,
'total_open_invoices', v_total_open_invoices,
'customers_with_overdue', v_customers_with_overdue
);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_cached_customer_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
v_result jsonb;
BEGIN
WITH customer_balances AS (
SELECT
i.customer,
COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0)
- COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) AS net_balance,
COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) AS inv_count,
MAX(
CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT)
ELSE 0
END
) AS max_overdue
FROM acumatica_invoices i
WHERE i.balance > 0
AND i.status IN ('Open', 'Balanced')
GROUP BY i.customer
),
all_stats AS (
SELECT
c.is_test_customer,
COUNT(*)::integer AS total_customers,
COUNT(*) FILTER (WHERE c.is_active)::integer AS active_customers,
COUNT(*) FILTER (WHERE COALESCE(cb.net_balance, 0) > 0)::integer AS with_debt,
COALESCE(SUM(GREATEST(cb.net_balance, 0)), 0) AS total_bal,
COALESCE(SUM(cb.inv_count), 0)::integer AS total_inv,
COUNT(*) FILTER (WHERE COALESCE(cb.max_overdue, 0) > 0)::integer AS with_overdue
FROM acumatica_customers c
LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
GROUP BY c.is_test_customer
),
combined AS (
SELECT
COALESCE(SUM(total_customers), 0)::integer AS total_customers,
COALESCE(SUM(active_customers), 0)::integer AS active_customers,
COALESCE(SUM(with_debt), 0)::integer AS customers_with_debt,
COALESCE(SUM(total_bal), 0) AS total_balance,
COALESCE(SUM(total_inv), 0)::integer AS total_open_invoices,
COALESCE(SUM(with_overdue), 0)::integer AS customers_with_overdue,
COALESCE((SELECT total_customers FROM all_stats WHERE is_test_customer = false), 0)::integer AS total_excl_test,
COALESCE((SELECT active_customers FROM all_stats WHERE is_test_customer = false), 0)::integer AS active_excl_test,
COALESCE((SELECT with_debt FROM all_stats WHERE is_test_customer = false), 0)::integer AS debt_excl_test,
COALESCE((SELECT total_bal FROM all_stats WHERE is_test_customer = false), 0) AS bal_excl_test,
COALESCE((SELECT total_inv FROM all_stats WHERE is_test_customer = false), 0)::integer AS inv_excl_test,
COALESCE((SELECT with_overdue FROM all_stats WHERE is_test_customer = false), 0)::integer AS overdue_excl_test
FROM all_stats
)
UPDATE cached_customer_stats SET
total_customers = c.total_customers,
active_customers = c.active_customers,
customers_with_debt = c.customers_with_debt,
total_balance = c.total_balance,
avg_balance = CASE WHEN c.customers_with_debt > 0 THEN c.total_balance / c.customers_with_debt ELSE 0 END,
total_open_invoices = c.total_open_invoices,
customers_with_overdue = c.customers_with_overdue,
total_customers_excl_test = c.total_excl_test,
active_customers_excl_test = c.active_excl_test,
customers_with_debt_excl_test = c.debt_excl_test,
total_balance_excl_test = c.bal_excl_test,
avg_balance_excl_test = CASE WHEN c.debt_excl_test > 0 THEN c.bal_excl_test / c.debt_excl_test ELSE 0 END,
total_open_invoices_excl_test = c.inv_excl_test,
customers_with_overdue_excl_test = c.overdue_excl_test,
calculated_at = now(),
updated_at = now()
FROM combined c
WHERE cached_customer_stats.id = 1;

SELECT jsonb_build_object(
'success', true,
'calculated_at', now()
) INTO v_result;

RETURN v_result;
END;
$function$;


-- Repopulate the stats cache so the dashboard reflects the new basis.
SELECT refresh_cached_customer_stats();
