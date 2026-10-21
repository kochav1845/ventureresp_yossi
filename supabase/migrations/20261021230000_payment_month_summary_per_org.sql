/*
  # "Collected" showed both tenants added together (audit C16 / H21)

  payment_month_summary was keyed on month_key ALONE with no organization
  column, and refresh_payment_month_summary() (cron 26) aggregated
  acumatica_payments with no org filter. Its RLS policy was USING (true) and
  get_payment_month_summary() was plain SQL with no filter either.

  So every reader -- the Dashboard's "Collected this month" KPI and its
  Invoiced-vs-Collected trend, the whole Payment Breakdown page, and the AI
  assistant's analytics tools -- got both organizations summed, while the
  invoiced side of the same chart came from the already-org-filtered
  invoice_month_summary_mv. February 2026 plotted $4.54M collected against
  $2.10M invoiced: a 216% collection rate where the real figure is 76%.

  Now keyed on (organization_id, month_key), with the refresh grouping by org,
  an org-scoped RLS predicate, and get_payment_month_summary() made SECURITY
  DEFINER filtering on get_user_org_id() -- the same shape
  get_invoice_month_summary() already had.

  EXPECTED VISIBLE CHANGE: pre-June-2026 "Collected" months drop by roughly
  $2.4-3.0M each, to the caller's own organization. That is the point.
*/

ALTER TABLE public.payment_month_summary
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- The old rows are cross-tenant sums; there is nothing to salvage in them.
DELETE FROM public.payment_month_summary WHERE organization_id IS NULL;

ALTER TABLE public.payment_month_summary ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.payment_month_summary DROP CONSTRAINT IF EXISTS payment_month_summary_pkey;
ALTER TABLE public.payment_month_summary
  ADD CONSTRAINT payment_month_summary_pkey PRIMARY KEY (organization_id, month_key);

DROP POLICY IF EXISTS "Authenticated users can read payment month summary" ON public.payment_month_summary;
DROP POLICY IF EXISTS "Users read their own org's payment month summary" ON public.payment_month_summary;
CREATE POLICY "Users read their own org's payment month summary"
  ON public.payment_month_summary FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id());

CREATE OR REPLACE FUNCTION public.refresh_payment_month_summary()
RETURNS void
LANGUAGE plpgsql
SET statement_timeout TO '5min'
AS $function$
DECLARE
  v_year integer;
  v_min_year integer;
  v_max_year integer;
BEGIN
  SELECT
    EXTRACT(YEAR FROM MIN(effective_date))::integer,
    EXTRACT(YEAR FROM MAX(effective_date))::integer
  INTO v_min_year, v_max_year
  FROM acumatica_payments
  WHERE effective_date IS NOT NULL;

  IF v_min_year IS NULL THEN
    RETURN;
  END IF;

  FOR v_year IN v_min_year..v_max_year LOOP
    INSERT INTO payment_month_summary (
      organization_id, month_key, month_label,
      total_payments, total_amount,
      payment_count, payment_amount,
      prepayment_count, prepayment_amount,
      voided_count, voided_amount,
      refund_count, refund_amount,
      balance_wo_count, balance_wo_amount,
      credit_memo_count, credit_memo_amount,
      voided_refund_count, voided_refund_amount,
      debit_memo_count, debit_memo_amount
    )
    SELECT
      p.organization_id,
      to_char(p.effective_date::timestamp, 'YYYY-MM'),
      to_char(p.effective_date::timestamp, 'Mon YYYY'),
      count(*),
      COALESCE(sum(p.payment_amount), 0),
      count(*) FILTER (WHERE p.type = 'Payment'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Payment'), 0),
      count(*) FILTER (WHERE p.type = 'Prepayment'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Prepayment'), 0),
      count(*) FILTER (WHERE p.type IN ('Voided Payment', 'Voided Check')),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type IN ('Voided Payment', 'Voided Check')), 0),
      count(*) FILTER (WHERE p.type = 'Refund'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Refund'), 0),
      count(*) FILTER (WHERE p.type = 'Balance WO'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Balance WO'), 0),
      count(*) FILTER (WHERE p.type = 'Credit Memo'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Credit Memo'), 0),
      count(*) FILTER (WHERE p.type = 'Voided Refund'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Voided Refund'), 0),
      count(*) FILTER (WHERE p.type = 'Debit Memo'),
      COALESCE(sum(p.payment_amount) FILTER (WHERE p.type = 'Debit Memo'), 0)
    FROM acumatica_payments p
    WHERE EXTRACT(YEAR FROM p.effective_date) = v_year
      AND p.effective_date IS NOT NULL
      AND p.organization_id IS NOT NULL
    GROUP BY p.organization_id,
             to_char(p.effective_date::timestamp, 'YYYY-MM'),
             to_char(p.effective_date::timestamp, 'Mon YYYY')
    ON CONFLICT (organization_id, month_key) DO UPDATE SET
      month_label = EXCLUDED.month_label,
      total_payments = EXCLUDED.total_payments,
      total_amount = EXCLUDED.total_amount,
      payment_count = EXCLUDED.payment_count,
      payment_amount = EXCLUDED.payment_amount,
      prepayment_count = EXCLUDED.prepayment_count,
      prepayment_amount = EXCLUDED.prepayment_amount,
      voided_count = EXCLUDED.voided_count,
      voided_amount = EXCLUDED.voided_amount,
      refund_count = EXCLUDED.refund_count,
      refund_amount = EXCLUDED.refund_amount,
      balance_wo_count = EXCLUDED.balance_wo_count,
      balance_wo_amount = EXCLUDED.balance_wo_amount,
      credit_memo_count = EXCLUDED.credit_memo_count,
      credit_memo_amount = EXCLUDED.credit_memo_amount,
      voided_refund_count = EXCLUDED.voided_refund_count,
      voided_refund_amount = EXCLUDED.voided_refund_amount,
      debit_memo_count = EXCLUDED.debit_memo_count,
      debit_memo_amount = EXCLUDED.debit_memo_amount;
  END LOOP;
END;
$function$;

-- Was plain SQL with no filter, so RLS on the table was the only guard and the
-- AI-assistant edge functions (service role) bypassed it entirely.
CREATE OR REPLACE FUNCTION public.get_payment_month_summary()
RETURNS SETOF payment_month_summary
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT * FROM payment_month_summary
  WHERE organization_id = get_user_org_id()
  ORDER BY month_key DESC;
$function$;
