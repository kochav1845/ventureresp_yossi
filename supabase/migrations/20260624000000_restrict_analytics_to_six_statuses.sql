/*
  # Restrict Invoice Analytics to the six business statuses

  1. Requirement (per owner)
    - The whole Invoice Analytics page must always be scoped to:
      Types : Invoice, Debit Memo, Credit Memo
      Status: Balanced, Credit Hold, Open, Closed, Voided, Canceled
    - "Open" metrics (open balance / open invoice / open CM / open DM) must NOT
      count Closed/Voided/Canceled — they stay limited to Open/Balanced/Credit Hold.

  2. Changes
    - Add `status IN ('Balanced','Credit Hold','Open','Closed','Voided','Canceled')`
      to every base query in `refresh_cached_invoice_analytics_for_org`
      (daily, monthly, yearly, and the min/max year scan).
    - Same status filter on the base CTE of `get_filtered_invoice_aggregates`.
    - Open-balance CASE expressions are unchanged (Open/Balanced/Credit Hold only).

  3. Notes
    - This excludes "On Hold" (75) and "Scheduled" (2) docs from TOTALS only.
      Open balances are unaffected (those statuses are not open).
    - Analytics total counts will therefore differ from the Invoice Breakdown MV
      (which still includes On Hold) by those few documents — this is intended.
    - After deploying, refresh the cache (refresh_cached_invoice_analytics).
*/

CREATE OR REPLACE FUNCTION refresh_cached_invoice_analytics_for_org(
  p_period_type text,
  p_target_year integer,
  p_month integer,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5min'
AS $$
DECLARE
  v_rows_affected integer := 0;
  v_batch_rows integer;
  v_start_date date;
  v_end_date date;
  v_min_year integer;
  v_max_year integer;
  v_year integer;
BEGIN
  IF p_period_type = 'daily' THEN
    v_start_date := make_date(p_target_year, COALESCE(p_month, EXTRACT(MONTH FROM now())::integer), 1);
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
      WHERE i.organization_id = p_org_id
        AND i.date::date >= v_start_date
        AND i.date::date < v_end_date
        AND i.type IN ('Invoice', 'Debit Memo', 'Credit Memo')
        AND i.status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled')
    ),
    main_agg AS (
      SELECT
        inv_date,
        COALESCE(SUM(amount), 0) AS total_amount,
        COALESCE(SUM(balance), 0) AS total_balance,
        COALESCE(SUM(CASE WHEN status IN ('Open', 'Balanced', 'Credit Hold') THEN balance ELSE 0 END), 0) AS total_open_balance,
        COUNT(*)::integer AS invoice_count,
        COUNT(DISTINCT customer)::integer AS unique_customer_count,
        COALESCE(SUM(CASE WHEN type = 'Invoice' THEN amount ELSE 0 END), 0) AS invoice_only_amount,
        COUNT(CASE WHEN type = 'Invoice' THEN 1 END)::integer AS invoice_only_count,
        COALESCE(SUM(CASE WHEN type = 'Credit Memo' THEN amount ELSE 0 END), 0) AS credit_memo_amount,
        COUNT(CASE WHEN type = 'Credit Memo' THEN 1 END)::integer AS credit_memo_count,
        COALESCE(SUM(CASE WHEN type = 'Debit Memo' THEN amount ELSE 0 END), 0) AS debit_memo_amount,
        COUNT(CASE WHEN type = 'Debit Memo' THEN 1 END)::integer AS debit_memo_count,
        COALESCE(SUM(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status IN ('Open', 'Credit Hold') THEN balance ELSE 0 END), 0) AS open_invoice_balance,
        COUNT(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status IN ('Open', 'Credit Hold') THEN 1 END)::integer AS open_invoice_count,
        COALESCE(SUM(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status = 'Balanced' THEN balance ELSE 0 END), 0) AS balanced_invoice_balance,
        COUNT(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status = 'Balanced' THEN 1 END)::integer AS balanced_invoice_count,
        COALESCE(SUM(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced', 'Credit Hold') THEN balance ELSE 0 END), 0) AS open_cm_balance,
        COUNT(CASE WHEN type = 'Credit Memo' AND status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)::integer AS open_cm_count,
        COALESCE(SUM(CASE WHEN type = 'Debit Memo' AND status IN ('Open', 'Balanced', 'Credit Hold') THEN balance ELSE 0 END), 0) AS open_dm_balance,
        COUNT(CASE WHEN type = 'Debit Memo' AND status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)::integer AS open_dm_count
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
      organization_id, period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      open_dm_balance, open_dm_count,
      type_amounts, status_breakdown,
      calculated_at, updated_at
    )
    SELECT
      p_org_id,
      'daily',
      EXTRACT(YEAR FROM m.inv_date)::integer,
      EXTRACT(MONTH FROM m.inv_date)::integer,
      EXTRACT(DAY FROM m.inv_date)::integer,
      m.inv_date,
      m.total_amount, m.total_balance, m.total_open_balance,
      m.invoice_count, m.unique_customer_count,
      m.invoice_only_amount, m.invoice_only_count,
      m.credit_memo_amount, m.credit_memo_count,
      m.debit_memo_amount, m.debit_memo_count,
      m.open_invoice_balance, m.open_invoice_count,
      m.balanced_invoice_balance, m.balanced_invoice_count,
      m.open_cm_balance, m.open_cm_count,
      m.open_dm_balance, m.open_dm_count,
      COALESCE(ta.type_amounts, '{}'),
      COALESCE(sa.status_breakdown, '{}'),
      now(), now()
    FROM main_agg m
    LEFT JOIN type_agg ta ON ta.inv_date = m.inv_date
    LEFT JOIN status_agg sa ON sa.inv_date = m.inv_date
    ON CONFLICT (organization_id, period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
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
      open_dm_balance = EXCLUDED.open_dm_balance,
      open_dm_count = EXCLUDED.open_dm_count,
      type_amounts = EXCLUDED.type_amounts,
      status_breakdown = EXCLUDED.status_breakdown,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  ELSIF p_period_type = 'monthly' THEN
    INSERT INTO cached_invoice_analytics (
      organization_id, period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      open_dm_balance, open_dm_count,
      calculated_at, updated_at
    )
    SELECT
      p_org_id,
      'monthly',
      p_target_year,
      EXTRACT(MONTH FROM i.date::date)::integer,
      NULL::integer,
      NULL::date,
      COALESCE(SUM(i.amount), 0),
      COALESCE(SUM(i.balance), 0),
      COALESCE(SUM(CASE WHEN i.status IN ('Open', 'Balanced', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status IN ('Open', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status IN ('Open', 'Credit Hold') THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)::integer,
      now(), now()
    FROM acumatica_invoices i
    WHERE i.organization_id = p_org_id
      AND i.date::date >= make_date(p_target_year, 1, 1)
      AND i.date::date < make_date(p_target_year + 1, 1, 1)
      AND i.type IN ('Invoice', 'Debit Memo', 'Credit Memo')
      AND i.status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled')
    GROUP BY EXTRACT(MONTH FROM i.date::date)::integer
    ON CONFLICT (organization_id, period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
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
      open_dm_balance = EXCLUDED.open_dm_balance,
      open_dm_count = EXCLUDED.open_dm_count,
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Fill in empty months
    INSERT INTO cached_invoice_analytics (
      organization_id, period_type, year, month, day, date,
      total_amount, total_balance, total_open_balance,
      invoice_count, unique_customer_count,
      invoice_only_amount, invoice_only_count,
      credit_memo_amount, credit_memo_count,
      debit_memo_amount, debit_memo_count,
      open_invoice_balance, open_invoice_count,
      balanced_invoice_balance, balanced_invoice_count,
      open_cm_balance, open_cm_count,
      open_dm_balance, open_dm_count,
      calculated_at, updated_at
    )
    SELECT
      p_org_id, 'monthly', p_target_year, m.month_num, NULL, NULL,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now(), now()
    FROM generate_series(1, 12) AS m(month_num)
    WHERE NOT EXISTS (
      SELECT 1 FROM cached_invoice_analytics c
      WHERE c.organization_id = p_org_id
        AND c.period_type = 'monthly'
        AND c.year = p_target_year
        AND c.month = m.month_num
    )
    ON CONFLICT (organization_id, period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
    DO NOTHING;

  ELSIF p_period_type = 'yearly' THEN
    SELECT
      EXTRACT(YEAR FROM MIN(date))::integer,
      EXTRACT(YEAR FROM MAX(date))::integer
    INTO v_min_year, v_max_year
    FROM acumatica_invoices
    WHERE organization_id = p_org_id
      AND date IS NOT NULL
      AND type IN ('Invoice', 'Debit Memo', 'Credit Memo')
      AND status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled');

    IF v_min_year IS NOT NULL THEN
      FOR v_year IN v_min_year..v_max_year LOOP
        INSERT INTO cached_invoice_analytics (
          organization_id, period_type, year, month, day, date,
          total_amount, total_balance, total_open_balance,
          invoice_count, unique_customer_count,
          invoice_only_amount, invoice_only_count,
          credit_memo_amount, credit_memo_count,
          debit_memo_amount, debit_memo_count,
          open_invoice_balance, open_invoice_count,
          balanced_invoice_balance, balanced_invoice_count,
          open_cm_balance, open_cm_count,
          open_dm_balance, open_dm_count,
          calculated_at, updated_at
        )
        SELECT
          p_org_id,
          'yearly',
          v_year,
          NULL::integer,
          NULL::integer,
          NULL::date,
          COALESCE(SUM(i.amount), 0),
          COALESCE(SUM(i.balance), 0),
          COALESCE(SUM(CASE WHEN i.status IN ('Open', 'Balanced', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
          COUNT(*)::integer,
          COUNT(DISTINCT i.customer)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status IN ('Open', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status IN ('Open', 'Credit Hold') THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Debit Memo' AND i.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)::integer,
          now(), now()
        FROM acumatica_invoices i
        WHERE i.organization_id = p_org_id
          AND i.date::date >= make_date(v_year, 1, 1)
          AND i.date::date < make_date(v_year + 1, 1, 1)
          AND i.type IN ('Invoice', 'Debit Memo', 'Credit Memo')
          AND i.status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled')
        HAVING COUNT(*) > 0
        ON CONFLICT (organization_id, period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0))
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
          open_dm_balance = EXCLUDED.open_dm_balance,
          open_dm_count = EXCLUDED.open_dm_count,
          calculated_at = now(),
          updated_at = now();

        GET DIAGNOSTICS v_batch_rows = ROW_COUNT;
        v_rows_affected := v_rows_affected + v_batch_rows;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'period_type', p_period_type,
    'year', p_target_year,
    'month', p_month,
    'org_id', p_org_id,
    'rows_affected', v_rows_affected
  );
END;
$$;

-- Filtered aggregates: same status restriction on the base set
CREATE OR REPLACE FUNCTION get_filtered_invoice_aggregates(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_included_customers text[] DEFAULT '{}',
  p_excluded_customers text[] DEFAULT '{}'
)
RETURNS TABLE(
  year integer,
  month integer,
  total_amount numeric,
  invoice_count bigint,
  customer_count bigint,
  total_balance numeric,
  open_balance numeric,
  credit_memo_amount numeric,
  credit_memo_count bigint,
  open_invoice_balance numeric,
  open_invoice_count bigint,
  balanced_invoice_balance numeric,
  balanced_invoice_count bigint,
  open_cm_balance numeric,
  open_cm_count bigint,
  open_dm_balance numeric,
  open_dm_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := get_user_org_id();

  RETURN QUERY
  WITH filtered_invoices AS (
    SELECT
      date_part('year', i.date)::int AS yr,
      date_part('month', i.date)::int AS mo,
      i.amount::numeric AS amt,
      COALESCE(i.balance, 0)::numeric AS bal,
      i.customer AS cid,
      i.type,
      i.status
    FROM acumatica_invoices i
    WHERE
      i.organization_id = v_org_id
      AND i.type IN ('Invoice', 'Debit Memo', 'Credit Memo')
      AND i.status IN ('Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled')
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_type IS NULL OR i.type = p_type)
      AND (p_excluded_customers = '{}' OR i.customer != ALL(p_excluded_customers))
      AND (p_included_customers = '{}' OR i.customer = ANY(p_included_customers))
      AND (
        p_period_type = 'yearly'
        OR (p_year IS NOT NULL AND i.date >= make_date(p_year, 1, 1) AND i.date <= make_date(p_year, 12, 31))
      )
  )
  SELECT
    fp.yr,
    CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END,
    COALESCE(SUM(fp.amt), 0),
    COUNT(*),
    COUNT(DISTINCT fp.cid),
    COALESCE(SUM(fp.bal), 0),
    COALESCE(SUM(CASE WHEN fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' THEN fp.amt ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status IN ('Open', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status IN ('Open', 'Credit Hold') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status = 'Balanced' THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type IN ('Invoice', 'Debit Memo') AND fp.status = 'Balanced' THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Credit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END),
    COALESCE(SUM(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN fp.bal ELSE 0 END), 0),
    COUNT(CASE WHEN fp.type = 'Debit Memo' AND fp.status IN ('Open', 'Balanced', 'Credit Hold') THEN 1 END)
  FROM filtered_invoices fp
  GROUP BY fp.yr, CASE WHEN p_period_type = 'monthly' THEN fp.mo ELSE NULL::int END
  ORDER BY fp.yr DESC, 2 ASC;
END;
$$;
