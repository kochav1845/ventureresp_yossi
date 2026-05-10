/*
  # Add tracking fields to acumatica_customers

  1. Problem
    - The Customers page tries to toggle `responded_this_month` and other fields
      on the `customers` table using an Acumatica customer_id (e.g., "15279059")
    - The `customers` table uses UUID primary keys, causing "invalid input syntax for type uuid" errors
    - These tracking fields need to live on `acumatica_customers` which uses `customer_id` text keys

  2. New Columns on `acumatica_customers`
    - `is_active` (boolean, default true) - whether customer is active for collections
    - `responded_this_month` (boolean, default false) - whether customer responded this month
    - `postpone_until` (timestamptz, nullable) - postpone date for email scheduling
    - `postpone_reason` (text, nullable) - reason for postponement

  3. Security
    - RLS policies already exist on acumatica_customers for authenticated users
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'responded_this_month'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN responded_this_month boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'postpone_until'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN postpone_until timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'postpone_reason'
  ) THEN
    ALTER TABLE acumatica_customers ADD COLUMN postpone_reason text;
  END IF;
END $$;
