/*
  # Optimize refresh_cached_invoice_analytics to prevent timeout

  1. Problem
    - The 'daily' path uses correlated subqueries for type_amounts and status_breakdown
    - Each subquery re-scans acumatica_invoices per date group (104K+ rows)
    - This causes the function to exceed the 2-minute statement timeout

  2. Fix
    - Replace correlated subqueries with a CTE-based approach
    - Pre-compute type_amounts and status_breakdown per date in separate CTEs
    - Join them to the main aggregation query
    - Add a covering index for the analytics aggregation pattern

  3. Impact
    - Daily, monthly, and yearly refresh should complete well within timeout
    - No schema changes to cached_invoice_analytics table
*/

CREATE INDEX IF NOT EXISTS idx_invoices_analytics_covering
  ON acumatica_invoices (date, type, status, amount, balance, customer)
  WHERE status != 'On Hold';

DROP FUNCTION IF EXISTS refresh_cached_invoice_analytics(text, integer, integer);

CREATE FUNCTION refresh_cached_invoice_analytics(
  p_period_type text,
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

    WITH base AS (
      SELECT
        i.date::date AS inv_date,
        i.type,
        i.status,
        i.amount,
        i.balance,
        i.customer
      FROM acumatica_invoices i
      WHERE i.date::date >= v_start_date
        AND i.date::date < v_end_date
        AND i.status != 'On Hold'
    ),
    main_agg AS (
      SELECT
        inv_date,
        COALESCE(SUM(amount), 0) AS total_amount,
        COALESCE(SUM(balance), 0) AS total_balance,
        COALESCE(SUM(CASE WHEN status = 'Open' THEN balance ELSE 0 END), 0) AS total_open_balance,
        COUNT(*)::integer AS invoice_count,
        COUNT(DISTINCT customer)::integer AS unique_customer_count,
        COALESCE(SUM(CASE WHEN type = 'Invoice' THEN amount ELSE 0 END), 0) AS invoice_only_amount,
        COUNT(CASE WHEN type = 'Invoice' THEN 1 END)::integer AS invoice_only_count,
        COALESCE(SUM(CASE WHEN type = 'Credit Memo' THEN amount ELSE 0 END), 0) AS credit_memo_amount,
        COUNT(CASE WHEN type = 'Credit Memo' THEN 1 END)::integer AS credit_memo_count,
        COALESCE(SUM(CASE WHEN type = 'Debit Memo' THEN amount ELSE 0 END), 0) AS debit_memo_amount,
        COUNT(CASE WHEN type = 'Debit Memo' THEN 1 END)::integer AS debit_memo_count,
        COALESCE(SUM(CASE WHEN type = 'Invoice' AND status = 'Open' THEN balance ELSE 0 END), 0) AS open_invoice_balance,
        COUNT(CASE WHEN type = 'Invoice' AND status = 'Open' THEN 1 END)::integer AS open_invoice_count,
        COALESCE(SUM(CASE WHEN type = 'Invoice' AND status = 'Balanced' THEN balance ELSE 0 END), 0) AS balanced_invoice_balance,
        COUNT(CASE WHEN type = 'Invoice' AND status = 'Balanced' THEN 1 END)::integer AS balanced_invoice_count,
        COALESCE(SUM(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced') THEN balance ELSE 0 END), 0) AS open_cm_balance,
        COUNT(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced') THEN 1 END)::integer AS open_cm_count
      FROM base
      GROUP BY inv_date
    ),
    type_agg AS (
      SELECT
        inv_date,
        jsonb_object_agg(type, jsonb_build_object('count', cnt, 'amount', amt)) AS type_amounts
      FROM (
        SELECT inv_date, type, COUNT(*) AS cnt, SUM(amount) AS amt
        FROM base
        GROUP BY inv_date, type
      ) t
      GROUP BY inv_date
    ),
    status_agg AS (
      SELECT
        inv_date,
        jsonb_object_agg(status, jsonb_build_object('count', cnt, 'amount', amt)) AS status_breakdown
      FROM (
        SELECT inv_date, status, COUNT(*) AS cnt, SUM(amount) AS amt
        FROM base
        GROUP BY inv_date, status
      ) s
      GROUP BY inv_date
    )
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'daily',
      EXTRACT(YEAR FROM m.inv_date)::integer,
      EXTRACT(MONTH FROM m.inv_date)::integer,
      EXTRACT(DAY FROM m.inv_date)::integer,
      m.inv_date,
      m.total_amount,
      m.total_balance,
      m.total_open_balance,
      m.invoice_count,
      m.unique_customer_count,
      m.invoice_only_amount,
      m.invoice_only_count,
      m.credit_memo_amount,
      m.credit_memo_count,
      m.debit_memo_amount,
      m.debit_memo_count,
      m.open_invoice_balance,
      m.open_invoice_count,
      m.balanced_invoice_balance,
      m.balanced_invoice_count,
      m.open_cm_balance,
      m.open_cm_count,
      COALESCE(ta.type_amounts, '{}'),
      COALESCE(sa.status_breakdown, '{}'),
      now(),
      now()
    FROM main_agg m
    LEFT JOIN type_agg ta ON ta.inv_date = m.inv_date
    LEFT JOIN status_agg sa ON sa.inv_date = m.inv_date
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
      open_invoice_balance = EXCLUDED.open_invoice_balance,
      open_invoice_count = EXCLUDED.open_invoice_count,
      balanced_invoice_balance = EXCLUDED.balanced_invoice_balance,
      balanced_invoice_count = EXCLUDED.balanced_invoice_count,
      open_cm_balance = EXCLUDED.open_cm_balance,
      open_cm_count = EXCLUDED.open_cm_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  ELSIF p_period_type = 'monthly' THEN
    WITH base AS (
      SELECT
        EXTRACT(MONTH FROM i.date::date)::integer AS month_num,
        i.type,
        i.status,
        i.amount,
        i.balance,
        i.customer
      FROM acumatica_invoices i
      WHERE EXTRACT(YEAR FROM i.date::date) = v_target_year
        AND i.status != 'On Hold'
    )
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      'monthly',
      v_target_year,
      month_num,
      NULL::integer,
      NULL::date,
      COALESCE(SUM(amount), 0),
      COALESCE(SUM(balance), 0),
      COALESCE(SUM(CASE WHEN status = 'Open' THEN balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT customer)::integer,
      COALESCE(SUM(CASE WHEN type = 'Invoice' THEN amount ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Credit Memo' THEN amount ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Debit Memo' THEN amount ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Debit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Invoice' AND status = 'Open' THEN balance ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Invoice' AND status = 'Open' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Invoice' AND status = 'Balanced' THEN balance ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Invoice' AND status = 'Balanced' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced') THEN balance ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced') THEN 1 END)::integer,
      '{}',
      '{}',
      now(),
      now()
    FROM base
    GROUP BY month_num
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
      open_invoice_balance = EXCLUDED.open_invoice_balance,
      open_invoice_count = EXCLUDED.open_invoice_count,
      balanced_invoice_balance = EXCLUDED.balanced_invoice_balance,
      balanced_invoice_count = EXCLUDED.balanced_invoice_count,
      open_cm_balance = EXCLUDED.open_cm_balance,
      open_cm_count = EXCLUDED.open_cm_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      calculated_at, updated_at
    )
    SELECT
      'monthly', v_target_year, m.month_num, NULL, NULL,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now(), now()
    FROM generate_series(1, 12) AS m(month_num)
    WHERE NOT EXISTS (
      SELECT 1 FROM cached_invoice_analytics c
      WHERE c.period_type = 'monthly' AND c.year = v_target_year AND c.month = m.month_num
    )
    ON CONFLICT (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO NOTHING;

  ELSIF p_period_type = 'yearly' THEN
    WITH base AS (
      SELECT
        EXTRACT(YEAR FROM i.date::date)::integer AS inv_year,
        i.type,
        i.status,
        i.amount,
        i.balance,
        i.customer
      FROM acumatica_invoices i
      WHERE i.status != 'On Hold'
    )
    INSERT INTO cached_invoice_analytics (
      period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      calculated_at, updated_at
    )
    SELECT
      'yearly',
      inv_year,
      NULL::integer,
      NULL::integer,
      NULL::date,
      COALESCE(SUM(amount), 0),
      COALESCE(SUM(balance), 0),
      COALESCE(SUM(CASE WHEN status = 'Open' THEN balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT customer)::integer,
      COALESCE(SUM(CASE WHEN type = 'Invoice' THEN amount ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Credit Memo' THEN amount ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Debit Memo' THEN amount ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Debit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Invoice' AND status = 'Open' THEN balance ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Invoice' AND status = 'Open' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Invoice' AND status = 'Balanced' THEN balance ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Invoice' AND status = 'Balanced' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced') THEN balance ELSE 0 END), 0),
      COUNT(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced') THEN 1 END)::integer,
      now(),
      now()
    FROM base
    GROUP BY inv_year
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
      open_invoice_balance = EXCLUDED.open_invoice_balance,
      open_invoice_count = EXCLUDED.open_invoice_count,
      balanced_invoice_balance = EXCLUDED.balanced_invoice_balance,
      balanced_invoice_count = EXCLUDED.balanced_invoice_count,
      open_cm_balance = EXCLUDED.open_cm_balance,
      open_cm_count = EXCLUDED.open_cm_count,
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