/*
  # Days-overdue basis: due date vs invoice date

  "Days overdue" was always measured from the INVOICE date (i.date), so an
  invoice with 30-day terms read as 592 days overdue when it was really 562
  days past due. Make the basis selectable:

    - 'due_date'     -> CURRENT_DATE - COALESCE(i.due_date, i.date)  (true days past due, default)
    - 'invoice_date' -> CURRENT_DATE - i.date                        (legacy behaviour)

  The basis drives the Overdue column, sorting, AND the Min/Max Days Overdue
  filter together, so the list and the filter always agree.

  cached_customer_balances (the fast unfiltered path) gains max_days_overdue_due
  so the toggle works there too without forcing the RPC.

  Colour thresholds (days_from_invoice_threshold) are intentionally
  invoice-date based by design and are NOT touched here.
*/

-- 1. Cache gains the due-date variant ---------------------------------------
ALTER TABLE cached_customer_balances
  ADD COLUMN IF NOT EXISTS max_days_overdue_due integer DEFAULT 0;

-- 2. Refresh function populates both bases -----------------------------------
CREATE OR REPLACE FUNCTION public.refresh_cached_customer_balances()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
TRUNCATE cached_customer_balances;

INSERT INTO cached_customer_balances (
customer_id, customer_name, email_address, is_active, responded_this_month,
postpone_until, postpone_reason, created_at, updated_at, red_threshold_days,
color_status, calculated_balance, calculated_balance_excl_cm, gross_balance,
credit_memo_balance, open_invoice_count, red_count, yellow_count, green_count,
max_days_overdue, max_days_overdue_due, exclude_from_payment_analytics, exclude_from_customer_analytics,
is_test_customer, cached_at, organization_id
)
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
CASE WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
ELSE 0
END
) as max_overdue,
MAX(
CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT)
ELSE 0
END
) as max_overdue_due
FROM acumatica_invoices i
WHERE i.balance > 0
AND i.status IN ('Open', 'Balanced')
GROUP BY i.customer
)
SELECT
c.customer_id,
c.customer_name,
c.email_address,
COALESCE(c.is_active, true),
COALESCE(c.responded_this_month, false),
c.postpone_until,
c.postpone_reason,
c.created_at,
c.updated_at,
c.days_from_invoice_threshold,
c.customer_color_status,
COALESCE(cb.gross_bal, 0) - COALESCE(cb.cm_bal, 0),
COALESCE(cb.gross_bal, 0),
COALESCE(cb.gross_bal, 0),
COALESCE(cb.cm_bal, 0),
COALESCE(cb.inv_count, 0)::bigint,
COALESCE(cb.red_cnt, 0)::bigint,
COALESCE(cb.yellow_cnt, 0)::bigint,
COALESCE(cb.green_cnt, 0)::bigint,
COALESCE(cb.max_overdue, 0)::int,
COALESCE(cb.max_overdue_due, 0)::int,
COALESCE(c.exclude_from_payment_analytics, false),
COALESCE(c.exclude_from_customer_analytics, false),
COALESCE(c.is_test_customer, false),
now(),
c.organization_id
FROM acumatica_customers c
LEFT JOIN customer_balances cb ON c.customer_id = cb.customer;
END;
$function$;

-- 3. get_customers_with_balance gains p_overdue_basis -------------------------
DROP FUNCTION IF EXISTS get_customers_with_balance(text, text, text, text, text, integer, integer, timestamptz, timestamptz, text, numeric, numeric, integer, integer, numeric, numeric, boolean, text, boolean, integer, integer, boolean);

CREATE OR REPLACE FUNCTION get_customers_with_balance(
  p_search text,
  p_status_filter text,
  p_country_filter text,
  p_sort_by text,
  p_sort_order text,
  p_limit integer,
  p_offset integer,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_balance_filter text,
  p_min_balance numeric,
  p_max_balance numeric,
  p_min_open_invoices integer,
  p_max_open_invoices integer,
  p_min_invoice_amount numeric,
  p_max_invoice_amount numeric,
  p_exclude_credit_memos boolean,
  p_date_context text,
  p_calculate_avg_days boolean,
  p_min_days_overdue integer,
  p_max_days_overdue integer,
  p_test_customers boolean,
  p_overdue_basis text DEFAULT 'due_date'
)
RETURNS TABLE(
  id uuid, customer_id text, customer_name text, customer_status text,
  email_address text, phone1 text, address_line1 text, address_line2 text,
  city text, state text, postal_code text, country text,
  customer_class text, terms text, credit_limit numeric,
  statement_cycle text, parent_account text,
  price_class text, shipping_terms text,
  acumatica_record_id text,
  synced_at timestamptz, created_at timestamptz, updated_at timestamptz,
  red_threshold_days integer, color_status text,
  calculated_balance numeric, gross_balance numeric, credit_memo_balance numeric,
  open_invoice_count bigint, red_count bigint, yellow_count bigint, green_count bigint,
  max_days_overdue integer,
  exclude_from_payment_analytics boolean, exclude_from_customer_analytics boolean,
  avg_days_to_collect numeric,
  filtered_gross_balance numeric, filtered_invoice_count bigint, filtered_net_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_filter boolean;
  v_org_id uuid := get_user_org_id();
  v_invoice_basis boolean := (p_overdue_basis = 'invoice_date');
BEGIN

v_has_filter := (
  p_date_from IS NOT NULL OR p_date_to IS NOT NULL
  OR p_min_days_overdue IS NOT NULL OR p_max_days_overdue IS NOT NULL
  OR p_min_invoice_amount IS NOT NULL OR p_max_invoice_amount IS NOT NULL
);

RETURN QUERY
WITH customer_balances AS (
  SELECT
    i.customer,
    COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
    COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as credit_memo_amt,
    COALESCE(
      SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END) -
      SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END),
      0
    ) as net_balance_amt,
    COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')) as invoice_count,
    COUNT(*) FILTER (WHERE i.color_status = 'red' AND i.type IN ('Invoice', 'Debit Memo')) as red_cnt,
    COUNT(*) FILTER (WHERE i.color_status IN ('yellow', 'orange') AND i.type IN ('Invoice', 'Debit Memo')) as yellow_cnt,
    COUNT(*) FILTER (WHERE i.color_status = 'green' AND i.type IN ('Invoice', 'Debit Memo')) as green_cnt,
    MAX(
      CASE
        WHEN i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
          AND (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END) IS NOT NULL
        THEN GREATEST(0, (CURRENT_DATE - (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END))::INT)
        ELSE 0
      END
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
      COALESCE(SUM(
        CASE WHEN i.type IN ('Invoice', 'Debit Memo')
        AND (
          (p_date_from IS NULL AND p_date_to IS NULL)
          OR (p_date_context = 'invoice_date' AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
          OR (p_date_context = 'balance_date' AND i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
        )
        AND (
          (p_min_days_overdue IS NULL AND p_max_days_overdue IS NULL)
          OR (
            (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END) IS NOT NULL
            AND GREATEST(0, (CURRENT_DATE - (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END))::INT) >= COALESCE(p_min_days_overdue, 0)
            AND GREATEST(0, (CURRENT_DATE - (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END))::INT) <= COALESCE(p_max_days_overdue, 999999)
          )
        )
        AND (p_min_invoice_amount IS NULL OR i.amount >= p_min_invoice_amount)
        AND (p_max_invoice_amount IS NULL OR i.amount <= p_max_invoice_amount)
        THEN i.balance ELSE 0 END
      ), 0)
    ELSE
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') THEN i.balance ELSE 0 END), 0)
    END as filtered_gross_bal,

    CASE WHEN v_has_filter THEN
      COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo')
        AND (
          (p_date_from IS NULL AND p_date_to IS NULL)
          OR (p_date_context = 'invoice_date' AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
          OR (p_date_context = 'balance_date' AND i.balance > 0 AND i.date >= COALESCE(p_date_from::date, i.date) AND i.date <= COALESCE(p_date_to::date, i.date))
        )
        AND (
          (p_min_days_overdue IS NULL AND p_max_days_overdue IS NULL)
          OR (
            (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END) IS NOT NULL
            AND GREATEST(0, (CURRENT_DATE - (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END))::INT) >= COALESCE(p_min_days_overdue, 0)
            AND GREATEST(0, (CURRENT_DATE - (CASE WHEN v_invoice_basis THEN i.date ELSE COALESCE(i.due_date, i.date) END))::INT) <= COALESCE(p_max_days_overdue, 999999)
          )
        )
        AND (p_min_invoice_amount IS NULL OR i.amount >= p_min_invoice_amount)
        AND (p_max_invoice_amount IS NULL OR i.amount <= p_max_invoice_amount)
      )
    ELSE
      COUNT(*) FILTER (WHERE i.type IN ('Invoice', 'Debit Memo'))
    END as filtered_inv_count
  FROM acumatica_invoices i
  WHERE i.organization_id = v_org_id
    AND i.balance > 0
    AND i.status IN ('Open', 'Balanced')
  GROUP BY i.customer
),
customer_avg_collection_days AS (
  SELECT
    p.customer_id,
    AVG(
      EXTRACT(EPOCH FROM (p.application_date::timestamp - i.date::timestamp)) / 86400
    )::numeric(10,1) as avg_days
  FROM payment_invoice_applications pia
  INNER JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number AND i.organization_id = v_org_id
  INNER JOIN acumatica_payments p ON p.reference_number = pia.payment_reference_number AND p.organization_id = v_org_id
  WHERE pia.amount_paid > 0
    AND i.type = 'Invoice'
    AND p.type != 'Prepayment'
    AND p.application_date IS NOT NULL
    AND i.date IS NOT NULL
    AND p.application_date >= i.date
    AND (p_calculate_avg_days OR p_sort_by = 'avg_days_to_collect')
  GROUP BY p.customer_id
),
filtered_customers AS (
  SELECT
    c.id, c.customer_id, c.customer_name, c.customer_status,
    c.email_address, c.city, c.billing_state, c.country,
    c.customer_class, c.terms, c.credit_limit, c.statement_cycle_id,
    c.parent_account, c.price_class_id, c.shipping_terms, c.note_id,
    c.synced_at, c.created_at, c.updated_at,
    c.days_from_invoice_threshold, c.customer_color_status,
    c.exclude_from_payment_analytics, c.exclude_from_customer_analytics,
    cb.gross_balance_amt, cb.credit_memo_amt, cb.net_balance_amt,
    cb.invoice_count, cb.red_cnt, cb.yellow_cnt, cb.green_cnt,
    cb.max_overdue_days, cacd.avg_days,
    cb.filtered_gross_bal, cb.filtered_inv_count
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  LEFT JOIN customer_avg_collection_days cacd ON c.customer_id = cacd.customer_id
  WHERE
    c.organization_id = v_org_id
    AND c.is_test_customer = p_test_customers
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
      (p_balance_filter = 'positive' AND
        CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END > 0) OR
      (p_balance_filter = 'negative' AND
        CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END < 0) OR
      (p_balance_filter = 'zero' AND
        CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END = 0)
    )
    AND (p_min_balance IS NULL OR
      CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END >= p_min_balance)
    AND (p_max_balance IS NULL OR
      CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END <= p_max_balance)
    AND (p_min_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) >= p_min_open_invoices)
    AND (p_max_open_invoices IS NULL OR COALESCE(cb.invoice_count, 0) <= p_max_open_invoices)
    AND (p_min_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) >= p_min_days_overdue)
    AND (p_max_days_overdue IS NULL OR COALESCE(cb.filtered_inv_count, 0) > 0)
    AND (
      (p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL)
      OR COALESCE(cb.filtered_inv_count, 0) > 0
    )
  ORDER BY
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_order = 'asc' THEN c.customer_name END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'customer_name' AND p_sort_order = 'desc' THEN c.customer_name END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN
      CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END
    END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN
      CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END
    END ASC NULLS LAST,
    CASE WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'desc' THEN COALESCE(cb.invoice_count, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'asc' THEN COALESCE(cb.invoice_count, 0) END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'desc' THEN COALESCE(cb.max_overdue_days, 0) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'asc' THEN COALESCE(cb.max_overdue_days, 0) END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'desc' THEN c.days_from_invoice_threshold END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'asc' THEN c.days_from_invoice_threshold END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'desc' THEN cacd.avg_days END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'asc' THEN cacd.avg_days END ASC NULLS LAST,
    c.customer_name ASC
  LIMIT p_limit
  OFFSET p_offset
)
SELECT
  fc.id, fc.customer_id, fc.customer_name, fc.customer_status,
  fc.email_address,
  NULL::text as phone1, NULL::text as address_line1, NULL::text as address_line2,
  fc.city, fc.billing_state as state, NULL::text as postal_code, fc.country,
  fc.customer_class, fc.terms, fc.credit_limit,
  fc.statement_cycle_id as statement_cycle, fc.parent_account,
  fc.price_class_id as price_class, fc.shipping_terms,
  fc.note_id as acumatica_record_id,
  fc.synced_at, fc.created_at, fc.updated_at,
  fc.days_from_invoice_threshold as red_threshold_days,
  fc.customer_color_status as color_status,
  CASE
    WHEN p_exclude_credit_memos THEN COALESCE(fc.gross_balance_amt, 0)
    ELSE COALESCE(fc.net_balance_amt, 0)
  END::numeric as calculated_balance,
  COALESCE(fc.gross_balance_amt, 0)::numeric as gross_balance,
  COALESCE(fc.credit_memo_amt, 0)::numeric as credit_memo_balance,
  COALESCE(fc.invoice_count, 0)::bigint as open_invoice_count,
  COALESCE(fc.red_cnt, 0)::bigint as red_count,
  COALESCE(fc.yellow_cnt, 0)::bigint as yellow_count,
  COALESCE(fc.green_cnt, 0)::bigint as green_count,
  COALESCE(fc.max_overdue_days, 0)::int as max_days_overdue,
  COALESCE(fc.exclude_from_payment_analytics, false) as exclude_from_payment_analytics,
  COALESCE(fc.exclude_from_customer_analytics, false) as exclude_from_customer_analytics,
  fc.avg_days as avg_days_to_collect,
  COALESCE(fc.filtered_gross_bal, 0)::numeric as filtered_gross_balance,
  COALESCE(fc.filtered_inv_count, 0)::bigint as filtered_invoice_count,
  (COALESCE(fc.filtered_gross_bal, 0) - COALESCE(fc.credit_memo_amt, 0))::numeric as filtered_net_balance
FROM filtered_customers fc;
END;
$$;

-- 4. Repopulate the cache so max_days_overdue_due is filled immediately -------
SELECT refresh_cached_customer_balances();
