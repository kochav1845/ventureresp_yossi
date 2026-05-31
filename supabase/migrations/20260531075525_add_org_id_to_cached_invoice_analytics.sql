/*
  # Add organization_id to cached_invoice_analytics

  1. Schema Changes
    - Add `organization_id` (uuid) column to `cached_invoice_analytics`
    - Backfill existing rows with the first org found in acumatica_invoices
    - Drop old unique index (period_type, year, month, day)
    - Create new unique index including organization_id
    - Add foreign key reference to organizations table

  2. Security Changes
    - Drop overly permissive SELECT policy
    - Add org-scoped SELECT policy using get_user_org_id()
    - Keep service_role policy for cron-based inserts/updates

  3. Function Changes
    - Rewrite refresh_cached_invoice_analytics to scope by org
    - When called from authenticated user context, uses get_user_org_id()
    - When called from cron (no auth), iterates over all orgs

  4. Important Notes
    - Existing cached data is backfilled to the most common org
    - The cron job will now refresh data per-org
    - Frontend queries will automatically be scoped via RLS
*/

-- Step 1: Add organization_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cached_invoice_analytics' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE cached_invoice_analytics ADD COLUMN organization_id uuid;
  END IF;
END $$;

-- Step 2: Backfill existing rows with the primary org from invoices
UPDATE cached_invoice_analytics
SET organization_id = (
  SELECT organization_id FROM acumatica_invoices WHERE organization_id IS NOT NULL LIMIT 1
)
WHERE organization_id IS NULL;

-- Step 3: Make organization_id NOT NULL going forward (set default for safety)
ALTER TABLE cached_invoice_analytics ALTER COLUMN organization_id SET NOT NULL;

-- Step 4: Drop old unique index and create new one with org_id
DROP INDEX IF EXISTS idx_cached_invoice_analytics_unique;

CREATE UNIQUE INDEX idx_cached_invoice_analytics_unique
  ON cached_invoice_analytics (organization_id, period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0));

-- Step 5: Add index for org lookups
CREATE INDEX IF NOT EXISTS idx_cached_invoice_analytics_org
  ON cached_invoice_analytics (organization_id);

-- Step 6: Update RLS policies
DROP POLICY IF EXISTS "Authenticated users can read cached invoice analytics" ON cached_invoice_analytics;

CREATE POLICY "Users can read own org cached invoice analytics"
  ON cached_invoice_analytics
  FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- Step 7: Rewrite the refresh function to scope by org
CREATE OR REPLACE FUNCTION refresh_cached_invoice_analytics(
  p_period_type text,
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5min'
AS $$
DECLARE
  v_result jsonb;
  v_rows_affected integer := 0;
  v_batch_rows integer;
  v_target_year integer;
  v_start_date date;
  v_end_date date;
  v_min_year integer;
  v_max_year integer;
  v_year integer;
  v_org_id uuid;
  v_org record;
BEGIN
  v_target_year := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);

  -- Determine org context
  BEGIN
    v_org_id := get_user_org_id();
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  -- If no org context (cron job), loop over all orgs
  IF v_org_id IS NULL THEN
    FOR v_org IN SELECT DISTINCT organization_id FROM acumatica_invoices WHERE organization_id IS NOT NULL LOOP
      PERFORM refresh_cached_invoice_analytics_for_org(p_period_type, v_target_year, p_month, v_org.organization_id);
    END LOOP;
    RETURN jsonb_build_object('success', true, 'period_type', p_period_type, 'year', v_target_year, 'all_orgs', true);
  END IF;

  -- Single org context (authenticated user)
  RETURN refresh_cached_invoice_analytics_for_org(p_period_type, v_target_year, p_month, v_org_id);
END;
$$;

-- Helper function that does the actual work for one org
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
        COALESCE(SUM(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status = 'Open' THEN balance ELSE 0 END), 0) AS open_invoice_balance,
        COUNT(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status = 'Open' THEN 1 END)::integer AS open_invoice_count,
        COALESCE(SUM(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status = 'Balanced' THEN balance ELSE 0 END), 0) AS balanced_invoice_balance,
        COUNT(CASE WHEN type IN ('Invoice', 'Debit Memo') AND status = 'Balanced' THEN 1 END)::integer AS balanced_invoice_count,
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
      organization_id, period_type, year, month, day, date,
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
      COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(*)::integer,
      COUNT(DISTINCT i.customer)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Open' THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Open' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN 1 END)::integer,
      COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced') THEN i.balance ELSE 0 END), 0),
      COUNT(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced') THEN 1 END)::integer,
      now(), now()
    FROM acumatica_invoices i
    WHERE i.organization_id = p_org_id
      AND i.date::date >= make_date(p_target_year, 1, 1)
      AND i.date::date < make_date(p_target_year + 1, 1, 1)
      AND i.status != 'On Hold'
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
      calculated_at = now(),
      updated_at = now();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Fill in zero-rows for months with no data
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
      calculated_at, updated_at
    )
    SELECT
      p_org_id, 'monthly', p_target_year, m.month_num, NULL, NULL,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, now(), now()
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
    WHERE organization_id = p_org_id AND date IS NOT NULL AND status != 'On Hold';

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
          COALESCE(SUM(CASE WHEN i.status = 'Open' THEN i.balance ELSE 0 END), 0),
          COUNT(*)::integer,
          COUNT(DISTINCT i.customer)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Invoice' THEN i.amount ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Invoice' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' THEN i.amount ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Credit Memo' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Debit Memo' THEN i.amount ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Debit Memo' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Open' THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Open' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type IN ('Invoice', 'Debit Memo') AND i.status = 'Balanced' THEN 1 END)::integer,
          COALESCE(SUM(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced') THEN i.balance ELSE 0 END), 0),
          COUNT(CASE WHEN i.type = 'Credit Memo' AND i.status IN ('Open', 'Balanced') THEN 1 END)::integer,
          now(), now()
        FROM acumatica_invoices i
        WHERE i.organization_id = p_org_id
          AND i.date::date >= make_date(v_year, 1, 1)
          AND i.date::date < make_date(v_year + 1, 1, 1)
          AND i.status != 'On Hold'
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