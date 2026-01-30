/*
  # Auto-remove Paid Invoices from Tickets

  ## Overview
  When an invoice becomes closed/paid (status = 'Closed' or balance = 0),
  it should automatically be removed from collection tickets since there's
  nothing left to collect.

  ## Changes
  1. Create trigger function to remove closed invoices from tickets
  2. Add trigger on acumatica_invoices table to monitor status changes
  3. Automatically remove invoice from ticket_invoices when:
     - Invoice status changes to 'Closed'
     - Invoice balance becomes 0 or negative

  ## Behavior
  - When an invoice is paid off, it disappears from all tickets
  - This keeps collection tickets focused on active receivables
  - Prevents collectors from chasing already-paid invoices
*/

-- Function to remove closed/paid invoices from tickets
CREATE OR REPLACE FUNCTION remove_closed_invoice_from_tickets()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if invoice is now closed or fully paid
  IF (NEW.status = 'Closed' OR NEW.balance <= 0) AND
     (OLD.status != 'Closed' OR OLD.balance > 0) THEN

    -- Remove this invoice from all tickets
    DELETE FROM ticket_invoices
    WHERE invoice_reference_number = NEW.reference_number;

    -- Log activity for tracking
    INSERT INTO user_activity_logs (
      user_id,
      action_type,
      resource_type,
      resource_id,
      details
    )
    VALUES (
      auth.uid(),
      'invoice_auto_removed_from_ticket',
      'invoice',
      NEW.id,
      jsonb_build_object(
        'invoice_reference', NEW.reference_number,
        'reason', 'Invoice closed/paid',
        'new_status', NEW.status,
        'new_balance', NEW.balance
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on acumatica_invoices
DROP TRIGGER IF EXISTS trigger_remove_closed_invoice_from_tickets ON acumatica_invoices;

CREATE TRIGGER trigger_remove_closed_invoice_from_tickets
AFTER UPDATE ON acumatica_invoices
FOR EACH ROW
WHEN (NEW.status = 'Closed' OR NEW.balance <= 0)
EXECUTE FUNCTION remove_closed_invoice_from_tickets();

-- Create index to improve performance of ticket invoice removal
CREATE INDEX IF NOT EXISTS idx_ticket_invoices_ref_number
ON ticket_invoices(invoice_reference_number);