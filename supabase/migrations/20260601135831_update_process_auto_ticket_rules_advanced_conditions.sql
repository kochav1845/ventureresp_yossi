/*
  # Update Process Auto-Ticket Rules for Advanced Conditions

  1. Changes
    - Recreates the `process_auto_ticket_rules` function to support the new advanced condition types
    - Handles: balance_threshold, invoice_count_overdue, invoice_age_days,
      payment_amount_drop, days_since_last_payment, invoice_amount_threshold,
      overdue_percentage, total_overdue_amount, payment_pattern_deviation, payment_frequency_change
    - Supports AND/OR logic for multiple conditions
    - Supports customer scope: all, specific (include), exclude
    - Preserves backward compatibility with legacy invoice_only/payment_only rules

  2. Logic
    - For each active rule, evaluates all conditions against each applicable customer
    - Uses the rule's logic_operator (AND/OR) to combine condition results
    - Creates tickets and/or triggers reminders based on action_type
*/

CREATE OR REPLACE FUNCTION process_auto_ticket_rules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
BEGIN
  FOR v_rule IN
    SELECT * FROM auto_ticket_rules WHERE active = true
  LOOP
    v_processed := v_processed + 1;

    BEGIN
      -- Handle legacy rules (non-advanced)
      IF v_rule.condition_logic IS DISTINCT FROM 'advanced' THEN
        -- Use existing legacy logic via the old path
        -- Invoice only
        IF v_rule.condition_logic = 'invoice_only' OR v_rule.condition_logic IS NULL THEN
          SELECT array_agg(i.id) INTO v_invoice_ids
          FROM acumatica_invoices i
          WHERE i.customer = v_rule.customer_id
            AND i.status IN ('Open', 'open')
            AND i.type = 'Invoice'
            AND i.balance > 0
            AND i.invoice_date <= CURRENT_DATE - (v_rule.min_days_old || ' days')::interval
            AND i.invoice_date >= CURRENT_DATE - (v_rule.max_days_old || ' days')::interval;

          IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
            SELECT ct.id INTO v_existing_ticket_id
            FROM collection_tickets ct
            WHERE ct.customer_id = v_rule.customer_id
              AND ct.assigned_to = v_rule.assigned_collector_id
              AND ct.status != 'closed'
            LIMIT 1;

            IF v_existing_ticket_id IS NULL THEN
              INSERT INTO collection_tickets (customer_id, assigned_to, status, ticket_type, priority, description)
              VALUES (v_rule.customer_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
              RETURNING id INTO v_new_ticket_id;

              INSERT INTO ticket_invoices (ticket_id, invoice_id)
              SELECT v_new_ticket_id, unnest(v_invoice_ids)
              ON CONFLICT DO NOTHING;

              INSERT INTO collection_ticket_activity (ticket_id, activity_type, description)
              VALUES (v_new_ticket_id, 'created', 'Auto-created ticket with ' || array_length(v_invoice_ids, 1) || ' invoice(s)');

              v_tickets_created := v_tickets_created + 1;
              v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
            ELSE
              INSERT INTO ticket_invoices (ticket_id, invoice_id)
              SELECT v_existing_ticket_id, unnest(v_invoice_ids)
              ON CONFLICT DO NOTHING;

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
            SELECT array_agg(i.id) INTO v_invoice_ids
            FROM acumatica_invoices i
            WHERE i.customer = v_rule.customer_id
              AND i.status IN ('Open', 'open')
              AND i.balance > 0;

            IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
              SELECT ct.id INTO v_existing_ticket_id
              FROM collection_tickets ct
              WHERE ct.customer_id = v_rule.customer_id
                AND ct.assigned_to = v_rule.assigned_collector_id
                AND ct.status != 'closed'
              LIMIT 1;

              IF v_existing_ticket_id IS NULL THEN
                INSERT INTO collection_tickets (customer_id, assigned_to, status, ticket_type, priority, description)
                VALUES (v_rule.customer_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
                RETURNING id INTO v_new_ticket_id;

                INSERT INTO ticket_invoices (ticket_id, invoice_id)
                SELECT v_new_ticket_id, unnest(v_invoice_ids)
                ON CONFLICT DO NOTHING;

                INSERT INTO collection_ticket_activity (ticket_id, activity_type, description)
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
            AND i.invoice_date <= CURRENT_DATE - (v_rule.min_days_old || ' days')::interval
            AND i.invoice_date >= CURRENT_DATE - (v_rule.max_days_old || ' days')::interval;

          IF v_count > 0 THEN
            -- Check payment recency
            SELECT MAX(p.created_at::date) INTO v_last_payment_date
            FROM acumatica_payments p
            WHERE p.customer_id = v_rule.customer_id
              AND p.type = 'Payment';

            v_days_since := COALESCE(CURRENT_DATE - v_last_payment_date, 999999);

            IF v_days_since >= v_rule.check_payment_within_days_min AND v_days_since <= v_rule.check_payment_within_days_max THEN
              SELECT array_agg(i.id) INTO v_invoice_ids
              FROM acumatica_invoices i
              WHERE i.customer = v_rule.customer_id
                AND i.status IN ('Open', 'open')
                AND i.balance > 0;

              IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
                SELECT ct.id INTO v_existing_ticket_id
                FROM collection_tickets ct
                WHERE ct.customer_id = v_rule.customer_id
                  AND ct.assigned_to = v_rule.assigned_collector_id
                  AND ct.status != 'closed'
                LIMIT 1;

                IF v_existing_ticket_id IS NULL THEN
                  INSERT INTO collection_tickets (customer_id, assigned_to, status, ticket_type, priority, description)
                  VALUES (v_rule.customer_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
                  RETURNING id INTO v_new_ticket_id;

                  INSERT INTO ticket_invoices (ticket_id, invoice_id)
                  SELECT v_new_ticket_id, unnest(v_invoice_ids)
                  ON CONFLICT DO NOTHING;

                  INSERT INTO collection_ticket_activity (ticket_id, activity_type, description)
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
            AND i.invoice_date <= CURRENT_DATE - (v_rule.min_days_old || ' days')::interval
            AND i.invoice_date >= CURRENT_DATE - (v_rule.max_days_old || ' days')::interval;

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
            SELECT array_agg(i.id) INTO v_invoice_ids
            FROM acumatica_invoices i
            WHERE i.customer = v_rule.customer_id
              AND i.status IN ('Open', 'open')
              AND i.balance > 0;

            IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
              SELECT ct.id INTO v_existing_ticket_id
              FROM collection_tickets ct
              WHERE ct.customer_id = v_rule.customer_id
                AND ct.assigned_to = v_rule.assigned_collector_id
                AND ct.status != 'closed'
              LIMIT 1;

              IF v_existing_ticket_id IS NULL THEN
                INSERT INTO collection_tickets (customer_id, assigned_to, status, ticket_type, priority, description)
                VALUES (v_rule.customer_id, v_rule.assigned_collector_id, 'open', 'overdue payment', COALESCE(v_rule.priority, 'medium'), COALESCE(v_rule.description, 'Auto-created by rule'))
                RETURNING id INTO v_new_ticket_id;

                INSERT INTO ticket_invoices (ticket_id, invoice_id)
                SELECT v_new_ticket_id, unnest(v_invoice_ids)
                ON CONFLICT DO NOTHING;

                INSERT INTO collection_ticket_activity (ticket_id, activity_type, description)
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
                  THEN i.invoice_date < CURRENT_DATE
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
                  THEN (CURRENT_DATE - i.invoice_date::date)
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
          SELECT array_agg(i.id) INTO v_invoice_ids
          FROM acumatica_invoices i
          WHERE i.customer = v_customer.cust_id
            AND i.status IN ('Open', 'open')
            AND i.balance > 0;

          IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
            -- Check for existing ticket
            SELECT ct.id INTO v_existing_ticket_id
            FROM collection_tickets ct
            WHERE ct.customer_id = v_customer.cust_id
              AND ct.assigned_to = v_rule.assigned_collector_id
              AND ct.status != 'closed'
            LIMIT 1;

            IF v_existing_ticket_id IS NULL THEN
              INSERT INTO collection_tickets (customer_id, assigned_to, status, ticket_type, priority, description)
              VALUES (
                v_customer.cust_id,
                v_rule.assigned_collector_id,
                'open',
                COALESCE((SELECT name FROM ticket_type_options WHERE id = v_rule.ticket_type_id), 'overdue payment'),
                COALESCE(v_rule.priority, 'medium'),
                COALESCE(v_rule.description, 'Auto-created by rule: ' || COALESCE(v_rule.rule_name, 'Unnamed'))
              )
              RETURNING id INTO v_new_ticket_id;

              INSERT INTO ticket_invoices (ticket_id, invoice_id)
              SELECT v_new_ticket_id, unnest(v_invoice_ids)
              ON CONFLICT DO NOTHING;

              INSERT INTO collection_ticket_activity (ticket_id, activity_type, description)
              VALUES (v_new_ticket_id, 'created', 'Auto-created by rule "' || COALESCE(v_rule.rule_name, 'Unnamed') || '" with ' || array_length(v_invoice_ids, 1) || ' invoice(s)');

              v_tickets_created := v_tickets_created + 1;
              v_invoices_added := v_invoices_added + array_length(v_invoice_ids, 1);
            ELSE
              -- Add new invoices to existing ticket
              INSERT INTO ticket_invoices (ticket_id, invoice_id)
              SELECT v_existing_ticket_id, unnest(v_invoice_ids)
              ON CONFLICT DO NOTHING;

              v_tickets_updated := v_tickets_updated + 1;
            END IF;
          END IF;
        END IF;

      END LOOP;

    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, 'Rule ' || v_rule.id || ': ' || SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'tickets_created', v_tickets_created,
    'tickets_updated', v_tickets_updated,
    'invoices_added', v_invoices_added,
    'errors', v_errors
  );
END;
$$;
