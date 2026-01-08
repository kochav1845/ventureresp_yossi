/*
  # Add Last Modified DateTime Columns

  1. Changes
    - Add `last_modified_datetime` column to `acumatica_customers` table
    - Add `last_modified_datetime` column to `acumatica_invoices` table
    - Add `last_modified_datetime` column to `acumatica_payments` table
    - Create indexes on these columns for efficient filtering
    - Add `last_sync_timestamp` to track when records were last synced locally

  2. Purpose
    - Enable incremental sync by tracking when records were last modified in Acumatica
    - Improve query performance when filtering by modification time
*/

-- Add last_modified_datetime to acumatica_customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'last_modified_datetime'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN last_modified_datetime timestamptz;
  END IF;
END $$;

-- Add last_sync_timestamp to acumatica_customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'last_sync_timestamp'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN last_sync_timestamp timestamptz DEFAULT now();
  END IF;
END $$;

-- Add last_modified_datetime to acumatica_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'last_modified_datetime'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN last_modified_datetime timestamptz;
  END IF;
END $$;

-- Add last_sync_timestamp to acumatica_invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'last_sync_timestamp'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN last_sync_timestamp timestamptz DEFAULT now();
  END IF;
END $$;

-- Add last_modified_datetime to acumatica_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_payments' AND column_name = 'last_modified_datetime'
  ) THEN
    ALTER TABLE acumatica_payments ADD COLUMN last_modified_datetime timestamptz;
  END IF;
END $$;

-- Add last_sync_timestamp to acumatica_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_payments' AND column_name = 'last_sync_timestamp'
  ) THEN
    ALTER TABLE acumatica_payments ADD COLUMN last_sync_timestamp timestamptz DEFAULT now();
  END IF;
END $$;

-- Create indexes for efficient filtering by last_modified_datetime
CREATE INDEX IF NOT EXISTS idx_acumatica_customers_last_modified ON acumatica_customers(last_modified_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_last_modified ON acumatica_invoices(last_modified_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_acumatica_payments_last_modified ON acumatica_payments(last_modified_datetime DESC);

-- Create indexes for last_sync_timestamp
CREATE INDEX IF NOT EXISTS idx_acumatica_customers_last_sync ON acumatica_customers(last_sync_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_last_sync ON acumatica_invoices(last_sync_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_acumatica_payments_last_sync ON acumatica_payments(last_sync_timestamp DESC);
