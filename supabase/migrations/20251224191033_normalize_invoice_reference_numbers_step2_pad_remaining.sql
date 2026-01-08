/*
  # Normalize Invoice Reference Numbers - Step 2: Pad Remaining

  ## This Step
  After deleting duplicates, pad all remaining numeric reference numbers to 6 digits.
  This is done in batches to avoid timeouts.
*/

-- Pad remaining numeric reference numbers to 6 digits (batch 1)
UPDATE acumatica_invoices
SET 
  reference_number = LPAD(reference_number, 6, '0'),
  updated_at = NOW()
WHERE id IN (
  SELECT id
  FROM acumatica_invoices
  WHERE reference_number ~ '^[0-9]+$'
    AND LENGTH(reference_number) < 6
  LIMIT 1000
);
