/*
  # Normalize Invoice Reference Numbers - Step 1: Delete Duplicates

  ## Problem
  The database contains 3,253 duplicate invoice pairs where the same invoice exists with both:
  - Short format (4 or 5 digits): "2127", "5116"
  - Padded format (6 digits): "002127", "005116"

  ## This Step
  Delete the shorter versions where a 6-digit version already exists.
  This is done in a single DELETE operation with a subquery.
*/

-- Delete shorter versions where 6-digit version exists
DELETE FROM acumatica_invoices
WHERE id IN (
  SELECT short.id
  FROM acumatica_invoices short
  WHERE short.reference_number ~ '^[0-9]+$'
    AND LENGTH(short.reference_number) < 6
    AND EXISTS (
      SELECT 1 
      FROM acumatica_invoices long
      WHERE long.reference_number = LPAD(short.reference_number, 6, '0')
        AND long.id != short.id
    )
  LIMIT 1000
);
