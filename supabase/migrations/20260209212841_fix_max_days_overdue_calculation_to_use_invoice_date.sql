/*
  # Fix Max Days Overdue Calculation to Use Invoice Date
  
  1. Issue
    - Days overdue is currently calculated from `due_date` 
    - Should be calculated from invoice `date` (invoice creation date)
    
  2. Changes
    - Update `get_customers_with_balance` function to calculate max_overdue_days from invoice date
    - Change line: WHEN i.due_date IS NOT NULL ... THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
    - To: WHEN i.date IS NOT NULL ... THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
    
  3. Impact
    - Customer list will now show days since invoice was created, not days past due date
    - This matches the requested business logic
*/

DROP FUNCTION IF EXISTS get_customers_with_balance(text,text,text,text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,numeric,numeric,integer,integer,numeric,numeric,boolean,text,boolean);

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
  p_calculate_avg_days BOOLEAN DEFAULT TRUE
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
      AND (p_min_invoice_amount IS NULL OR i.balance >= p_min_invoice_amount)
      AND (p_max_invoice_amount IS NULL OR i.balance <= p_max_invoice_amount)
    GROUP BY i.customer
  ),
  -- Pre-compute avg days for all customers (only if needed for sorting or explicitly requested)
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

COMMENT ON FUNCTION get_customers_with_balance IS 
  'Returns customers with outstanding balances. Days overdue calculated from invoice date (not due date).';
