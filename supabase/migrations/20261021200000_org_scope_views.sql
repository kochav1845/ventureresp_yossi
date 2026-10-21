/*
  # Scope the three live views to the caller's organization

  Companion to 20261021190000, which stopped these views serving data to
  anonymous callers. They still bypassed RLS for AUTHENTICATED users: a view
  owned by a superuser reads its base tables as that owner, so one org could
  read the other's rows through them. That is why the live org's Closed tab
  listed the demo org's 400 tickets -- reproduced in the running app, where a
  DEMO-org user's Ticketing System showed the live org's 4 open tickets.

  The fix is an explicit organization predicate rather than security_invoker,
  because invoice_assignments has NO organization_id column and its collector
  policy is `assigned_collector_id = auth.uid()`. Flipping security_invoker
  would therefore show a collector only their own assignment rows and empty the
  Ticketing System for them. get_user_org_id() evaluates per request even in an
  owner-run view, so an explicit filter scopes correctly without touching any
  base-table policy.

  Measured before changing anything: all 1,842 rows of
  collector_assignment_details resolve to an org via
  COALESCE(ticket.organization_id, invoice.organization_id) -- zero orphans --
  splitting 42 live / 1,800 demo. Nothing is dropped, each org simply stops
  seeing the other's.

  Consumers checked first, so this breaks nothing: collector_assignment_details
  is read only by UnifiedTicketingSystem, collector_activity_summary only by
  CollectorHub, and customer_balances only by get_customer_analytics -- all as
  an authenticated user. No edge function or cron reads any of them (the
  apparent hits were the RPC get_api_customer_balances and CTEs that happen to
  be named customer_balances). All 26 user_profiles have an organization_id, so
  no signed-in user resolves to NULL and loses access.

  EXPECTED VISIBLE CHANGE: counts drop to the caller's own org. The live org's
  Closed tab goes from 400 tickets to its real 4.
*/

CREATE OR REPLACE VIEW public.collector_assignment_details AS
 SELECT ia.id AS assignment_id,
    ia.invoice_reference_number,
    ia.assigned_collector_id,
    ia.ticket_id,
    ia.assigned_at,
    ia.assigned_by,
    ia.notes AS assignment_notes,
    inv.customer,
    COALESCE(ct.customer_name, inv.customer_name) AS customer_name,
    inv.date,
    inv.due_date,
    inv.amount,
    inv.balance,
    inv.status AS invoice_status,
    inv.description,
    inv.color_status,
    inv.promise_date AS invoice_promise_date,
    ct.id AS ticket_id_full,
    ct.ticket_number,
    ct.customer_id AS ticket_customer_id,
    ct.status AS ticket_status,
    ct.priority AS ticket_priority,
    ct.ticket_type,
    ct.due_date AS ticket_due_date,
    ct.promise_date AS ticket_promise_date,
    up.full_name AS collector_name,
    up.email AS collector_email,
    creator.full_name AS assigned_by_name,
    creator.email AS assigned_by_email
   FROM invoice_assignments ia
     LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
     LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
     LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
     LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id
  WHERE COALESCE(ct.organization_id, inv.organization_id) = get_user_org_id();

CREATE OR REPLACE VIEW public.customer_balances AS
 SELECT c.id,
    c.customer_id,
    c.customer_name,
    c.customer_class,
    c.customer_status,
    c.country,
    c.city,
    c.email_address,
    c.terms,
    c.credit_limit,
    c.balance AS stored_balance,
    COALESCE(sum(
        CASE
            WHEN i.status = ANY (ARRAY['Open'::text, 'Balanced'::text]) THEN i.balance
            ELSE 0::numeric
        END), 0::numeric) AS calculated_balance,
    COALESCE(( SELECT sum(p.payment_amount) AS sum
           FROM acumatica_payments p
          WHERE p.customer_id = c.customer_id AND (p.status <> ALL (ARRAY['Voided'::text, 'Cancelled'::text]))), 0::numeric) AS total_paid,
    count(
        CASE
            WHEN i.status = ANY (ARRAY['Open'::text, 'Balanced'::text]) THEN 1
            ELSE NULL::integer
        END) AS open_invoices_count,
    count(
        CASE
            WHEN i.balance > 0::numeric THEN 1
            ELSE NULL::integer
        END) AS unpaid_invoices_count,
    min(
        CASE
            WHEN (i.status = ANY (ARRAY['Open'::text, 'Balanced'::text])) AND i.balance > 0::numeric THEN i.date
            ELSE NULL::date
        END) AS oldest_open_invoice_date,
    ( SELECT i2.reference_number
           FROM acumatica_invoices i2
          WHERE i2.customer = c.customer_id AND (i2.status = ANY (ARRAY['Open'::text, 'Balanced'::text])) AND i2.balance > 0::numeric
          ORDER BY i2.date
         LIMIT 1) AS oldest_open_invoice_ref,
    c.synced_at,
    c.created_at,
    c.updated_at,
    c.last_sync_timestamp
   FROM acumatica_customers c
     LEFT JOIN acumatica_invoices i ON i.customer = c.customer_id
  WHERE c.organization_id = get_user_org_id()
  GROUP BY c.id, c.customer_id, c.customer_name, c.customer_class, c.customer_status, c.country, c.city, c.email_address, c.terms, c.credit_limit, c.balance, c.synced_at, c.created_at, c.updated_at, c.last_sync_timestamp;

CREATE OR REPLACE VIEW public.collector_activity_summary AS
 SELECT up.id AS collector_id,
    up.email AS collector_email,
    up.role AS user_role,
    count(DISTINCT ca.customer_id) AS assigned_customers,
    count(DISTINCT ica.invoice_id) AS assigned_invoices,
    count(DISTINCT icl.invoice_id) AS invoices_modified,
    count(DISTINCT pcl.payment_id) AS payments_modified,
    count(DISTINCT ces.id) AS emails_scheduled,
    count(DISTINCT
        CASE
            WHEN ces.status = 'sent'::text THEN ces.id
            ELSE NULL::uuid
        END) AS emails_sent,
    max(ual.created_at) AS last_activity_at
   FROM user_profiles up
     LEFT JOIN collector_assignments ca ON up.id = ca.collector_id AND ca.status = 'active'::text
     LEFT JOIN invoice_collector_assignments ica ON up.id = ica.collector_id AND ica.status = 'active'::text
     LEFT JOIN invoice_change_log icl ON up.id = icl.changed_by
     LEFT JOIN payment_change_log pcl ON up.id = pcl.changed_by
     LEFT JOIN collector_email_schedules ces ON up.id = ces.collector_id
     LEFT JOIN user_activity_logs ual ON up.id = ual.user_id
  WHERE up.can_be_assigned_as_collector = true
    AND up.organization_id = get_user_org_id()
  GROUP BY up.id, up.email, up.role;

-- anon was revoked in 20261021190000; keep it that way.
REVOKE SELECT ON public.collector_assignment_details  FROM anon;
REVOKE SELECT ON public.customer_balances             FROM anon;
REVOKE SELECT ON public.collector_activity_summary    FROM anon;

NOTIFY pgrst, 'reload schema';
