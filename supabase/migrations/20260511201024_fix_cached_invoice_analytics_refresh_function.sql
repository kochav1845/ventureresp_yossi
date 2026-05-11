/*
  # Fix Cached Invoice Analytics Refresh Function

  Simplifies the refresh function to avoid complex LATERAL joins.
  Uses straightforward aggregation with simple per-type/per-status breakdowns.
  Also creates a simpler function for fetching invoices for the daily detail view.

  1. Modified Functions
    - `refresh_cached_invoice_analytics` - simplified aggregation logic
    - `get_invoices_for_date_range` - returns individual invoice rows for a date range
*/

CREATE OR REPLACE FUNCTION refresh_cached_invoice_analytics(
  p_period_type text DEFAULT 'monthly',
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_rows_affected integer := 0;
  v_target_year integer;
  v_start_date date;
  v_end_date date;
BEGIN
  v_target_year := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);

  IF p_period_type = 'daily' THEN
    v_start_date := make_date(v_target_year, COALESCE(p_month, EXTRACT(MONTH FROM now())::integer), 1);
    v_end_date := (v_start_date + interval '1 month')::date;

    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'daily',
      EXTRACT(YEAR FROM i.date::date)::integer,
      EXTRACT(MONTH FROM i.date::date)::integer,
      EXTRACT(DAY FROM i.date::date)::integer,
      i.date::date,
      COALESCE(SUM(i.amount), 0),
      COALESCE(SUM(i.balance), 0),
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      (SELECT jsonb_object_agg(t.type, jsonb_build_object('count', t.cnt, 'amount', t.amt))
       FROM (SELECT i2.type, COUNT(*) AS cnt, SUM(i2.amount) AS amt
             FROM acumatica_invoices i2
             WHERE i2.date::date = i.date::date AND i2.status != 'On Hold'
             GROUP BY i2.type) t),
      (SELECT jsonb_object_agg(s.status, jsonb_build_object('count', s.cnt, 'amount', s.amt))
       FROM (SELECT i3.status, COUNT(*) AS cnt, SUM(i3.amount) AS amt
             FROM acumatica_invoices i3
             WHERE i3.date::date = i.date::date AND i3.status != 'On Hold'
             GROUP BY i3.status) s),
      now(),
      now()
    FROM acumatica_invoices i
    WHERE i.date::date >= v_start_date
      AND i.date::date < v_end_date
      AND i.status != 'On Hold'
    GROUP BY i.date::date
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      unique_customer_count = EXCLUDED.unique_customer_count,
      invoice_only_amount = EXCLUDED.invoice_only_amount,
      invoice_only_count = EXCLUDED.invoice_only_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  ELSIF p_period_type = 'monthly' THEN
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'monthly',
      v_target_year,
      EXTRACT(MONTH FROM i.date::date)::integer,
      NULL::integer,
      NULL::date,
      COALESCE(SUM(i.amount), 0),
      COALESCE(SUM(i.balance), 0),
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      '{}',
      '{}',
      now(),
      now()
    FROM acumatica_invoices i
    WHERE EXTRACT(YEAR FROM i.date::date) = v_target_year
      AND i.status != 'On Hold'
    GROUP BY EXTRACT(MONTH FROM i.date::date)
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      unique_customer_count = EXCLUDED.unique_customer_count,
      invoice_only_amount = EXCLUDED.invoice_only_amount,
      invoice_only_count = EXCLUDED.invoice_only_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Fill in missing months with zeros
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      calculated_at, updated_at
    )
    SELECT
      'monthly', v_target_year, m.month_num, NULL, NULL,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now(), now()
    FROM generate_series(1, 12) AS m(month_num)
    WHERE NOT EXISTS (
      SELECT 1 FROM cached_invoice_analytics c
      WHERE c.period_type = 'monthly' AND c.year = v_target_year AND c.month = m.month_num
    )
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO NOTHING;

  ELSIF p_period_type = 'yearly' THEN
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      calculated_at, updated_at
    )
    SELECT
      'yearly',
      EXTRACT(YEAR FROM i.date::date)::integer,
      NULL::integer,
      NULL::integer,
      NULL::date,
      COALESCE(SUM(i.amount), 0),
      COALESCE(SUM(i.balance), 0),
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      now(),
      now()
    FROM acumatica_invoices i
    WHERE i.status != 'On Hold'
    GROUP BY EXTRACT(YEAR FROM i.date::date)
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      total_balance = EXCLUDED.total_balance,
      total_open_balance = EXCLUDED.total_open_balance,
      invoice_count = EXCLUDED.invoice_count,
      unique_customer_count = EXCLUDED.unique_customer_count,
      invoice_only_amount = EXCLUDED.invoice_only_amount,
      invoice_only_count = EXCLUDED.invoice_only_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'period_type', p_period_type,
    'year', v_target_year,
    'month', p_month,
    'rows_affected', v_rows_affected
  );

  RETURN v_result;
END;
$$;

-- Function to get invoices for a date range (for the detail table)
CREATE OR REPLACE FUNCTION get_invoices_for_date_range(
  p_start_date date,
  p_end_date date,
  p_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  reference_number text,
  type text,
  status text,
  date text,
  due_date text,
  amount numeric,
  balance numeric,
  customer text,
  customer_name text,
  description text,
  color_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    i.id,
    i.reference_number,
    i.type,
    i.status,
    i.date,
    i.due_date,
    i.amount,
    i.balance,
    i.customer,
    i.customer_name,
    i.description,
    i.color_status
  FROM acumatica_invoices i
  WHERE i.date::date >= p_start_date
    AND i.date::date < p_end_date
    AND i.status != 'On Hold'
    AND (p_type IS NULL OR i.type = p_type)
  ORDER BY i.date DESC, i.reference_number DESC;
$$;
