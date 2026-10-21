/*
  # Stop 11 views serving the AR book to anonymous callers

  Every view in public is owned by postgres with no security_invoker, so none of
  them apply row-level security, and SELECT was granted to `anon`. The anon key
  is PUBLIC -- it ships in the site's JavaScript bundle -- so anyone who opened
  the app could read these with no account and no session.

  Verified live against the anon key, with no user session, before this change:

    payment_analytics_summary              48,836 rows
    collector_assignment_details            1,842 rows (customer names,
                                                  invoice refs, balances)
    collector_customer_assignment_details     551 rows
    user_permissions_summary                  525 rows
    invoice_month_summary_mv                  205 rows
    latest_payment_analytics                  134 rows
    monthly_revenue_stats                     132 rows
    mv_payment_month_summary                  126 rows
    collector_activity_summary                 17 rows

  For contrast, the underlying tables behave correctly: the same anon key gets
  [] from collection_tickets. Only the views leaked, because a view owned by a
  superuser reads its base tables as that owner and skips their policies.

  Revoking anon is safe: the app authenticates before it reads anything, and
  eight of these eleven views are referenced nowhere in src/ or
  supabase/functions/ at all. The three that are used
  (collector_assignment_details, customer_balances, collector_activity_summary)
  are only ever read by a signed-in user, who holds `authenticated`.

  This migration ONLY closes the anonymous hole. It deliberately does not add
  security_invoker: these views still bypass RLS for authenticated users, which
  is a second, separate bug (it is why the live org's Closed tab lists the demo
  org's 400 tickets). Fixing that needs the base-table SELECT policies checked
  first -- invoice_assignments in particular -- or My Assignments would go blank
  for collectors.
*/

REVOKE SELECT ON public.admin_user_list                        FROM anon;
REVOKE SELECT ON public.collector_activity_summary             FROM anon;
REVOKE SELECT ON public.collector_assignment_details           FROM anon;
REVOKE SELECT ON public.collector_customer_assignment_details  FROM anon;
REVOKE SELECT ON public.customer_balances                      FROM anon;
REVOKE SELECT ON public.invoice_month_summary_mv               FROM anon;
REVOKE SELECT ON public.latest_payment_analytics               FROM anon;
REVOKE SELECT ON public.monthly_revenue_stats                  FROM anon;
REVOKE SELECT ON public.mv_payment_month_summary               FROM anon;
REVOKE SELECT ON public.payment_analytics_summary              FROM anon;
REVOKE SELECT ON public.user_permissions_summary               FROM anon;

NOTIFY pgrst, 'reload schema';
