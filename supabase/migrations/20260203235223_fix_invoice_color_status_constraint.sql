/*
  # Fix Invoice Color Status Constraint

  1. Problem
    - The `acumatica_invoices.color_status` column has a hardcoded CHECK constraint
    - This constraint only allows: 'green', 'yellow', 'orange', 'red'
    - But the new `invoice_color_status_options` table allows dynamic custom statuses
    - Users cannot set invoices to custom color statuses

  2. Solution
    - Drop the old CHECK constraint
    - Add a foreign key constraint to `invoice_color_status_options.status_name`
    - This allows any status that exists in the options table
    - Validates data integrity while allowing flexibility

  3. Steps
    - First, ensure 'orange' exists in the options table (for backward compatibility)
    - Drop the CHECK constraint
    - Add foreign key constraint
*/

-- Step 1: Add 'orange' to invoice_color_status_options if it doesn't exist
INSERT INTO invoice_color_status_options (status_name, display_name, color_class, sort_order, is_system)
VALUES ('orange', 'Pending Review', 'bg-orange-500 border-orange-700', 4, true)
ON CONFLICT (status_name) DO NOTHING;

-- Step 2: Drop the old CHECK constraint
ALTER TABLE acumatica_invoices
DROP CONSTRAINT IF EXISTS acumatica_invoices_color_status_check;

-- Step 3: Add foreign key constraint to allow any status in the options table
ALTER TABLE acumatica_invoices
ADD CONSTRAINT acumatica_invoices_color_status_fkey
FOREIGN KEY (color_status)
REFERENCES invoice_color_status_options(status_name)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Step 4: Create an index for the foreign key
CREATE INDEX IF NOT EXISTS idx_invoices_color_status_fkey
ON acumatica_invoices(color_status);