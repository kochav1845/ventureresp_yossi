/*
  # Security hardening (audit Wave 2): cross-org RLS + schema cleanup

  This is a 2-tenant app (orgs a98c768a… and cc534e42…, both with real data).
  Several secondary tables used USING(true), leaking one org's data to the other.
  Core financial tables were already org-scoped; this closes the PII/notes/email
  gaps, drops a leftover anon-writable backup table, removes duplicate policies,
  and pins search_path on SECURITY DEFINER functions.
*/

-- 1. Drop the leftover backup table (RLS off, anon had full grants, 0 rows) ----
DROP TABLE IF EXISTS public.acumatica_payments_backup_20251203;

-- 2. Remove duplicate (identical) RLS policies — keep one of each pair ---------
DROP POLICY IF EXISTS "Users can view customers in their org" ON public.acumatica_customers;
DROP POLICY IF EXISTS "Users can view invoices in their org" ON public.acumatica_invoices;
DROP POLICY IF EXISTS "Users can view payments in their org" ON public.acumatica_payments;
DROP POLICY IF EXISTS "Users can view cached balances in their org" ON public.cached_customer_balances;

-- 3. Org-scope the leaky PII tables (were USING(true) = cross-org readable) ----
-- customer_notes → scope by the customer's org (mirrors invoice_memos).
DROP POLICY IF EXISTS "Authenticated users can view customer notes" ON public.customer_notes;
CREATE POLICY "View notes for own-org customers" ON public.customer_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM acumatica_customers c
    WHERE c.customer_id = customer_notes.customer_id
      AND c.organization_id = get_user_org_id()));

-- customer_email_logs (email subjects/status per customer) → scope by customer org.
DROP POLICY IF EXISTS "Users can view email logs" ON public.customer_email_logs;
CREATE POLICY "View email logs for own-org customers" ON public.customer_email_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM acumatica_customers c
    WHERE c.customer_id = customer_email_logs.customer_id
      AND c.organization_id = get_user_org_id()));

-- outbound_replies (staff email bodies) → scope by the sender's org.
DROP POLICY IF EXISTS "Authenticated users can view all replies" ON public.outbound_replies;
CREATE POLICY "View replies from own org" ON public.outbound_replies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = outbound_replies.sent_by
      AND up.organization_id = get_user_org_id()));

-- 4. Pin search_path on every SECURITY DEFINER function in public --------------
-- (public,extensions covers pgcrypto/uuid-ossp which live in the extensions schema).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', r.sig);
  END LOOP;
END $$;
