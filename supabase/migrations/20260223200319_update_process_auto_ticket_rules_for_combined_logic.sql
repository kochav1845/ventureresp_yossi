/*
  # Update process_auto_ticket_rules to handle combined AND/OR logic

  1. Changes
    - Reads new `condition_logic` column instead of `rule_type`
    - 'invoice_only': Same as before - finds invoices by age
    - 'payment_only': Same as before - checks payment recency
    - 'both_and': Finds invoices by age, then filters out if payment recency doesn't match
    - 'both_or': Finds invoices by age PLUS all open invoices if payment is overdue

  2. Logic Details
    - AND: Start with invoice age matches, but only keep them if payment recency also matches
    - OR: Combine invoice age matches with all open invoices (if payment recency matches)
*/

CREATE OR REPLACE FUNCTION process_auto_ticket_rules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_invoice RECORD;
  v_customer RECORD;
  v_ticket RECORD;
  v_today date := CURRENT_DATE;
  v_min_date date;
  v_max_date date;
  v_invoice_refs text[];
  v_invoice_age_refs text[];
  v_payment_invoice_refs text[];
  v_existing_invoice_refs text[];
  v_new_invoice_refs text[];
  v_last_payment_date date;
  v_days_since_payment int;
  v_payment_match boolean;
  v_invoice_count int;
  v_new_invoice_count int;
  v_results jsonb := jsonb_build_object(
    'processed', 0,
    'tickets_created', 0,
    'tickets_updated', 0,
    'invoices_added', 0,
    'errors', '[]'::jsonb
  );
BEGIN
  FOR v_rule IN 
    SELECT * FROM auto_ticket_rules WHERE active = true
  LOOP
    BEGIN
      v_results := jsonb_set(v_results, '{processed}', to_jsonb((v_results->>'processed')::int + 1));
      v_invoice_refs := ARRAY[]::text[];
      v_invoice_age_refs := ARRAY[]::text[];
      v_payment_invoice_refs := ARRAY[]::text[];
      v_payment_match := false;
      
      IF v_rule.condition_logic IN ('invoice_only', 'both_and', 'both_or') THEN
        v_min_date := v_today - (v_rule.max_days_old || ' days')::interval;
        v_max_date := v_today - (v_rule.min_days_old || ' days')::interval;
        
        FOR v_invoice IN
          SELECT reference_number
          FROM acumatica_invoices
          WHERE customer = v_rule.customer_id
            AND type = 'Invoice'
            AND balance > 0
            AND status IN ('Open', 'open')
            AND date >= v_min_date
            AND date <= v_max_date
        LOOP
          v_invoice_age_refs := array_append(v_invoice_age_refs, v_invoice.reference_number);
        END LOOP;
      END IF;

      IF v_rule.condition_logic IN ('payment_only', 'both_and', 'both_or') THEN
        SELECT array_agg(reference_number) INTO v_payment_invoice_refs
        FROM acumatica_invoices
        WHERE customer = v_rule.customer_id
          AND type = 'Invoice'
          AND balance > 0
          AND status IN ('Open', 'open');
        
        v_payment_invoice_refs := COALESCE(v_payment_invoice_refs, ARRAY[]::text[]);

        IF array_length(v_payment_invoice_refs, 1) > 0 THEN
          SELECT MAX(application_date) INTO v_last_payment_date
          FROM acumatica_payments
          WHERE customer_id = v_rule.customer_id
            AND type = 'Payment'
            AND application_date IS NOT NULL;
          
          IF v_last_payment_date IS NOT NULL THEN
            v_days_since_payment := v_today - v_last_payment_date;
          ELSE
            v_days_since_payment := 999999;
          END IF;
          
          IF v_days_since_payment >= v_rule.check_payment_within_days_min AND 
             v_days_since_payment <= v_rule.check_payment_within_days_max THEN
            v_payment_match := true;
          END IF;
        END IF;
      END IF;

      IF v_rule.condition_logic = 'invoice_only' THEN
        v_invoice_refs := v_invoice_age_refs;

      ELSIF v_rule.condition_logic = 'payment_only' THEN
        IF v_payment_match THEN
          v_invoice_refs := v_payment_invoice_refs;
        ELSE
          v_invoice_refs := ARRAY[]::text[];
        END IF;

      ELSIF v_rule.condition_logic = 'both_and' THEN
        IF v_payment_match AND COALESCE(array_length(v_invoice_age_refs, 1), 0) > 0 THEN
          v_invoice_refs := v_invoice_age_refs;
        ELSE
          v_invoice_refs := ARRAY[]::text[];
        END IF;

      ELSIF v_rule.condition_logic = 'both_or' THEN
        IF v_payment_match THEN
          SELECT array_agg(DISTINCT ref) INTO v_invoice_refs
          FROM (
            SELECT unnest(v_invoice_age_refs) AS ref
            UNION
            SELECT unnest(v_payment_invoice_refs) AS ref
          ) combined;
          v_invoice_refs := COALESCE(v_invoice_refs, v_invoice_age_refs);
        ELSE
          v_invoice_refs := v_invoice_age_refs;
        END IF;
      END IF;

      v_invoice_count := COALESCE(array_length(v_invoice_refs, 1), 0);
      CONTINUE WHEN v_invoice_count = 0;

      SELECT * INTO v_ticket
      FROM collection_tickets
      WHERE customer_id = v_rule.customer_id
        AND assigned_collector_id = v_rule.assigned_collector_id
        AND status NOT IN ('closed')
      ORDER BY created_at DESC
      LIMIT 1;
      
      IF FOUND THEN
        SELECT array_agg(invoice_reference_number) INTO v_existing_invoice_refs
        FROM ticket_invoices
        WHERE ticket_id = v_ticket.id;
        
        SELECT array_agg(ref) INTO v_new_invoice_refs
        FROM unnest(v_invoice_refs) AS ref
        WHERE ref != ALL(COALESCE(v_existing_invoice_refs, ARRAY[]::text[]));
        
        v_new_invoice_count := COALESCE(array_length(v_new_invoice_refs, 1), 0);
        
        IF v_new_invoice_count > 0 THEN
          INSERT INTO ticket_invoices (ticket_id, invoice_reference_number, added_by)
          SELECT v_ticket.id, ref, v_rule.assigned_collector_id
          FROM unnest(v_new_invoice_refs) AS ref;
          
          INSERT INTO ticket_activity_log (ticket_id, created_by, activity_type, description)
          VALUES (
            v_ticket.id,
            v_rule.assigned_collector_id,
            'invoice_added',
            'Auto-rule added ' || v_new_invoice_count || ' invoice(s)'
          );
          
          v_results := jsonb_set(v_results, '{tickets_updated}', to_jsonb((v_results->>'tickets_updated')::int + 1));
          v_results := jsonb_set(v_results, '{invoices_added}', to_jsonb((v_results->>'invoices_added')::int + v_new_invoice_count));
        END IF;
      ELSE
        SELECT customer_name INTO v_customer
        FROM acumatica_customers
        WHERE customer_id = v_rule.customer_id
        LIMIT 1;
        
        INSERT INTO collection_tickets (
          customer_id,
          customer_name,
          assigned_collector_id,
          status,
          ticket_type,
          created_by,
          priority
        )
        VALUES (
          v_rule.customer_id,
          COALESCE(v_customer.customer_name, v_rule.customer_id),
          v_rule.assigned_collector_id,
          'open',
          'overdue payment',
          v_rule.assigned_collector_id,
          'medium'
        )
        RETURNING * INTO v_ticket;
        
        INSERT INTO ticket_invoices (ticket_id, invoice_reference_number, added_by)
        SELECT v_ticket.id, ref, v_rule.assigned_collector_id
        FROM unnest(v_invoice_refs) AS ref;
        
        INSERT INTO ticket_activity_log (ticket_id, created_by, activity_type, description)
        VALUES (
          v_ticket.id,
          v_rule.assigned_collector_id,
          'created',
          'Auto-created ticket with ' || v_invoice_count || ' invoice(s)'
        );
        
        v_results := jsonb_set(v_results, '{tickets_created}', to_jsonb((v_results->>'tickets_created')::int + 1));
        v_results := jsonb_set(v_results, '{invoices_added}', to_jsonb((v_results->>'invoices_added')::int + v_invoice_count));
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_results := jsonb_set(
        v_results, 
        '{errors}', 
        (v_results->'errors') || to_jsonb(ARRAY['Rule ' || v_rule.id || ': ' || SQLERRM])
      );
    END;
  END LOOP;
  
  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION process_auto_ticket_rules() TO postgres, service_role;
