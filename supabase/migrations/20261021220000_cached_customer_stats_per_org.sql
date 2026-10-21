/*
  # Dashboard showed both tenants added together (audit C1/C15)

  cached_customer_stats is a SINGLE global row (id = 1) with no organization
  column, refreshed every 5 minutes by cron 31 from an ungrouped aggregate over
  all of acumatica_customers / acumatica_invoices. Its RLS policy is
  USING (true), so nothing scoped the read either.

  The Dashboard's headline "Total open AR" therefore showed both organizations
  summed. Proven: the stored total_customers_excl_test is 3,442, which is
  exactly the live org's 2,892 plus the demo org's 550. Demo customers are not
  flagged is_test_customer, so the _excl_test columns did not help.

  Now one row per organization: an organization_id column, a refresh that
  GROUPs BY it, and an RLS predicate that scopes the read. The aggregate maths
  is unchanged -- same net_balance (invoices + debit memos less credit memos,
  floored at zero), same is_test_customer split -- only the grouping is new.

  EXPECTED VISIBLE CHANGE: the Dashboard's open-AR figure drops to the caller's
  own organization. That is the point.
*/

ALTER TABLE public.cached_customer_stats
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- id was the single-row key; the real key is now the organization.
CREATE UNIQUE INDEX IF NOT EXISTS cached_customer_stats_org_key
  ON public.cached_customer_stats (organization_id);

DROP POLICY IF EXISTS "Authenticated users can read cached customer stats" ON public.cached_customer_stats;
CREATE POLICY "Users read their own org's cached customer stats"
  ON public.cached_customer_stats FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE OR REPLACE FUNCTION public.refresh_cached_customer_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_rows integer := 0;
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
          ELSE 0 END
      ) AS max_overdue
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status IN ('Open', 'Balanced')
    GROUP BY i.customer
  ),
  per_org AS (
    SELECT
      c.organization_id,
      COUNT(*)::integer                                                              AS total_customers,
      COUNT(*) FILTER (WHERE c.is_active)::integer                                   AS active_customers,
      COUNT(*) FILTER (WHERE COALESCE(cb.net_balance, 0) > 0)::integer               AS customers_with_debt,
      COALESCE(SUM(GREATEST(cb.net_balance, 0)), 0)                                  AS total_balance,
      COALESCE(SUM(cb.inv_count), 0)::integer                                        AS total_open_invoices,
      COUNT(*) FILTER (WHERE COALESCE(cb.max_overdue, 0) > 0)::integer               AS customers_with_overdue,
      COUNT(*) FILTER (WHERE NOT c.is_test_customer)::integer                        AS total_excl_test,
      COUNT(*) FILTER (WHERE NOT c.is_test_customer AND c.is_active)::integer        AS active_excl_test,
      COUNT(*) FILTER (WHERE NOT c.is_test_customer AND COALESCE(cb.net_balance,0) > 0)::integer AS debt_excl_test,
      COALESCE(SUM(GREATEST(cb.net_balance, 0)) FILTER (WHERE NOT c.is_test_customer), 0)        AS bal_excl_test,
      COALESCE(SUM(cb.inv_count) FILTER (WHERE NOT c.is_test_customer), 0)::integer             AS inv_excl_test,
      COUNT(*) FILTER (WHERE NOT c.is_test_customer AND COALESCE(cb.max_overdue,0) > 0)::integer AS overdue_excl_test
    FROM acumatica_customers c
    LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
    WHERE c.organization_id IS NOT NULL
    GROUP BY c.organization_id
  ),
  upserted AS (
    INSERT INTO cached_customer_stats AS t (
      organization_id, total_customers, active_customers, customers_with_debt,
      total_balance, avg_balance, total_open_invoices, customers_with_overdue,
      total_customers_excl_test, active_customers_excl_test, customers_with_debt_excl_test,
      total_balance_excl_test, avg_balance_excl_test, total_open_invoices_excl_test,
      customers_with_overdue_excl_test, calculated_at, updated_at
    )
    SELECT
      p.organization_id, p.total_customers, p.active_customers, p.customers_with_debt,
      p.total_balance,
      CASE WHEN p.customers_with_debt > 0 THEN p.total_balance / p.customers_with_debt ELSE 0 END,
      p.total_open_invoices, p.customers_with_overdue,
      p.total_excl_test, p.active_excl_test, p.debt_excl_test,
      p.bal_excl_test,
      CASE WHEN p.debt_excl_test > 0 THEN p.bal_excl_test / p.debt_excl_test ELSE 0 END,
      p.inv_excl_test, p.overdue_excl_test, now(), now()
    FROM per_org p
    ON CONFLICT (organization_id) DO UPDATE SET
      total_customers = EXCLUDED.total_customers,
      active_customers = EXCLUDED.active_customers,
      customers_with_debt = EXCLUDED.customers_with_debt,
      total_balance = EXCLUDED.total_balance,
      avg_balance = EXCLUDED.avg_balance,
      total_open_invoices = EXCLUDED.total_open_invoices,
      customers_with_overdue = EXCLUDED.customers_with_overdue,
      total_customers_excl_test = EXCLUDED.total_customers_excl_test,
      active_customers_excl_test = EXCLUDED.active_customers_excl_test,
      customers_with_debt_excl_test = EXCLUDED.customers_with_debt_excl_test,
      total_balance_excl_test = EXCLUDED.total_balance_excl_test,
      avg_balance_excl_test = EXCLUDED.avg_balance_excl_test,
      total_open_invoices_excl_test = EXCLUDED.total_open_invoices_excl_test,
      customers_with_overdue_excl_test = EXCLUDED.customers_with_overdue_excl_test,
      calculated_at = now(),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_rows FROM upserted;

  -- The old global row is meaningless now and must not be served to anyone.
  DELETE FROM cached_customer_stats WHERE organization_id IS NULL;

  RETURN jsonb_build_object('success', true, 'organizations', v_rows, 'calculated_at', now());
END;
$function$;

-- NOTE: the refresh is deliberately NOT called here. Calling it in the same
-- transaction as the ALTER TABLE above fails -- the INSERT still sees the old
-- PRIMARY KEY (id) with its CHECK (id = 1) default and raises a duplicate key
-- on id=1. Run `SELECT public.refresh_cached_customer_stats();` as a separate
-- statement after this migration (cron 31 also runs it every 5 minutes).
