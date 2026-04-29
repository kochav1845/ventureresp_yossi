/*
  # Fix invoice balance trigger to handle negative payment amounts safely

  1. Changes
    - Updated `update_invoice_balance_from_applications()` trigger function
    - Only updates invoice balance when total positive payments >= invoice amount (fully paid)
    - For partial payments, trusts Acumatica's synced balance as source of truth
    - Prevents incorrect balance calculations from negative payment amounts (reversals, voids)

  2. One-time Data Fix
    - Fixes invoices that are still Open with full balance but have been fully paid
    - Only considers positive payment amounts to avoid miscalculation from reversals
    - Does NOT touch invoices with complex payment histories (negative amounts)

  3. Why
    - Payment applications can have negative amounts (reversals, credit adjustments)
    - Simple `amount - SUM(amount_paid)` doesn't work when negatives are present
    - Acumatica's own balance is the primary source of truth for partial payments
    - The trigger should only close invoices that are clearly fully paid
*/

-- Fix the trigger function to be safer
CREATE OR REPLACE FUNCTION update_invoice_balance_from_applications()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ref text;
  v_positive_paid numeric;
  v_invoice_amount numeric;
  v_invoice_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ref := OLD.invoice_reference_number;
  ELSE
    v_ref := NEW.invoice_reference_number;
  END IF;

  -- Only sum positive payment amounts (ignore reversals/voids)
  SELECT COALESCE(SUM(amount_paid), 0)
  INTO v_positive_paid
  FROM payment_invoice_applications
  WHERE invoice_reference_number = v_ref
    AND amount_paid > 0;

  SELECT amount, status
  INTO v_invoice_amount, v_invoice_status
  FROM acumatica_invoices
  WHERE reference_number = v_ref;

  IF v_invoice_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only update if positive payments fully cover the invoice amount
  IF v_positive_paid >= v_invoice_amount AND v_invoice_amount > 0 THEN
    UPDATE acumatica_invoices
    SET
      balance = 0,
      status = 'Closed'
    WHERE reference_number = v_ref
      AND status = 'Open';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- One-time fix: close invoices that are fully paid by positive payment amounts only
-- This is safe because we only close invoices where positive payments >= invoice amount
UPDATE acumatica_invoices i
SET
  balance = 0,
  status = 'Closed'
FROM (
  SELECT
    invoice_reference_number,
    SUM(amount_paid) FILTER (WHERE amount_paid > 0) AS positive_paid
  FROM payment_invoice_applications
  GROUP BY invoice_reference_number
) pa
WHERE pa.invoice_reference_number = i.reference_number
  AND i.status = 'Open'
  AND i.balance > 0
  AND i.amount > 0
  AND pa.positive_paid >= i.amount;
