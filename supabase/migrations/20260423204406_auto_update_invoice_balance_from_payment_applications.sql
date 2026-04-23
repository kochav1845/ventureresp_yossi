/*
  # Auto-update invoice balance and status when payment applications change

  1. New Function
    - `update_invoice_balance_from_applications()` - trigger function that:
      - Calculates total payments applied to an invoice from `payment_invoice_applications`
      - Updates `acumatica_invoices.balance` to (amount - total_paid)
      - Updates `acumatica_invoices.status` to 'Closed' when fully paid (balance <= 0)

  2. New Trigger
    - `trg_update_invoice_balance` on `payment_invoice_applications`
      - Fires AFTER INSERT, UPDATE, or DELETE
      - Recalculates the affected invoice's balance

  3. Why
    - The invoice sync only fetches invoices modified in Acumatica recently
    - When a payment is applied, the payment sync creates `payment_invoice_applications` records
      but does NOT update `acumatica_invoices.balance` or `acumatica_invoices.status`
    - This leaves stale balance/status on invoices, causing paid invoices to appear as unpaid
    - This trigger closes the gap by keeping invoice balance in sync with actual payments

  4. Data Fix
    - Also runs a one-time update to fix all currently stale invoice balances
*/

-- Create the trigger function
CREATE OR REPLACE FUNCTION update_invoice_balance_from_applications()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ref text;
  v_total_paid numeric;
  v_invoice_amount numeric;
  v_new_balance numeric;
BEGIN
  -- Determine which invoice reference number was affected
  IF TG_OP = 'DELETE' THEN
    v_ref := OLD.invoice_reference_number;
  ELSE
    v_ref := NEW.invoice_reference_number;
  END IF;

  -- Calculate total payments applied to this invoice
  SELECT COALESCE(SUM(amount_paid), 0)
  INTO v_total_paid
  FROM payment_invoice_applications
  WHERE invoice_reference_number = v_ref;

  -- Get the invoice amount
  SELECT amount
  INTO v_invoice_amount
  FROM acumatica_invoices
  WHERE reference_number = v_ref;

  -- If invoice not found, exit gracefully
  IF v_invoice_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Calculate new balance
  v_new_balance := GREATEST(v_invoice_amount - v_total_paid, 0);

  -- Update the invoice balance and status
  UPDATE acumatica_invoices
  SET
    balance = v_new_balance,
    status = CASE WHEN v_new_balance <= 0 THEN 'Closed' ELSE status END
  WHERE reference_number = v_ref;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create the trigger on payment_invoice_applications
DROP TRIGGER IF EXISTS trg_update_invoice_balance ON payment_invoice_applications;

CREATE TRIGGER trg_update_invoice_balance
  AFTER INSERT OR UPDATE OR DELETE
  ON payment_invoice_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_balance_from_applications();

-- One-time fix: update all invoices that have payment applications but stale balances
UPDATE acumatica_invoices i
SET
  balance = GREATEST(i.amount - pa.total_paid, 0),
  status = CASE WHEN GREATEST(i.amount - pa.total_paid, 0) <= 0 THEN 'Closed' ELSE i.status END
FROM (
  SELECT
    invoice_reference_number,
    SUM(amount_paid) AS total_paid
  FROM payment_invoice_applications
  GROUP BY invoice_reference_number
) pa
WHERE pa.invoice_reference_number = i.reference_number
  AND i.status = 'Open'
  AND i.balance > 0
  AND (i.amount - pa.total_paid) <= 0;
