/*
  # The remaining cross-tenant views (audit C5, second half)

  Every view in public is owned by postgres with no security_invoker, so it runs
  with the owner's rights and ignores the RLS on the tables underneath. anon was
  revoked in 20261021190000; the three views the app actually reads
  (collector_assignment_details, customer_balances, collector_activity_summary)
  were given explicit organization predicates in 20261021200000.

  These eight are the rest. Nothing in src/ or supabase/functions/ reads any of
  them -- a demo-org user could still select every live-org row, including
  user_permissions_summary (525 rows of emails, roles and the permission matrix)
  and payment_analytics_summary (48,836 payments with customer names).

  invoice_month_summary_mv is read, but only by get_invoice_month_summary() and
  refresh_invoice_month_summary(), both SECURITY DEFINER, and by two service-role
  edge functions that now pass an explicit organization filter. A materialized
  view cannot carry RLS or security_invoker, so revoking the direct grant is the
  fix available.

  If any of these is wired up later it needs an organization predicate first,
  the way the three above got one.
*/

REVOKE SELECT ON public.admin_user_list                       FROM authenticated;
REVOKE SELECT ON public.collector_customer_assignment_details FROM authenticated;
REVOKE SELECT ON public.invoice_month_summary_mv              FROM authenticated;
REVOKE SELECT ON public.latest_payment_analytics              FROM authenticated;
REVOKE SELECT ON public.monthly_revenue_stats                 FROM authenticated;
REVOKE SELECT ON public.mv_payment_month_summary              FROM authenticated;
REVOKE SELECT ON public.payment_analytics_summary             FROM authenticated;
REVOKE SELECT ON public.user_permissions_summary              FROM authenticated;
