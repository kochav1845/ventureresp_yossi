/*
  # Customer list RPCs: no more 8-second timeouts

  get_customer_analytics, get_customers_with_balance and
  get_customers_with_balance_count returned 500 "canceling statement due to
  statement timeout" (2026-10-13 14:10, 14:16, 20:13 UTC) on the Customers page.

  Main cause: PL/pgSQL caches the plan of each query in a function per database
  connection. After 5 calls it switches to a *generic* plan if that looks no more
  expensive -- but these queries are written as
    (p_x IS NULL OR col = p_x) AND ... CASE WHEN p_flag ... END
  and only a plan made for the actual values can drop the branches that do not
  apply. PostgREST reuses its pooled connections, so from the 6th call on a
  connection the generic plan was used. Measured on prod as an org admin:
    get_customer_analytics, Customers page defaults:
      calls 1-5: 1.7-2.5 s     calls 6-7: 14.1 s, 20.0 s   (> the 8 s timeout)
  With plan_cache_mode = force_custom_plan every call is planned for its own
  arguments (a few ms of planning): 1.4-2.2 s on every call. The two balance RPCs
  have the same parameter pattern, so they get the same setting.

  Also: get_customer_analytics joined EVERY invoice of every customer
  (paid/closed too) into the aggregate, although each aggregate only counts
  status = 'Open' rows. The join now takes only Open invoices -- identical
  output (compared old vs new on 9 filter combinations on prod: all equal), far
  fewer rows read on a cache-starved instance.
*/

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
-- Every aggregate below only counts status = 'Open' rows, so join only those:
-- identical results, but it no longer drags every closed invoice of every
-- customer through the aggregate.
AND i.status = 'Open'
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

-- Plan every call for its own arguments (see header).
ALTER FUNCTION public.get_customer_analytics(text,text,text,timestamp with time zone,timestamp with time zone,text[],text,numeric,numeric,integer,integer,text,integer,integer,boolean,boolean)
  SET plan_cache_mode = force_custom_plan;

ALTER FUNCTION public.get_customers_with_balance(text,text,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,boolean,text,boolean,integer,integer,boolean,text)
  SET plan_cache_mode = force_custom_plan;

ALTER FUNCTION public.get_customers_with_balance_count(text,text,text,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,boolean,text,integer,integer,boolean)
  SET plan_cache_mode = force_custom_plan;
