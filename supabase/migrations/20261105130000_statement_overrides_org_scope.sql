/*
  # statement_email_overrides let anyone redirect another org's statements
  # (audit 25)

  The table has an organization_id column and its only policy ignored it:

      "Authenticated users can manage statement email overrides"
      ALL, authenticated, USING (true), WITH CHECK (true)

  So any authenticated account -- including a prospect handed the public demo
  login -- could insert one row naming a LIVE Venture Respiratory customer code
  and their own address. The live org's Statements page would then show that
  address as the customer's email, with nothing to say it came from another
  tenant, and the next send or auto-send cron run would email that customer's
  full statement, open-invoice detail and outstanding balance included, to
  whoever planted it.

  UNIQUE (customer_id) was global too, so one org claiming a customer code
  blocked the other from ever creating its own override for it.

  The table is empty today (0 rows), so there is nothing to migrate and nothing
  to break.

  organization_id gets a default of get_user_org_id() as well as the policy, so
  a client insert that forgets it still lands in the right tenant rather than
  NULL.
*/

ALTER TABLE public.statement_email_overrides
  ALTER COLUMN organization_id SET DEFAULT get_user_org_id();

-- Nothing to backfill, but refuse a row with no tenant from here on.
UPDATE public.statement_email_overrides o
   SET organization_id = c.organization_id
  FROM public.acumatica_customers c
 WHERE c.customer_id = o.customer_id
   AND o.organization_id IS NULL;

DELETE FROM public.statement_email_overrides WHERE organization_id IS NULL;
ALTER TABLE public.statement_email_overrides ALTER COLUMN organization_id SET NOT NULL;

-- A customer code is only unique within an organization.
ALTER TABLE public.statement_email_overrides
  DROP CONSTRAINT IF EXISTS statement_email_overrides_customer_id_key;
ALTER TABLE public.statement_email_overrides
  ADD CONSTRAINT statement_email_overrides_org_customer_key UNIQUE (organization_id, customer_id);

DROP POLICY IF EXISTS "Authenticated users can manage statement email overrides" ON public.statement_email_overrides;
DROP POLICY IF EXISTS "Users manage their org's statement email overrides" ON public.statement_email_overrides;
CREATE POLICY "Users manage their org's statement email overrides"
  ON public.statement_email_overrides FOR ALL TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());
