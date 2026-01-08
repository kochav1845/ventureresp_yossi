/*
  # Add Complete Invoice Fields

  1. Changes
    - Add all missing fields from Acumatica invoice structure
    - Fields include: note, billing_printed, bill_to_contact_override, ship_to_contact_override
    - Add timestamps: created_datetime, last_modified_datetime
    - Add AR account link field
    - Add is_tax_valid field
    - Add acumatica_id for the UUID from Acumatica
    - Add row_number field

  2. Notes
    - Uses IF NOT EXISTS to safely add columns
    - Preserves existing data
    - All fields are optional to accommodate varying invoice structures
*/

DO $$
BEGIN
  -- Add Acumatica UUID
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'acumatica_id'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN acumatica_id text;
  END IF;

  -- Add row number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'row_number'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN row_number integer;
  END IF;

  -- Add note field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'note'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN note text;
  END IF;

  -- Add billing printed flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'billing_printed'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN billing_printed boolean DEFAULT false;
  END IF;

  -- Add bill to contact override
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'bill_to_contact_override'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN bill_to_contact_override boolean DEFAULT false;
  END IF;

  -- Add ship to contact override
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'ship_to_contact_override'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN ship_to_contact_override boolean DEFAULT false;
  END IF;

  -- Add created datetime from Acumatica
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'created_datetime'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN created_datetime timestamptz;
  END IF;

  -- Add last modified datetime from Acumatica
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'last_modified_datetime'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN last_modified_datetime timestamptz;
  END IF;

  -- Add customer order
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'customer_order'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN customer_order text;
  END IF;

  -- Add link AR account
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'link_ar_account'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN link_ar_account text;
  END IF;

  -- Add location ID
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'location_id'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN location_id text;
  END IF;

  -- Add is tax valid
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'is_tax_valid'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN is_tax_valid boolean;
  END IF;
END $$;

-- Create index on acumatica_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_acumatica_id ON acumatica_invoices(acumatica_id);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_customer_order ON acumatica_invoices(customer_order);
