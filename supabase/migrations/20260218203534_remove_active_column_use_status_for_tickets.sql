/*
  # Remove Active Column from Collection Tickets

  1. Overview
    - The `active` boolean column is being removed in favor of using the `status` field
    - Tickets that were `active = false` but not already `closed` will be set to `closed`
    - The ticketing system already separates open vs closed tickets via tabs, making the `active` flag redundant

  2. Changes
    - Set status to 'closed' for any tickets where active = false and status != 'closed'
    - Recreate `collector_assignment_details` view without the `active` filter
    - Drop obsolete RLS policies that reference `active`
    - Rename admin policy to remove 'active status' reference
    - Recreate `process_auto_ticket_rules` function to use status instead of active
    - Drop the partial index on `ticket_type` that filtered by `active`
    - Drop the `active` column from `collection_tickets`

  3. Security
    - Existing collector and permission-based policies remain unchanged
    - Admin policy renamed to remove 'active status' wording

  4. Important Notes
    - All previously deactivated (active=false) tickets are now marked as 'closed'
    - The 'closed' tab in the ticketing system shows these tickets
    - No data is lost - tickets are status-transitioned, not deleted
*/

-- Step 1: Convert active=false tickets to status='closed'
UPDATE collection_tickets
SET status = 'closed'
WHERE active = false AND status != 'closed';

-- Step 2: Recreate the collector_assignment_details view without active filter
DROP VIEW IF EXISTS collector_assignment_details CASCADE;

CREATE VIEW collector_assignment_details AS
SELECT
  ia.id as assignment_id,
  ia.invoice_reference_number,
  ia.assigned_collector_id,
  ia.ticket_id,
  ia.assigned_at,
  ia.assigned_by,
  ia.notes as assignment_notes,
  inv.customer,
  COALESCE(ct.customer_name, inv.customer_name) as customer_name,
  inv.date,
  inv.due_date,
  inv.amount,
  inv.balance,
  inv.status as invoice_status,
  inv.description,
  inv.color_status,
  inv.promise_date as invoice_promise_date,
  ct.id as ticket_id_full,
  ct.ticket_number,
  ct.customer_id as ticket_customer_id,
  ct.status as ticket_status,
  ct.priority as ticket_priority,
  ct.ticket_type,
  ct.due_date as ticket_due_date,
  ct.promise_date as ticket_promise_date,
  up.full_name as collector_name,
  up.email as collector_email,
  creator.full_name as assigned_by_name,
  creator.email as assigned_by_email
FROM invoice_assignments ia
LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id;

GRANT SELECT ON collector_assignment_details TO authenticated;

-- Step 3: Drop obsolete RLS policies referencing active
DROP POLICY IF EXISTS "Collectors can view their active assigned tickets" ON collection_tickets;
DROP POLICY IF EXISTS "Collectors can update their active assigned tickets" ON collection_tickets;
DROP POLICY IF EXISTS "Admins can manage all tickets including active status" ON collection_tickets;

CREATE POLICY "Admins can manage all tickets"
  ON collection_tickets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Step 4: Drop the partial index that uses active column
DROP INDEX IF EXISTS idx_collection_tickets_ticket_type_filter;

-- Step 5: Recreate index without active filter
CREATE INDEX IF NOT EXISTS idx_collection_tickets_ticket_type
  ON collection_tickets(ticket_type);

-- Step 6: Update process_auto_ticket_rules to use status instead of active
CREATE OR REPLACE FUNCTION process_auto_ticket_rules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule RECORD;
  v_invoice RECORD;
  v_ticket RECORD;
  v_invoice_refs text[];
  v_existing_invoice_refs text[];
  v_new_invoice_refs text[];
  v_today date := CURRENT_DATE;
  v_min_date date;
  v_max_date date;
  v_last_payment_date date;
  v_days_since_payment int;
  v_results jsonb;
  v_ticket_number text;
  v_next_num int;
BEGIN
  v_results := jsonb_build_object(
    'processed', 0,
    'tickets_created', 0,
    'tickets_updated', 0,
    'invoices_added', 0,
    'errors', '[]'::jsonb
  );

  FOR v_rule IN 
    SELECT * FROM auto_ticket_rules WHERE active = true
  LOOP
    BEGIN
      v_results := jsonb_set(v_results, '{processed}', to_jsonb((v_results->>'processed')::int + 1));
      v_invoice_refs := ARRAY[]::text[];
      
      IF v_rule.rule_type = 'invoice_age' THEN
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
          v_invoice_refs := array_append(v_invoice_refs, v_invoice.reference_number);
        END LOOP;
        
      ELSIF v_rule.rule_type = 'payment_recency' THEN
        SELECT array_agg(reference_number) INTO v_invoice_refs
        FROM acumatica_invoices
        WHERE customer = v_rule.customer_id
          AND type = 'Invoice'
          AND balance > 0
          AND status IN ('Open', 'open');
        
        IF v_invoice_refs IS NOT NULL AND array_length(v_invoice_refs, 1) > 0 THEN
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
          
          IF v_days_since_payment < v_rule.check_payment_within_days_min OR 
             v_days_since_payment > v_rule.check_payment_within_days_max THEN
            v_invoice_refs := ARRAY[]::text[];
          END IF;
        END IF;
      END IF;
      
      CONTINUE WHEN v_invoice_refs IS NULL OR array_length(v_invoice_refs, 1) = 0;
      
      SELECT * INTO v_ticket
      FROM collection_tickets
      WHERE customer_id = v_rule.customer_id
        AND assigned_collector_id = v_rule.assigned_collector_id
        AND status != 'closed'
      ORDER BY created_at DESC
      LIMIT 1;
      
      IF FOUND THEN
        SELECT array_agg(invoice_reference_number) INTO v_existing_invoice_refs
        FROM ticket_invoices
        WHERE ticket_id = v_ticket.id;
        
        SELECT array_agg(ref) INTO v_new_invoice_refs
        FROM unnest(v_invoice_refs) AS ref
        WHERE ref != ALL(COALESCE(v_existing_invoice_refs, ARRAY[]::text[]));
        
        IF v_new_invoice_refs IS NOT NULL AND array_length(v_new_invoice_refs, 1) > 0 THEN
          INSERT INTO ticket_invoices (ticket_id, invoice_reference_number)
          SELECT v_ticket.id, unnest(v_new_invoice_refs)
          ON CONFLICT DO NOTHING;
          
          INSERT INTO invoice_assignments (invoice_reference_number, assigned_collector_id, ticket_id, assigned_by, notes)
          SELECT unnest(v_new_invoice_refs), v_rule.assigned_collector_id, v_ticket.id, v_rule.created_by,
                 'Auto-assigned by rule: ' || COALESCE(v_rule.rule_name, 'unnamed')
          ON CONFLICT (invoice_reference_number, assigned_collector_id) DO UPDATE
          SET ticket_id = v_ticket.id;
          
          v_results := jsonb_set(v_results, '{tickets_updated}', to_jsonb((v_results->>'tickets_updated')::int + 1));
          v_results := jsonb_set(v_results, '{invoices_added}', to_jsonb((v_results->>'invoices_added')::int + array_length(v_new_invoice_refs, 1)));
        END IF;
      ELSE
        SELECT COALESCE(MAX(SUBSTRING(ticket_number FROM 4)::int), 0) + 1 INTO v_next_num
        FROM collection_tickets;
        
        v_ticket_number := 'TKT' || LPAD(v_next_num::text, 6, '0');
        
        INSERT INTO collection_tickets (
          customer_id,
          customer_name,
          assigned_collector_id,
          ticket_number,
          status,
          priority,
          ticket_type,
          notes
        )
        VALUES (
          v_rule.customer_id,
          v_rule.customer_name,
          v_rule.assigned_collector_id,
          v_ticket_number,
          'open',
          COALESCE(v_rule.default_priority, 'medium'),
          COALESCE(v_rule.default_ticket_type, 'overdue_payment'),
          COALESCE(v_rule.description, 'Auto-created by rule: ' || COALESCE(v_rule.rule_name, 'unnamed'))
        )
        RETURNING * INTO v_ticket;
        
        INSERT INTO ticket_invoices (ticket_id, invoice_reference_number)
        SELECT v_ticket.id, unnest(v_invoice_refs)
        ON CONFLICT DO NOTHING;
        
        INSERT INTO invoice_assignments (invoice_reference_number, assigned_collector_id, ticket_id, assigned_by, notes)
        SELECT unnest(v_invoice_refs), v_rule.assigned_collector_id, v_ticket.id, v_rule.created_by,
               'Auto-assigned by rule: ' || COALESCE(v_rule.rule_name, 'unnamed')
        ON CONFLICT (invoice_reference_number, assigned_collector_id) DO UPDATE
        SET ticket_id = v_ticket.id;
        
        v_results := jsonb_set(v_results, '{tickets_created}', to_jsonb((v_results->>'tickets_created')::int + 1));
        v_results := jsonb_set(v_results, '{invoices_added}', to_jsonb((v_results->>'invoices_added')::int + array_length(v_invoice_refs, 1)));
      END IF;
      
      UPDATE auto_ticket_rules SET last_run_at = NOW() WHERE id = v_rule.id;
      
    EXCEPTION WHEN OTHERS THEN
      v_results := jsonb_set(
        v_results,
        '{errors}',
        (v_results->'errors') || jsonb_build_array(jsonb_build_object(
          'rule_id', v_rule.id,
          'error', SQLERRM
        ))
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

-- Step 7: Drop the active column
ALTER TABLE collection_tickets DROP COLUMN IF EXISTS active;
