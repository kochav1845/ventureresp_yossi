/*
  # refresh_cached_customer_balances(): DELETE instead of TRUNCATE

  Cron job 31 (refresh-customer-stats, every 5 minutes) runs
    SELECT refresh_cached_customer_stats(); SELECT refresh_cached_customer_balances();
  in one transaction. The balances refresh began with TRUNCATE, which takes an
  ACCESS EXCLUSIVE lock held until that transaction commits (the whole job takes
  8.5 s on average, p90 18 s, max 27 s over the last two days; on 2026-10-14 16:42
  the lock was held ~15 s). For that whole window:

  - every read of cached_customer_balances (customers list, statements summary,
    dashboards) waited and then failed at the 8 s statement timeout (500);
  - on 2026-10-14 16:42 UTC the Realtime tenant woke up and created
    realtime.messages partitions, which made PostgREST reload its schema cache.
    The schema query opens every table, so it queued behind the TRUNCATE lock,
    timed out at 16:42:16, and PostgREST answered every request with
    503 PGRST002 ("Could not query the database for the schema cache") until the
    refresh committed at 16:42:22.

  DELETE + INSERT in the same transaction never blocks readers (they see the old
  rows until commit) and never blocks the schema cache. The table is ~3,500 rows,
  so the dead tuples are trivial for autovacuum. An advisory lock keeps two
  refreshes from overlapping, which TRUNCATE used to do implicitly.
  Result columns and data are unchanged.
*/

CREATE OR REPLACE FUNCTION public.refresh_cached_customer_balances()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
-- One refresh at a time. TRUNCATE used to serialise overlapping refreshes as a
-- side effect of its lock; without it, two concurrent runs would both insert
-- and collide on the customer_id primary key.
PERFORM pg_advisory_xact_lock(hashtext('public.refresh_cached_customer_balances'));

-- DELETE, not TRUNCATE: TRUNCATE holds an ACCESS EXCLUSIVE lock until the cron
-- transaction commits (often 10+ s, every 5 minutes), so every reader of this
-- table -- and PostgREST's schema-cache reload -- queued behind it.
-- DELETE only takes ROW EXCLUSIVE: readers keep seeing the previous rows until
-- the refresh commits. (WHERE true: pg-safeupdate rejects a bare DELETE when
-- this is called through PostgREST.)
DELETE FROM cached_customer_balances WHERE true;

INSERT INTO cached_customer_balances (
customer_id, customer_name, email_address, is_active, responded_this_month,
postpone_until, postpone_reason, created_at, updated_at, red_threshold_days,
color_status, calculated_balance, calculated_balance_excl_cm, gross_balance,
credit_memo_balance, open_invoice_count, red_count, yellow_count, green_count,
max_days_overdue, max_days_overdue_due, exclude_from_payment_analytics, exclude_from_customer_analytics,
is_test_customer, cached_at, organization_id, source
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
c.organization_id,
COALESCE(c.source, 'acumatica')
FROM acumatica_customers c
LEFT JOIN customer_balances cb ON c.customer_id = cb.customer;
END;
$function$;
