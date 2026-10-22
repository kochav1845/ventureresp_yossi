/*
  # The nightly auto-ticket job has created zero tickets since February
  # (audit findings 18, 19, 22, 28)

  process_auto_ticket_rules() ran every night at 21:35 and reported success for
  235 consecutive nights while creating nothing. Run read-only in a rolled-back
  transaction, it returned:

      {"processed":2,"tickets_created":0,"errors":[
        "Rule e7f22973-...: column i.invoice_date does not exist",
        "Rule 334a68eb-...: column i.invoice_date does not exist"]}

  Behind that first error sat four more breaks on the same path. Every one of
  them is a reference to a column or table that does not exist:

    * `i.invoice_date`           -> acumatica_invoices has `date` (8 places;
                                    the two `date_reference = 'invoice_date'`
                                    comparisons are rule config and stay)
    * `ct.assigned_to`           -> collection_tickets has
                                    `assigned_collector_id` (5 places)
    * `description` on the insert-> the column is `notes`
    * `ticket_invoices(ticket_id, invoice_id)`
                                 -> that table keys invoices by
                                    `invoice_reference_number`, and the table
                                    the app actually reads is
                                    `invoice_assignments` (7 places)
    * `collection_ticket_activity`
                                 -> the table is `ticket_activity_log`
                                    (5 places)

  Also fixed, because they would have been the next two failures:

    * `array_agg(i.id)` collected invoice UUIDs into a text[] and fed them to a
      reference-number column. It now collects `i.reference_number`.
    * `customer_name` and `organization_id` were never supplied.
      organization_id would normally come from the set_org_id_on_insert()
      trigger, but that calls get_user_org_id(), which is NULL under cron -- so
      every ticket this job created would have been orphaned with no tenant.
      Both are now resolved per rule: the organization from the rule author's
      profile, the customer name from acumatica_customers scoped to it.

  Invoice links use ON CONFLICT DO NOTHING, not DO UPDATE: an invoice already
  on someone else's ticket must not be silently moved by a nightly job.

  Finally, the silent swallow. The function caught every error into an array
  and returned success, so pg_cron recorded 235 successful runs. It now raises
  when any rule failed, which is what made this invisible for eight months.
*/

CREATE OR REPLACE FUNCTION public.process_auto_ticket_rules()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
v_rule RECORD;
v_condition RECORD;
v_customer RECORD;
v_tickets_created int := 0;
v_tickets_updated int := 0;
v_invoices_added int := 0;
v_processed int := 0;
v_errors text[] := '{}';
v_matched boolean;
v_condition_met boolean;
v_all_conditions_met boolean;
v_any_condition_met boolean;
v_customer_ids text[];
v_exclude_ids text[];
v_include_ids text[];
v_invoice_ids text[];
v_existing_ticket_id uuid;
v_new_ticket_id uuid;
v_count int;
v_amount numeric;
v_last_payment_date date;
v_days_since int;
-- The rule's tenant and the customer's display name. Both are needed on every
-- insert below and neither was being supplied.
v_org_id uuid;
v_cust_name text;
BEGIN
FOR v_rule IN
SELECT * FROM auto_ticket_rules WHERE active = true
LOOP
v_processed := v_processed + 1;

BEGIN
-- The tenant is the rule author's organization: this runs under cron, where
-- get_user_org_id() is NULL.
SELECT up.organization_id INTO v_org_id FROM user_profiles up WHERE up.id = v_rule.created_by;

SELECT c.customer_name INTO v_cust_name
FROM acumatica_customers c
WHERE c.customer_id = v_rule.customer_id
AND (v_org_id IS NULL OR c.organization_id = v_org_id)
LIMIT 1;
v_cust_name := COALESCE(v_cust_name, v_rule.customer_id);
-- Handle legacy rules (non-advanced)
IF v_rule.condition_logic IS DISTINCT FROM 'advanced' THEN
-- Use existing legacy logic via the old path
-- Invoice only
IF v_rule.condition_logic = 'invoice_only' OR v_rule.condition_logic IS NULL THEN
SELECT array_agg(i.reference_number) INTO v_invoice_ids
FROM acumatica_invoices i
WHERE i.customer = v_rule.customer_id
AND i.status IN ('Open', 'open')
AND i.type = 'Invoice'
AND i.balance > 0
AND i.date <= CURRENT_DATE - (v_rule.min_days_old || ' days')::interval
AND i.date >= CURRENT_DATE - (v_rule.max_days_old || ' days')::interval;

IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
SELECT ct.id INTO v_existing_ticket_id
FROM collection_tickets ct
WHERE ct.customer_id = v_rule.customer_id
AND ct.assigned_collector_id = v_rule.assigned_collector_id
AND ct.status != 'closed'
LIMIT 1;

IF v_existing_ticket_id IS NULL THEN
INSERT INTO collection_tickets (customer_id, customer_name, organization_id, assigned_collector_id, status, ticket_type, priority, notes)
VALUES (v_rule.customer_id, v_cust_name, v_org_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
RETURNING id INTO v_new_ticket_id;

INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_new_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

INSERT INTO ticket_activity_log (ticket_id, activity_type, description)
VALUES (v_new_ticket_id, 'created', 'Auto-created ticket with ' || array_length(v_invoice_ids, 1) || ' invoice(s)');

v_tickets_created := v_tickets_created + 1;
v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
ELSE
INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_existing_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

v_tickets_updated := v_tickets_updated + 1;
END IF;
END IF;

-- Payment only
ELSIF v_rule.condition_logic = 'payment_only' THEN
SELECT MAX(p.created_at::date) INTO v_last_payment_date
FROM acumatica_payments p
WHERE p.customer_id = v_rule.customer_id
AND p.type = 'Payment';

v_days_since := COALESCE(CURRENT_DATE - v_last_payment_date, 999999);

IF v_days_since >= v_rule.check_payment_within_days_min AND v_days_since <= v_rule.check_payment_within_days_max THEN
SELECT array_agg(i.reference_number) INTO v_invoice_ids
FROM acumatica_invoices i
WHERE i.customer = v_rule.customer_id
AND i.status IN ('Open', 'open')
AND i.balance > 0;

IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
SELECT ct.id INTO v_existing_ticket_id
FROM collection_tickets ct
WHERE ct.customer_id = v_rule.customer_id
AND ct.assigned_collector_id = v_rule.assigned_collector_id
AND ct.status != 'closed'
LIMIT 1;

IF v_existing_ticket_id IS NULL THEN
INSERT INTO collection_tickets (customer_id, customer_name, organization_id, assigned_collector_id, status, ticket_type, priority, notes)
VALUES (v_rule.customer_id, v_cust_name, v_org_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
RETURNING id INTO v_new_ticket_id;

INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_new_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

INSERT INTO ticket_activity_log (ticket_id, activity_type, description)
VALUES (v_new_ticket_id, 'created', 'Auto-created ticket with ' || array_length(v_invoice_ids, 1) || ' invoice(s)');

v_tickets_created := v_tickets_created + 1;
v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
ELSE
v_tickets_updated := v_tickets_updated + 1;
END IF;
END IF;
END IF;

-- Both AND
ELSIF v_rule.condition_logic = 'both_and' THEN
-- Check invoice age
SELECT count(*) INTO v_count
FROM acumatica_invoices i
WHERE i.customer = v_rule.customer_id
AND i.status IN ('Open', 'open')
AND i.type = 'Invoice'
AND i.balance > 0
AND i.date <= CURRENT_DATE - (v_rule.min_days_old || ' days')::interval
AND i.date >= CURRENT_DATE - (v_rule.max_days_old || ' days')::interval;

IF v_count > 0 THEN
-- Check payment recency
SELECT MAX(p.created_at::date) INTO v_last_payment_date
FROM acumatica_payments p
WHERE p.customer_id = v_rule.customer_id
AND p.type = 'Payment';

v_days_since := COALESCE(CURRENT_DATE - v_last_payment_date, 999999);

IF v_days_since >= v_rule.check_payment_within_days_min AND v_days_since <= v_rule.check_payment_within_days_max THEN
SELECT array_agg(i.reference_number) INTO v_invoice_ids
FROM acumatica_invoices i
WHERE i.customer = v_rule.customer_id
AND i.status IN ('Open', 'open')
AND i.balance > 0;

IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
SELECT ct.id INTO v_existing_ticket_id
FROM collection_tickets ct
WHERE ct.customer_id = v_rule.customer_id
AND ct.assigned_collector_id = v_rule.assigned_collector_id
AND ct.status != 'closed'
LIMIT 1;

IF v_existing_ticket_id IS NULL THEN
INSERT INTO collection_tickets (customer_id, customer_name, organization_id, assigned_collector_id, status, ticket_type, priority, notes)
VALUES (v_rule.customer_id, v_cust_name, v_org_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
RETURNING id INTO v_new_ticket_id;

INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_new_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

INSERT INTO ticket_activity_log (ticket_id, activity_type, description)
VALUES (v_new_ticket_id, 'created', 'Auto-created by combined AND rule');

v_tickets_created := v_tickets_created + 1;
v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
ELSE
v_tickets_updated := v_tickets_updated + 1;
END IF;
END IF;
END IF;
END IF;

-- Both OR
ELSIF v_rule.condition_logic = 'both_or' THEN
v_matched := false;

-- Check invoice age
SELECT count(*) INTO v_count
FROM acumatica_invoices i
WHERE i.customer = v_rule.customer_id
AND i.status IN ('Open', 'open')
AND i.type = 'Invoice'
AND i.balance > 0
AND i.date <= CURRENT_DATE - (v_rule.min_days_old || ' days')::interval
AND i.date >= CURRENT_DATE - (v_rule.max_days_old || ' days')::interval;

IF v_count > 0 THEN v_matched := true; END IF;

-- Check payment
IF NOT v_matched THEN
SELECT MAX(p.created_at::date) INTO v_last_payment_date
FROM acumatica_payments p
WHERE p.customer_id = v_rule.customer_id
AND p.type = 'Payment';

v_days_since := COALESCE(CURRENT_DATE - v_last_payment_date, 999999);
IF v_days_since >= v_rule.check_payment_within_days_min AND v_days_since <= v_rule.check_payment_within_days_max THEN
v_matched := true;
END IF;
END IF;

IF v_matched THEN
SELECT array_agg(i.reference_number) INTO v_invoice_ids
FROM acumatica_invoices i
WHERE i.customer = v_rule.customer_id
AND i.status IN ('Open', 'open')
AND i.balance > 0;

IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
SELECT ct.id INTO v_existing_ticket_id
FROM collection_tickets ct
WHERE ct.customer_id = v_rule.customer_id
AND ct.assigned_collector_id = v_rule.assigned_collector_id
AND ct.status != 'closed'
LIMIT 1;

IF v_existing_ticket_id IS NULL THEN
INSERT INTO collection_tickets (customer_id, customer_name, organization_id, assigned_collector_id, status, ticket_type, priority, notes)
VALUES (v_rule.customer_id, v_cust_name, v_org_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
RETURNING id INTO v_new_ticket_id;

INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_new_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

INSERT INTO ticket_activity_log (ticket_id, activity_type, description)
VALUES (v_new_ticket_id, 'created', 'Auto-created by combined OR rule');

v_tickets_created := v_tickets_created + 1;
v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
ELSE
v_tickets_updated := v_tickets_updated + 1;
END IF;
END IF;
END IF;
END IF;

CONTINUE;
END IF;

-- ADVANCED RULES
-- Determine customer scope
v_customer_ids := '{}';

IF v_rule.applies_to = 'all' OR v_rule.customer_id = '__ALL__' THEN
-- Get all customers with open invoices
SELECT array_agg(DISTINCT i.customer) INTO v_customer_ids
FROM acumatica_invoices i
WHERE i.status IN ('Open', 'open') AND i.balance > 0;

-- Apply exclusions
SELECT array_agg(t.customer_id) INTO v_exclude_ids
FROM auto_ticket_rule_targets t
WHERE t.rule_id = v_rule.id AND t.target_type = 'exclude';

IF v_exclude_ids IS NOT NULL THEN
v_customer_ids := ARRAY(SELECT unnest(v_customer_ids) EXCEPT SELECT unnest(v_exclude_ids));
END IF;

ELSIF v_rule.applies_to = 'exclude' OR v_rule.customer_id = '__EXCLUDE__' THEN
SELECT array_agg(t.customer_id) INTO v_exclude_ids
FROM auto_ticket_rule_targets t
WHERE t.rule_id = v_rule.id AND t.target_type = 'exclude';

SELECT array_agg(DISTINCT i.customer) INTO v_customer_ids
FROM acumatica_invoices i
WHERE i.status IN ('Open', 'open') AND i.balance > 0;

IF v_exclude_ids IS NOT NULL THEN
v_customer_ids := ARRAY(SELECT unnest(v_customer_ids) EXCEPT SELECT unnest(v_exclude_ids));
END IF;

ELSE
-- Specific customers
SELECT array_agg(t.customer_id) INTO v_include_ids
FROM auto_ticket_rule_targets t
WHERE t.rule_id = v_rule.id AND t.target_type = 'include';

IF v_include_ids IS NOT NULL AND array_length(v_include_ids, 1) > 0 THEN
v_customer_ids := v_include_ids;
ELSIF v_rule.customer_id IS NOT NULL AND v_rule.customer_id NOT IN ('__ALL__', '__EXCLUDE__', '__MULTI__') THEN
v_customer_ids := ARRAY[v_rule.customer_id];
END IF;
END IF;

IF v_customer_ids IS NULL OR array_length(v_customer_ids, 1) IS NULL THEN
CONTINUE;
END IF;

-- Evaluate conditions per customer
FOR v_customer IN
SELECT cust_id FROM unnest(v_customer_ids) AS cust_id
LOOP
v_all_conditions_met := true;
v_any_condition_met := false;

FOR v_condition IN
SELECT * FROM auto_ticket_rule_conditions WHERE rule_id = v_rule.id
LOOP
v_condition_met := false;

CASE v_condition.condition_type
WHEN 'balance_threshold' THEN
SELECT COALESCE(SUM(i.balance), 0) INTO v_amount
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0;

v_condition_met := CASE v_condition.operator
WHEN 'gt' THEN v_amount > COALESCE(v_condition.value_numeric, 0)
WHEN 'gte' THEN v_amount >= COALESCE(v_condition.value_numeric, 0)
WHEN 'lt' THEN v_amount < COALESCE(v_condition.value_numeric, 0)
WHEN 'lte' THEN v_amount <= COALESCE(v_condition.value_numeric, 0)
WHEN 'between' THEN v_amount >= COALESCE(v_condition.value_numeric, 0) AND v_amount <= COALESCE(v_condition.value_numeric_max, 999999999)
ELSE false
END;

WHEN 'total_overdue_amount' THEN
SELECT COALESCE(SUM(i.balance), 0) INTO v_amount
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0
AND i.due_date < CURRENT_DATE;

v_condition_met := CASE v_condition.operator
WHEN 'gt' THEN v_amount > COALESCE(v_condition.value_numeric, 0)
WHEN 'gte' THEN v_amount >= COALESCE(v_condition.value_numeric, 0)
WHEN 'lt' THEN v_amount < COALESCE(v_condition.value_numeric, 0)
WHEN 'between' THEN v_amount >= COALESCE(v_condition.value_numeric, 0) AND v_amount <= COALESCE(v_condition.value_numeric_max, 999999999)
ELSE false
END;

WHEN 'invoice_count_overdue' THEN
SELECT count(*) INTO v_count
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0
AND CASE WHEN v_condition.date_reference = 'invoice_date'
THEN i.date < CURRENT_DATE
ELSE i.due_date < CURRENT_DATE
END;

v_condition_met := CASE v_condition.operator
WHEN 'gt' THEN v_count > COALESCE(v_condition.value_numeric, 0)::int
WHEN 'gte' THEN v_count >= COALESCE(v_condition.value_numeric, 0)::int
WHEN 'eq' THEN v_count = COALESCE(v_condition.value_numeric, 0)::int
WHEN 'between' THEN v_count >= COALESCE(v_condition.value_numeric, 0)::int AND v_count <= COALESCE(v_condition.value_numeric_max, 999)::int
ELSE false
END;

WHEN 'invoice_age_days' THEN
SELECT count(*) INTO v_count
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0
AND CASE WHEN v_condition.date_reference = 'invoice_date'
THEN (CURRENT_DATE - i.date::date)
ELSE (CURRENT_DATE - i.due_date::date)
END > COALESCE(v_condition.value_numeric, 0)::int;

v_condition_met := v_count > 0;

WHEN 'days_since_last_payment' THEN
SELECT MAX(
COALESCE(p.effective_date, p.doc_date, p.created_at)::date
) INTO v_last_payment_date
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment';

v_days_since := COALESCE(CURRENT_DATE - v_last_payment_date, 999999);

v_condition_met := CASE v_condition.operator
WHEN 'gt' THEN v_days_since > COALESCE(v_condition.value_numeric, 0)::int
WHEN 'gte' THEN v_days_since >= COALESCE(v_condition.value_numeric, 0)::int
WHEN 'lt' THEN v_days_since < COALESCE(v_condition.value_numeric, 0)::int
WHEN 'between' THEN v_days_since >= COALESCE(v_condition.value_numeric, 0)::int AND v_days_since <= COALESCE(v_condition.value_numeric_max, 999999)::int
ELSE false
END;

WHEN 'invoice_amount_threshold' THEN
SELECT count(*) INTO v_count
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > COALESCE(v_condition.value_numeric, 0);

v_condition_met := v_count > 0;

WHEN 'overdue_percentage' THEN
DECLARE
v_total_invoices int;
v_overdue_invoices int;
v_pct numeric;
BEGIN
SELECT count(*) INTO v_total_invoices
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0;

SELECT count(*) INTO v_overdue_invoices
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0
AND i.due_date < CURRENT_DATE;

IF v_total_invoices > 0 THEN
v_pct := (v_overdue_invoices::numeric / v_total_invoices::numeric) * 100;
ELSE
v_pct := 0;
END IF;

v_condition_met := CASE v_condition.operator
WHEN 'gt' THEN v_pct > COALESCE(v_condition.value_numeric, 0)
WHEN 'gte' THEN v_pct >= COALESCE(v_condition.value_numeric, 0)
WHEN 'lt' THEN v_pct < COALESCE(v_condition.value_numeric, 0)
WHEN 'between' THEN v_pct >= COALESCE(v_condition.value_numeric, 0) AND v_pct <= COALESCE(v_condition.value_numeric_max, 100)
ELSE false
END;
END;

WHEN 'payment_amount_drop' THEN
DECLARE
v_avg_monthly numeric;
v_recent_monthly numeric;
BEGIN
-- Average monthly payment over last 6 months (excluding last month)
SELECT COALESCE(SUM(p.payment_amount) / NULLIF(count(DISTINCT date_trunc('month', COALESCE(p.effective_date, p.doc_date, p.created_at)::date)), 0), 0)
INTO v_avg_monthly
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date >= CURRENT_DATE - interval '7 months'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date < date_trunc('month', CURRENT_DATE);

-- Last month's payments
SELECT COALESCE(SUM(p.payment_amount), 0) INTO v_recent_monthly
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date < date_trunc('month', CURRENT_DATE);

IF v_avg_monthly > 0 THEN
IF v_condition.operator = 'pct_drop' THEN
v_condition_met := ((v_avg_monthly - v_recent_monthly) / v_avg_monthly * 100) >= COALESCE(v_condition.value_numeric, 20);
ELSE
v_condition_met := (v_avg_monthly - v_recent_monthly) > COALESCE(v_condition.value_numeric, 0);
END IF;
ELSE
v_condition_met := false;
END IF;
END;

WHEN 'payment_pattern_deviation' THEN
DECLARE
v_avg_day numeric;
v_recent_day numeric;
v_deviation numeric;
BEGIN
-- Average payment day of month over last 6 months
SELECT AVG(EXTRACT(day FROM COALESCE(p.effective_date, p.doc_date, p.created_at)::date))
INTO v_avg_day
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date >= CURRENT_DATE - interval '6 months'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date < date_trunc('month', CURRENT_DATE);

-- Most recent payment day
SELECT EXTRACT(day FROM MAX(COALESCE(p.effective_date, p.doc_date, p.created_at)::date))
INTO v_recent_day
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date >= date_trunc('month', CURRENT_DATE) - interval '1 month';

IF v_avg_day IS NOT NULL AND v_recent_day IS NOT NULL THEN
v_deviation := ABS(v_recent_day - v_avg_day);
v_condition_met := v_deviation > COALESCE(v_condition.value_numeric, 3);
ELSE
v_condition_met := false;
END IF;
END;

WHEN 'payment_frequency_change' THEN
DECLARE
v_old_avg_interval numeric;
v_recent_interval numeric;
BEGIN
-- Average days between payments in the 3-6 month window
WITH payment_dates AS (
SELECT COALESCE(p.effective_date, p.doc_date, p.created_at)::date as pdate
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment'
AND COALESCE(p.effective_date, p.doc_date, p.created_at)::date >= CURRENT_DATE - interval '6 months'
ORDER BY pdate
),
intervals AS (
SELECT pdate - LAG(pdate) OVER (ORDER BY pdate) as gap
FROM payment_dates
)
SELECT AVG(gap) INTO v_old_avg_interval FROM intervals WHERE gap IS NOT NULL;

-- Most recent interval
WITH recent_payments AS (
SELECT COALESCE(p.effective_date, p.doc_date, p.created_at)::date as pdate
FROM acumatica_payments p
WHERE p.customer_id = v_customer.cust_id
AND p.type = 'Payment'
ORDER BY pdate DESC
LIMIT 2
)
SELECT MAX(pdate) - MIN(pdate) INTO v_recent_interval FROM recent_payments;

IF v_old_avg_interval IS NOT NULL AND v_old_avg_interval > 0 AND v_recent_interval IS NOT NULL THEN
v_condition_met := ABS(v_recent_interval - v_old_avg_interval) > COALESCE(v_condition.value_numeric, 7);
ELSE
v_condition_met := false;
END IF;
END;

ELSE
v_condition_met := false;
END CASE;

IF v_condition_met THEN
v_any_condition_met := true;
ELSE
v_all_conditions_met := false;
END IF;
END LOOP;

-- Check if conditions matched based on logic operator
v_matched := CASE v_rule.logic_operator
WHEN 'OR' THEN v_any_condition_met
ELSE v_all_conditions_met
END;

IF v_matched THEN
-- Gather open invoices for this customer
SELECT array_agg(i.reference_number) INTO v_invoice_ids
FROM acumatica_invoices i
WHERE i.customer = v_customer.cust_id
AND i.status IN ('Open', 'open')
AND i.balance > 0;

IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
-- Check for existing ticket
SELECT ct.id INTO v_existing_ticket_id
FROM collection_tickets ct
WHERE ct.customer_id = v_customer.cust_id
AND ct.assigned_collector_id = v_rule.assigned_collector_id
AND ct.status != 'closed'
LIMIT 1;

IF v_existing_ticket_id IS NULL THEN
INSERT INTO collection_tickets (customer_id, customer_name, organization_id, assigned_collector_id, status, ticket_type, priority, notes)
VALUES (
v_customer.cust_id,
COALESCE((SELECT c.customer_name FROM acumatica_customers c
           WHERE c.customer_id = v_customer.cust_id AND c.organization_id = v_org_id LIMIT 1), v_customer.cust_id),
v_org_id,
v_rule.assigned_collector_id,
'open',
COALESCE((SELECT name FROM ticket_type_options WHERE id = v_rule.ticket_type_id), 'overdue payment'),
COALESCE(v_rule.priority, 'medium'),
COALESCE(v_rule.description, 'Auto-created by rule: ' || COALESCE(v_rule.rule_name, 'Unnamed'))
)
RETURNING id INTO v_new_ticket_id;

INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_new_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

INSERT INTO ticket_activity_log (ticket_id, activity_type, description)
VALUES (v_new_ticket_id, 'created', 'Auto-created by rule "' || COALESCE(v_rule.rule_name, 'Unnamed') || '" with ' || array_length(v_invoice_ids, 1) || ' invoice(s)');

v_tickets_created := v_tickets_created + 1;
v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
ELSE
-- Add new invoices to existing ticket
INSERT INTO invoice_assignments (invoice_reference_number, ticket_id, assigned_collector_id, assigned_by, notes)
SELECT unnest(v_invoice_ids), v_existing_ticket_id, v_rule.assigned_collector_id, v_rule.created_by, 'Auto-assigned by rule'
ON CONFLICT (invoice_reference_number) DO NOTHING;

v_tickets_updated := v_tickets_updated + 1;
END IF;
END IF;
END IF;

END LOOP;

EXCEPTION WHEN OTHERS THEN
v_errors := array_append(v_errors, 'Rule ' || v_rule.id || ': ' || SQLERRM);
END;
END LOOP;

IF array_length(v_errors, 1) > 0 THEN
  RAISE EXCEPTION 'process_auto_ticket_rules: % of % rules failed: %',
    array_length(v_errors, 1), v_processed, array_to_string(v_errors, ' | ');
END IF;

RETURN jsonb_build_object(
'processed', v_processed,
'tickets_created', v_tickets_created,
'tickets_updated', v_tickets_updated,
'invoices_added', v_invoices_added,
'errors', v_errors
);
END;
$function$
;
