/*
  # Manually-entered customers, invoices and payments

  Everything in acumatica_customers / acumatica_invoices / acumatica_payments has
  until now come from the Acumatica sync. This lets staff enter records by hand
  for customers that don't exist in Acumatica at all, add invoices against any
  customer, and record payments with the check image attached — and marks every
  such record as manual so it is obvious everywhere in the app.

  ## Why the same tables, not new ones
  ~40 RPCs, the balance cache, statements, tickets, aging and all the analytics
  read these three tables directly. A parallel set of "manual_*" tables would
  mean teaching every one of them to UNION. A `source` column costs one default
  and inherits all of that behaviour for free.

  ## Keys
  Manual records get prefixed business keys (M-C-00001 / M-INV-00001 /
  M-PAY-00001) from dedicated sequences. The uniques are
  acumatica_customers(customer_id), acumatica_invoices(reference_number, type)
  and acumatica_payments(reference_number, type); an "M-" prefix can never
  collide with Acumatica's numeric refs, so the sync's upserts cannot clobber a
  manual row and vice versa.

  ## Surviving the sync (the real hazard)
  Several sync paths delete anything in the DB that Acumatica doesn't know
  about — acumatica-payment-date-range-sync looks each "extra" row up and
  deletes it on a 404, and reconcile-invoice-statuses / fetch-missing-invoices /
  reconcile-month-invoices do the same for invoices. A manual record is by
  definition unknown to Acumatica, so every one of those would delete it.

  Two layers of defence:
    1. The edge functions now exclude source='manual' from their candidate
       lists (also stops wasting an Acumatica API lookup per manual row).
    2. The trigger below is the backstop: a BEFORE DELETE that silently cancels
       any delete of a manual row attempted from a service_role connection
       (i.e. the sync). Signed-in users are unaffected, so staff can still
       delete their own manual entries from the UI. This covers sync paths that
       don't exist yet.
*/

-- ── source / provenance ────────────────────────────────────────────────────

ALTER TABLE acumatica_customers
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'acumatica',
  ADD COLUMN IF NOT EXISTS manual_created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_note text;

ALTER TABLE acumatica_invoices
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'acumatica',
  ADD COLUMN IF NOT EXISTS manual_created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_created_at timestamptz;

ALTER TABLE acumatica_payments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'acumatica',
  ADD COLUMN IF NOT EXISTS manual_created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_created_at timestamptz;

-- Check images uploaded by staff vs pulled from Acumatica.
ALTER TABLE payment_attachments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'acumatica',
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acumatica_customers_source_check') THEN
    ALTER TABLE acumatica_customers ADD CONSTRAINT acumatica_customers_source_check CHECK (source IN ('acumatica','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acumatica_invoices_source_check') THEN
    ALTER TABLE acumatica_invoices ADD CONSTRAINT acumatica_invoices_source_check CHECK (source IN ('acumatica','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acumatica_payments_source_check') THEN
    ALTER TABLE acumatica_payments ADD CONSTRAINT acumatica_payments_source_check CHECK (source IN ('acumatica','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attachments_source_check') THEN
    ALTER TABLE payment_attachments ADD CONSTRAINT payment_attachments_source_check CHECK (source IN ('acumatica','manual'));
  END IF;
END $$;

COMMENT ON COLUMN acumatica_customers.source IS 'acumatica = synced from Acumatica; manual = entered by hand in this app. Manual rows are never touched by the sync.';
COMMENT ON COLUMN acumatica_invoices.source  IS 'acumatica = synced from Acumatica; manual = entered by hand in this app.';
COMMENT ON COLUMN acumatica_payments.source  IS 'acumatica = synced from Acumatica; manual = entered by hand in this app.';

-- Manual rows are a tiny minority; partial indexes keep the "show me what we
-- entered ourselves" views and the sync-guard filters cheap.
CREATE INDEX IF NOT EXISTS idx_acumatica_customers_manual ON acumatica_customers (organization_id, customer_id) WHERE source = 'manual';
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_manual  ON acumatica_invoices  (organization_id, customer)    WHERE source = 'manual';
CREATE INDEX IF NOT EXISTS idx_acumatica_payments_manual   ON acumatica_payments  (organization_id, customer_id) WHERE source = 'manual';

-- ── prefixed keys for manual records ───────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS manual_customer_seq;
CREATE SEQUENCE IF NOT EXISTS manual_invoice_seq;
CREATE SEQUENCE IF NOT EXISTS manual_payment_seq;

/*
  Hand out the next free manual key. Loops past any number a user already typed
  in by hand, so a collision just advances the sequence instead of erroring.
  kind: 'customer' | 'invoice' | 'payment'
*/
CREATE OR REPLACE FUNCTION public.next_manual_key(p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key   text;
  v_taken boolean;
  v_tries int := 0;
BEGIN
  LOOP
    v_tries := v_tries + 1;
    IF v_tries > 1000 THEN
      RAISE EXCEPTION 'next_manual_key(%): could not find a free key after 1000 tries', p_kind;
    END IF;

    CASE p_kind
      WHEN 'customer' THEN
        v_key := 'M-C-' || lpad(nextval('manual_customer_seq')::text, 5, '0');
        SELECT EXISTS (SELECT 1 FROM acumatica_customers WHERE customer_id = v_key) INTO v_taken;
      WHEN 'invoice' THEN
        v_key := 'M-INV-' || lpad(nextval('manual_invoice_seq')::text, 5, '0');
        SELECT EXISTS (SELECT 1 FROM acumatica_invoices WHERE reference_number = v_key) INTO v_taken;
      WHEN 'payment' THEN
        v_key := 'M-PAY-' || lpad(nextval('manual_payment_seq')::text, 5, '0');
        SELECT EXISTS (SELECT 1 FROM acumatica_payments WHERE reference_number = v_key) INTO v_taken;
      ELSE
        RAISE EXCEPTION 'next_manual_key: unknown kind %', p_kind;
    END CASE;

    EXIT WHEN NOT v_taken;
  END LOOP;

  RETURN v_key;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.next_manual_key(text) TO authenticated;

-- ── keep the sync's hands off manual rows ──────────────────────────────────

/*
  Cancels (rather than errors on) deletes of manual rows coming from a
  service_role connection — that's the sync and the reconcile edge functions,
  which all use the service key. Returning NULL from a BEFORE DELETE trigger
  drops the row from the statement silently, so a sync that tries anyway just
  deletes nothing instead of failing the whole run.

  Signed-in app users connect as `authenticated`, so the UI's own
  "delete this manual entry" still works.
*/
-- NB: deliberately SECURITY INVOKER (the default). Under SECURITY DEFINER
-- current_user is the function's OWNER, so the check would never match the
-- caller and the guard would silently do nothing.
CREATE OR REPLACE FUNCTION public.block_sync_deleting_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role text;
BEGIN
  IF OLD.source IS DISTINCT FROM 'manual' THEN
    RETURN OLD;
  END IF;

  -- PostgREST does `SET LOCAL ROLE <jwt role>`, so the service key shows up as
  -- current_setting('role'); fall back to current_user for direct connections.
  v_role := NULLIF(COALESCE(current_setting('role', true), ''), 'none');
  IF v_role IS NULL OR v_role = '' THEN
    v_role := current_user;
  END IF;

  IF v_role = 'service_role' OR current_user = 'service_role' THEN
    RAISE WARNING 'Skipped sync delete of manual % record % (%)', TG_TABLE_NAME, OLD.id, v_role;
    RETURN NULL;
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_manual_invoices ON acumatica_invoices;
CREATE TRIGGER trg_protect_manual_invoices
  BEFORE DELETE ON acumatica_invoices
  FOR EACH ROW EXECUTE FUNCTION block_sync_deleting_manual();

DROP TRIGGER IF EXISTS trg_protect_manual_payments ON acumatica_payments;
CREATE TRIGGER trg_protect_manual_payments
  BEFORE DELETE ON acumatica_payments
  FOR EACH ROW EXECUTE FUNCTION block_sync_deleting_manual();

DROP TRIGGER IF EXISTS trg_protect_manual_customers ON acumatica_customers;
CREATE TRIGGER trg_protect_manual_customers
  BEFORE DELETE ON acumatica_customers
  FOR EACH ROW EXECUTE FUNCTION block_sync_deleting_manual();

-- ── let staff remove their own manual customers ────────────────────────────
-- acumatica_customers had no DELETE policy at all. Allow it for manual rows
-- only, so a synced customer can still never be deleted from the app.

DROP POLICY IF EXISTS "Users can delete own org manual customers" ON acumatica_customers;
CREATE POLICY "Users can delete own org manual customers"
  ON acumatica_customers FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id() AND source = 'manual');

-- ── targeted balance-cache refresh ─────────────────────────────────────────

/*
  refresh_cached_customer_balances() TRUNCATEs and rebuilds all ~3,400 rows,
  which is far too heavy to run after every manual entry. This rebuilds the one
  customer's row with identical math so the Customers list and Dashboard pick up
  a hand-entered invoice or payment immediately.
*/
CREATE OR REPLACE FUNCTION public.refresh_cached_customer_balance_for(p_customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  DELETE FROM cached_customer_balances WHERE customer_id = p_customer_id;

  INSERT INTO cached_customer_balances (
    customer_id, customer_name, email_address, is_active, responded_this_month,
    postpone_until, postpone_reason, created_at, updated_at, red_threshold_days,
    color_status, calculated_balance, calculated_balance_excl_cm, gross_balance,
    credit_memo_balance, open_invoice_count, red_count, yellow_count, green_count,
    max_days_overdue, max_days_overdue_due, exclude_from_payment_analytics,
    exclude_from_customer_analytics, is_test_customer, cached_at, organization_id
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
          THEN GREATEST(0, (CURRENT_DATE - i.date)::INT) ELSE 0 END
      ) as max_overdue,
      MAX(
        CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
          THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) ELSE 0 END
      ) as max_overdue_due
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status IN ('Open', 'Balanced')
      AND i.customer = p_customer_id
    GROUP BY i.customer
  )
  SELECT
    c.customer_id, c.customer_name, c.email_address,
    COALESCE(c.is_active, true), COALESCE(c.responded_this_month, false),
    c.postpone_until, c.postpone_reason, c.created_at, c.updated_at,
    c.days_from_invoice_threshold, c.customer_color_status,
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
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  WHERE c.customer_id = p_customer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_cached_customer_balance_for(text) TO authenticated;

-- cached_customer_balances is rebuilt per-customer now, so make sure the lookup
-- the function deletes by is indexed.
CREATE INDEX IF NOT EXISTS idx_cached_customer_balances_customer_id
  ON cached_customer_balances (customer_id);

-- ── carry `source` into the balance cache ──────────────────────────────────
-- The Customers list and Dashboard read cached_customer_balances, not
-- acumatica_customers, so the cache has to carry the flag or those screens
-- can't show the "manual" marker.

ALTER TABLE cached_customer_balances
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'acumatica';

-- Backfill for rows cached before this migration.
UPDATE cached_customer_balances b
   SET source = c.source
  FROM acumatica_customers c
 WHERE c.customer_id = b.customer_id
   AND b.source IS DISTINCT FROM c.source;

-- Both refresh paths must populate it. Full rebuild first:
CREATE OR REPLACE FUNCTION public.refresh_cached_customer_balances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
TRUNCATE cached_customer_balances;

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

-- …and the single-customer rebuild.
CREATE OR REPLACE FUNCTION public.refresh_cached_customer_balance_for(p_customer_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  DELETE FROM cached_customer_balances WHERE customer_id = p_customer_id;

  INSERT INTO cached_customer_balances (
    customer_id, customer_name, email_address, is_active, responded_this_month,
    postpone_until, postpone_reason, created_at, updated_at, red_threshold_days,
    color_status, calculated_balance, calculated_balance_excl_cm, gross_balance,
    credit_memo_balance, open_invoice_count, red_count, yellow_count, green_count,
    max_days_overdue, max_days_overdue_due, exclude_from_payment_analytics,
    exclude_from_customer_analytics, is_test_customer, cached_at, organization_id, source
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
          THEN GREATEST(0, (CURRENT_DATE - i.date)::INT) ELSE 0 END
      ) as max_overdue,
      MAX(
        CASE WHEN COALESCE(i.due_date, i.date) IS NOT NULL AND i.balance > 0 AND i.type IN ('Invoice', 'Debit Memo')
          THEN GREATEST(0, (CURRENT_DATE - COALESCE(i.due_date, i.date))::INT) ELSE 0 END
      ) as max_overdue_due
    FROM acumatica_invoices i
    WHERE i.balance > 0
      AND i.status IN ('Open', 'Balanced')
      AND i.customer = p_customer_id
    GROUP BY i.customer
  )
  SELECT
    c.customer_id, c.customer_name, c.email_address,
    COALESCE(c.is_active, true), COALESCE(c.responded_this_month, false),
    c.postpone_until, c.postpone_reason, c.created_at, c.updated_at,
    c.days_from_invoice_threshold, c.customer_color_status,
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
  LEFT JOIN customer_balances cb ON c.customer_id = cb.customer
  WHERE c.customer_id = p_customer_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_cached_customer_balance_for(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
