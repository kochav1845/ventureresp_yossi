/*
  # Fix Auto Ticket Rules Function - Handle NULL Description

  1. Fixes the issue where array_length can return NULL
  2. Uses COALESCE to ensure description is never NULL
  3. Adds better error handling
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
  v_existing_invoice_refs text[];
  v_new_invoice_refs text[];
  v_last_payment_date date;
  v_days_since_payment int;
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
  -- Process each active rule
  FOR v_rule IN 
    SELECT * FROM auto_ticket_rules WHERE active = true
  LOOP
    BEGIN
      v_results := jsonb_set(v_results, '{processed}', to_jsonb((v_results->>'processed')::int + 1));
      v_invoice_refs := ARRAY[]::text[];
      
      -- Process based on rule type
      IF v_rule.rule_type = 'invoice_age' THEN
        -- Calculate date range for invoice age
        v_min_date := v_today - (v_rule.max_days_old || ' days')::interval;
        v_max_date := v_today - (v_rule.min_days_old || ' days')::interval;
        
        -- Find invoices within the age range
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
          v_invoice_refs := array_append(v_invoice_refs, v_invoice.reference_number);
        END LOOP;
        
      ELSIF v_rule.rule_type = 'payment_recency' THEN
        -- Check if customer has open invoices
        SELECT array_agg(reference_number) INTO v_invoice_refs
        FROM acumatica_invoices
        WHERE customer = v_rule.customer_id
          AND type = 'Invoice'
          AND balance > 0
          AND status IN ('Open', 'open');
        
        -- Only proceed if there are open invoices
        IF v_invoice_refs IS NOT NULL AND array_length(v_invoice_refs, 1) > 0 THEN
          -- Find last payment date
          SELECT MAX(application_date) INTO v_last_payment_date
          FROM acumatica_payments
          WHERE customer_id = v_rule.customer_id
            AND type = 'Payment'
            AND application_date IS NOT NULL;
          
          -- Calculate days since last payment
          IF v_last_payment_date IS NOT NULL THEN
            v_days_since_payment := v_today - v_last_payment_date;
          ELSE
            v_days_since_payment := 999999; -- No payment found
          END IF;
          
          -- Check if days since payment is within the rule's range
          IF v_days_since_payment < v_rule.check_payment_within_days_min OR 
             v_days_since_payment > v_rule.check_payment_within_days_max THEN
            v_invoice_refs := ARRAY[]::text[]; -- Clear invoices if rule doesn't match
          END IF;
        ELSE
          v_invoice_refs := ARRAY[]::text[];
        END IF;
      END IF;
      
      -- Get invoice count safely
      v_invoice_count := COALESCE(array_length(v_invoice_refs, 1), 0);
      
      -- Skip if no invoices match the rule
      CONTINUE WHEN v_invoice_count = 0;
      
      -- Check for existing active ticket for this customer and collector
      SELECT * INTO v_ticket
      FROM collection_tickets
      WHERE customer_id = v_rule.customer_id
        AND assigned_collector_id = v_rule.assigned_collector_id
        AND active = true
      ORDER BY created_at DESC
      LIMIT 1;
      
      IF FOUND THEN
        -- Update existing ticket
        -- Get existing invoice references
        SELECT array_agg(invoice_reference_number) INTO v_existing_invoice_refs
        FROM ticket_invoices
        WHERE ticket_id = v_ticket.id;
        
        -- Find new invoices to add
        SELECT array_agg(ref) INTO v_new_invoice_refs
        FROM unnest(v_invoice_refs) AS ref
        WHERE ref != ALL(COALESCE(v_existing_invoice_refs, ARRAY[]::text[]));
        
        v_new_invoice_count := COALESCE(array_length(v_new_invoice_refs, 1), 0);
        
        -- Add new invoices if any
        IF v_new_invoice_count > 0 THEN
          INSERT INTO ticket_invoices (ticket_id, invoice_reference_number, added_by)
          SELECT v_ticket.id, ref, v_rule.assigned_collector_id
          FROM unnest(v_new_invoice_refs) AS ref;
          
          -- Log the activity
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
        -- Create new ticket
        -- Get customer name
        SELECT customer_name INTO v_customer
        FROM acumatica_customers
        WHERE customer_id = v_rule.customer_id
        LIMIT 1;
        
        -- Insert new ticket
        INSERT INTO collection_tickets (
          customer_id,
          customer_name,
          assigned_collector_id,
          status,
          ticket_type,
          active,
          created_by,
          priority
        )
        VALUES (
          v_rule.customer_id,
          COALESCE(v_customer.customer_name, v_rule.customer_id),
          v_rule.assigned_collector_id,
          'open',
          'overdue payment',
          true,
          v_rule.assigned_collector_id,
          'medium'
        )
        RETURNING * INTO v_ticket;
        
        -- Add invoices to the ticket
        INSERT INTO ticket_invoices (ticket_id, invoice_reference_number, added_by)
        SELECT v_ticket.id, ref, v_rule.assigned_collector_id
        FROM unnest(v_invoice_refs) AS ref;
        
        -- Log the creation
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_auto_ticket_rules() TO postgres, service_role;
