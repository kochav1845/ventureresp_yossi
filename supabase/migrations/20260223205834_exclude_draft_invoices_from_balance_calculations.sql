/*
  # Exclude Draft/Unposted Invoices from Balance Calculations

  1. Problem
    - Invoices with status 'Balanced', 'On Hold', or 'Scheduled' are drafts in Acumatica
    - Acumatica does NOT include these in the customer balance
    - Our app was including them because it only checked `balance > 0` without filtering by status
    - This caused customer balances to be inflated (e.g., $1,180.18 in app vs $966.18 in Acumatica)

  2. Affected Functions
    - `get_customer_invoices_advanced` - invoice list for customer detail page
    - `get_customer_invoices_advanced_count` - invoice totals for customer detail page
    - `get_customer_invoice_stats` - invoice stats (oldest unpaid, most overdue, etc.)
    - `get_customers_with_balance` - customers list with calculated balances
    - `get_customers_with_balance_count` - customer count for pagination

  3. Fix Applied
    - Added `AND i.status = 'Open'` wherever `balance > 0` is used to identify unpaid invoices
    - Only released/posted invoices (status = 'Open') are now included in balance calculations
    - Draft statuses excluded: 'Balanced', 'On Hold', 'Scheduled', and any other non-Open status
*/

-- Fix 1: get_customer_invoices_advanced
CREATE OR REPLACE FUNCTION get_customer_invoices_advanced(
  p_customer_id TEXT,
  p_filter TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_amount_min NUMERIC DEFAULT NULL,
  p_amount_max NUMERIC DEFAULT NULL,
  p_color_status TEXT DEFAULT NULL,
  p_invoice_status TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'date',
  p_sort_order TEXT DEFAULT 'desc',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  reference_number TEXT,
  date DATE,
  due_date DATE,
  status TEXT,
  amount NUMERIC,
  balance NUMERIC,
  description TEXT,
  color_status TEXT,
  days_overdue INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.reference_number,
    i.date,
    i.due_date,
    i.status,
    i.amount,
    i.balance,
    i.description,
    i.color_status,
    CASE 
      WHEN i.due_date IS NOT NULL AND i.balance > 0 
      THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
      ELSE 0
    END AS days_overdue
  FROM acumatica_invoices i
  WHERE
    i.customer = p_customer_id
    AND (
      p_filter = 'all' OR
      (p_filter = 'open' AND i.balance > 0 AND i.status = 'Open') OR
      (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided')
    )
    AND (p_date_from IS NULL OR i.date >= p_date_from)
    AND (p_date_to IS NULL OR i.date <= p_date_to)
    AND (p_amount_min IS NULL OR i.amount >= p_amount_min)
    AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
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
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Fix 2: get_customer_invoices_advanced_count
CREATE OR REPLACE FUNCTION get_customer_invoices_advanced_count(
  p_customer_id TEXT,
  p_filter TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_amount_min NUMERIC DEFAULT NULL,
  p_amount_max NUMERIC DEFAULT NULL,
  p_color_status TEXT DEFAULT NULL,
  p_invoice_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  total_amount NUMERIC,
  total_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_count,
    COALESCE(SUM(i.amount), 0)::NUMERIC AS total_amount,
    COALESCE(SUM(i.balance), 0)::NUMERIC AS total_balance
  FROM acumatica_invoices i
  WHERE
    i.customer = p_customer_id
    AND (
      p_filter = 'all' OR
      (p_filter = 'open' AND i.balance > 0 AND i.status = 'Open') OR
      (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided')
    )
    AND (p_date_from IS NULL OR i.date >= p_date_from)
    AND (p_date_to IS NULL OR i.date <= p_date_to)
    AND (p_amount_min IS NULL OR i.amount >= p_amount_min)
    AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
    AND (p_color_status IS NULL OR p_color_status = '' OR i.color_status = p_color_status)
    AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status);
END;
$$;

-- Fix 3: get_customer_invoice_stats
CREATE OR REPLACE FUNCTION get_customer_invoice_stats(
  p_customer_id TEXT
)
RETURNS TABLE (
  highest_invoice_amount NUMERIC,
  highest_invoice_ref TEXT,
  lowest_invoice_amount NUMERIC,
  lowest_invoice_ref TEXT,
  avg_invoice_amount NUMERIC,
  oldest_unpaid_date DATE,
  oldest_unpaid_ref TEXT,
  newest_unpaid_date DATE,
  newest_unpaid_ref TEXT,
  most_overdue_days INT,
  most_overdue_ref TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH invoice_data AS (
    SELECT 
      i.reference_number,
      i.amount,
      i.date,
      i.due_date,
      i.balance,
      i.status,
      CASE 
        WHEN i.due_date IS NOT NULL AND i.balance > 0 
        THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
        ELSE 0
      END AS overdue_days
    FROM acumatica_invoices i
    WHERE i.customer = p_customer_id
  ),
  highest AS (
    SELECT reference_number, amount FROM invoice_data ORDER BY amount DESC NULLS LAST LIMIT 1
  ),
  lowest AS (
    SELECT reference_number, amount FROM invoice_data WHERE amount > 0 ORDER BY amount ASC NULLS LAST LIMIT 1
  ),
  oldest_unpaid AS (
    SELECT reference_number, date FROM invoice_data WHERE balance > 0 AND status = 'Open' ORDER BY date ASC NULLS LAST LIMIT 1
  ),
  newest_unpaid AS (
    SELECT reference_number, date FROM invoice_data WHERE balance > 0 AND status = 'Open' ORDER BY date DESC NULLS LAST LIMIT 1
  ),
  most_overdue AS (
    SELECT reference_number, overdue_days FROM invoice_data WHERE balance > 0 AND status = 'Open' ORDER BY overdue_days DESC NULLS LAST LIMIT 1
  )
  SELECT
    (SELECT amount FROM highest) AS highest_invoice_amount,
    (SELECT reference_number FROM highest) AS highest_invoice_ref,
    (SELECT amount FROM lowest) AS lowest_invoice_amount,
    (SELECT reference_number FROM lowest) AS lowest_invoice_ref,
    (SELECT AVG(amount)::NUMERIC FROM invoice_data) AS avg_invoice_amount,
    (SELECT date FROM oldest_unpaid) AS oldest_unpaid_date,
    (SELECT reference_number FROM oldest_unpaid) AS oldest_unpaid_ref,
    (SELECT date FROM newest_unpaid) AS newest_unpaid_date,
    (SELECT reference_number FROM newest_unpaid) AS newest_unpaid_ref,
    (SELECT overdue_days FROM most_overdue) AS most_overdue_days,
    (SELECT reference_number FROM most_overdue) AS most_overdue_ref;
END;
$$;

-- Fix 4: get_customers_with_balance (latest version with days_overdue params)
DROP FUNCTION IF EXISTS get_customers_with_balance(text,text,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,boolean,text,boolean,integer,integer);

CREATE OR REPLACE FUNCTION get_customers_with_balance(
  p_search TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT 'all',
  p_country_filter TEXT DEFAULT 'all',
  p_sort_by TEXT DEFAULT 'customer_name',
  p_sort_order TEXT DEFAULT 'asc',
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_balance_filter TEXT DEFAULT 'all',
  p_min_balance NUMERIC DEFAULT NULL,
  p_max_balance NUMERIC DEFAULT NULL,
  p_min_open_invoices INT DEFAULT NULL,
  p_max_open_invoices INT DEFAULT NULL,
  p_min_invoice_amount NUMERIC DEFAULT NULL,
  p_max_invoice_amount NUMERIC DEFAULT NULL,
  p_exclude_credit_memos BOOLEAN DEFAULT FALSE,
  p_date_context TEXT DEFAULT 'invoice_date',
  p_calculate_avg_days BOOLEAN DEFAULT TRUE,
  p_min_days_overdue INT DEFAULT NULL,
  p_max_days_overdue INT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  customer_id TEXT,
  customer_name TEXT,
  customer_status TEXT,
  email_address TEXT,
  phone1 TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  customer_class TEXT,
  terms TEXT,
  credit_limit NUMERIC,
  statement_cycle TEXT,
  parent_account TEXT,
  price_class TEXT,
  shipping_terms TEXT,
  acumatica_record_id TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  red_threshold_days INT,
  color_status TEXT,
  calculated_balance NUMERIC,
  gross_balance NUMERIC,
  credit_memo_balance NUMERIC,
  open_invoice_count BIGINT,
  red_count BIGINT,
  yellow_count BIGINT,
  green_count BIGINT,
  max_days_overdue INT,
  exclude_from_payment_analytics BOOLEAN,
  exclude_from_customer_analytics BOOLEAN,
  avg_days_to_collect NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH customer_balances AS (
    SELECT
      i.customer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
      COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as credit_memo_amt,
      COALESCE(
        SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END) -
        SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END),
        0
      ) as net_balance_amt,
      COUNT(*) FILTER (WHERE i.type = 'Invoice') as invoice_count,
      COUNT(*) FILTER (WHERE i.color_status = 'red' AND i.type = 'Invoice') as red_cnt,
      COUNT(*) FILTER (WHERE i.color_status IN ('yellow', 'orange') AND i.type = 'Invoice') as yellow_cnt,
      COUNT(*) FILTER (WHERE i.color_status = 'green' AND i.type = 'Invoice') as green_cnt,
      MAX(
        CASE
          WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type = 'Invoice'
          THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
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
      ) as passes_date_filter
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status = 'Open'
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    GROUP BY i.customer
  ),
  customer_avg_collection_days AS (
    SELECT
      p.customer_id,
      AVG(
        EXTRACT(EPOCH FROM (p.application_date::timestamp - i.date::timestamp)) / 86400
      )::numeric(10,1) as avg_days
    FROM payment_invoice_applications pia
    INNER JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number
    INNER JOIN acumatica_payments p ON p.reference_number = pia.payment_reference_number
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
      c.id,
      c.customer_id,
      c.customer_name,
      c.customer_status,
      c.email_address,
      c.city,
      c.billing_state,
      c.country,
      c.customer_class,
      c.terms,
      c.credit_limit,
      c.statement_cycle_id,
      c.parent_account,
      c.price_class_id,
      c.shipping_terms,
      c.note_id,
      c.synced_at,
      c.created_at,
      c.updated_at,
      c.days_from_invoice_threshold,
      c.customer_color_status,
      c.exclude_from_payment_analytics,
      c.exclude_from_customer_analytics,
      cb.gross_balance_amt,
      cb.credit_memo_amt,
      cb.net_balance_amt,
      cb.invoice_count,
      cb.red_cnt,
      cb.yellow_cnt,
      cb.green_cnt,
      cb.max_overdue_days,
      cacd.avg_days
    FROM acumatica_customers c
    LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
    LEFT JOIN customer_avg_collection_days cacd ON c.customer_id = cacd.customer_id
    WHERE
      (p_search IS NULL OR p_search = '' OR
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
      AND (p_max_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) <= p_max_days_overdue)
      AND (
        (p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL)
        OR cb.invoice_count > 0
      )
    ORDER BY
      CASE
        WHEN p_sort_by = 'customer_name' AND p_sort_order = 'asc' THEN c.customer_name
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'customer_name' AND p_sort_order = 'desc' THEN c.customer_name
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN 
          CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN 
          CASE WHEN p_exclude_credit_memos THEN COALESCE(cb.gross_balance_amt, 0) ELSE COALESCE(cb.net_balance_amt, 0) END
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'desc' THEN COALESCE(cb.invoice_count, 0)
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by IN ('open_invoices', 'invoice_count') AND p_sort_order = 'asc' THEN COALESCE(cb.invoice_count, 0)
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'desc' THEN COALESCE(cb.max_overdue_days, 0)
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'max_days_overdue' AND p_sort_order = 'asc' THEN COALESCE(cb.max_overdue_days, 0)
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'desc' THEN c.days_from_invoice_threshold
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'red_threshold_days' AND p_sort_order = 'asc' THEN c.days_from_invoice_threshold
      END ASC NULLS LAST,
      CASE
        WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'desc' THEN cacd.avg_days
      END DESC NULLS LAST,
      CASE
        WHEN p_sort_by = 'avg_days_to_collect' AND p_sort_order = 'asc' THEN cacd.avg_days
      END ASC NULLS LAST,
      c.customer_name ASC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    fc.id,
    fc.customer_id,
    fc.customer_name,
    fc.customer_status,
    fc.email_address,
    NULL::text as phone1,
    NULL::text as address_line1,
    NULL::text as address_line2,
    fc.city,
    fc.billing_state as state,
    NULL::text as postal_code,
    fc.country,
    fc.customer_class,
    fc.terms,
    fc.credit_limit,
    fc.statement_cycle_id as statement_cycle,
    fc.parent_account,
    fc.price_class_id as price_class,
    fc.shipping_terms,
    fc.note_id as acumatica_record_id,
    fc.synced_at,
    fc.created_at,
    fc.updated_at,
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
    fc.avg_days as avg_days_to_collect
  FROM filtered_customers fc;
END;
$$;

-- Fix 5: get_customers_with_balance_count
DROP FUNCTION IF EXISTS get_customers_with_balance_count(text,text,text,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,boolean,text,integer,integer);

CREATE OR REPLACE FUNCTION get_customers_with_balance_count(
  p_search TEXT DEFAULT NULL,
  p_status_filter TEXT DEFAULT NULL,
  p_country_filter TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_balance_filter TEXT DEFAULT 'all',
  p_min_balance NUMERIC DEFAULT NULL,
  p_max_balance NUMERIC DEFAULT NULL,
  p_min_open_invoices INT DEFAULT NULL,
  p_max_open_invoices INT DEFAULT NULL,
  p_min_invoice_amount NUMERIC DEFAULT NULL,
  p_max_invoice_amount NUMERIC DEFAULT NULL,
  p_exclude_credit_memos BOOLEAN DEFAULT FALSE,
  p_date_context TEXT DEFAULT 'invoice_date',
  p_min_days_overdue INT DEFAULT NULL,
  p_max_days_overdue INT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_count BIGINT;
BEGIN
  WITH customer_balances AS (
    SELECT
      i.customer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END), 0) as gross_balance_amt,
      COALESCE(SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END), 0) as credit_memo_amt,
      COALESCE(
        SUM(CASE WHEN i.type = 'Invoice' THEN i.balance ELSE 0 END) -
        SUM(CASE WHEN i.type IN ('Credit Memo', 'Credit WO') THEN i.balance ELSE 0 END),
        0
      ) as net_balance_amt,
      COUNT(*) FILTER (WHERE i.type = 'Invoice') as invoice_count,
      MAX(
        CASE
          WHEN i.date IS NOT NULL AND i.balance > 0 AND i.type = 'Invoice'
          THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
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
      ) as passes_date_filter
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status = 'Open'
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    GROUP BY i.customer
  )
  SELECT COUNT(*) INTO result_count
  FROM acumatica_customers c
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  WHERE
    (p_search IS NULL OR p_search = '' OR
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
    AND (p_max_days_overdue IS NULL OR COALESCE(cb.max_overdue_days, 0) <= p_max_days_overdue)
    AND (
      (p_min_invoice_amount IS NULL AND p_max_invoice_amount IS NULL)
      OR cb.invoice_count > 0
    );

  RETURN result_count;
END;
$$;
