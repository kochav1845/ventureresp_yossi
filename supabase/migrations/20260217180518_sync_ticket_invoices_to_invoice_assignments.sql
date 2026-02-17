/*
  # Sync Ticket Invoices to Invoice Assignments
  
  1. Problem
    - Tickets can have invoices in `ticket_invoices` table
    - But the UI queries `collector_assignment_details` view which is based on `invoice_assignments`
    - Some tickets (like TKT000022) have invoices only in `ticket_invoices`, not in `invoice_assignments`
    - This causes them to not appear in the collector's view
  
  2. Solution
    - Sync all ticket_invoices into invoice_assignments
    - Create trigger to automatically sync new ticket_invoices to invoice_assignments
    - Update invoice_assignments when ticket collector changes
  
  3. Changes
    - Insert missing records into invoice_assignments from ticket_invoices
    - Create trigger function to sync on ticket_invoices insert
    - Create trigger function to update invoice_assignments when ticket.assigned_collector_id changes
*/

-- First, sync all existing ticket_invoices into invoice_assignments
INSERT INTO invoice_assignments (
  invoice_reference_number,
  assigned_collector_id,
  ticket_id,
  assigned_at,
  assigned_by
)
SELECT DISTINCT
  ti.invoice_reference_number,
  ct.assigned_collector_id,
  ti.ticket_id,
  ti.added_at,
  ti.added_by
FROM ticket_invoices ti
JOIN collection_tickets ct ON ct.id = ti.ticket_id
WHERE ct.assigned_collector_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM invoice_assignments ia
    WHERE ia.invoice_reference_number = ti.invoice_reference_number
  );

-- Create trigger function to sync new ticket_invoices to invoice_assignments
CREATE OR REPLACE FUNCTION sync_ticket_invoice_to_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_collector_id uuid;
BEGIN
  -- Get the collector assigned to this ticket
  SELECT assigned_collector_id INTO v_collector_id
  FROM collection_tickets
  WHERE id = NEW.ticket_id;
  
  -- Only sync if there's a collector assigned
  IF v_collector_id IS NOT NULL THEN
    -- Insert or update invoice_assignments
    INSERT INTO invoice_assignments (
      invoice_reference_number,
      assigned_collector_id,
      ticket_id,
      assigned_at,
      assigned_by
    )
    VALUES (
      NEW.invoice_reference_number,
      v_collector_id,
      NEW.ticket_id,
      NEW.added_at,
      NEW.added_by
    )
    ON CONFLICT (invoice_reference_number) DO UPDATE
    SET 
      ticket_id = NEW.ticket_id,
      assigned_collector_id = v_collector_id,
      assigned_at = NEW.added_at,
      assigned_by = NEW.added_by;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on ticket_invoices
DROP TRIGGER IF EXISTS trigger_sync_ticket_invoice_to_assignment ON ticket_invoices;
CREATE TRIGGER trigger_sync_ticket_invoice_to_assignment
AFTER INSERT ON ticket_invoices
FOR EACH ROW
EXECUTE FUNCTION sync_ticket_invoice_to_assignment();

-- Create trigger function to update invoice_assignments when ticket collector changes
CREATE OR REPLACE FUNCTION sync_ticket_collector_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update all invoice_assignments for this ticket's invoices
  IF NEW.assigned_collector_id IS DISTINCT FROM OLD.assigned_collector_id THEN
    UPDATE invoice_assignments
    SET assigned_collector_id = NEW.assigned_collector_id
    WHERE ticket_id = NEW.id
      AND assigned_collector_id = OLD.assigned_collector_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on collection_tickets
DROP TRIGGER IF EXISTS trigger_sync_ticket_collector_change ON collection_tickets;
CREATE TRIGGER trigger_sync_ticket_collector_change
AFTER UPDATE ON collection_tickets
FOR EACH ROW
WHEN (OLD.assigned_collector_id IS DISTINCT FROM NEW.assigned_collector_id)
EXECUTE FUNCTION sync_ticket_collector_change();
