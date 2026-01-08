/*
  # Add Missing Columns to Acumatica Invoices Table

  1. Changes
    - Add `amount` column for invoice amount
    - Add `balance` column for remaining balance
    - Add `description` column for invoice description
    - Add other commonly used Acumatica invoice fields

  2. Notes
    - Uses IF NOT EXISTS to safely add columns
    - All numeric fields use numeric(18, 2) for currency precision
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'amount'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN amount numeric(18, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'balance'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN balance numeric(18, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'description'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN due_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'discount_total'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN discount_total numeric(18, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'tax_total'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN tax_total numeric(18, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'billing_address'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN billing_address jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'location'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN location text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN payment_method text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'terms'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN terms text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'hold'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN hold boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'project'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN project text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'branch'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN branch text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'invoice_nbr'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN invoice_nbr text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'doc_type'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN doc_type text;
  END IF;
END $$;
