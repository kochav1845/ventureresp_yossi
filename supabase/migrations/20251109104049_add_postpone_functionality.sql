/*
  # Add Postpone Functionality to Email System
  
  1. Changes
    - Add `postpone_until` column to customers table to track when to resume sending emails
    - Add `postpone_reason` column to track why the customer was postponed
    - Create index on `postpone_until` for efficient querying in scheduler
  
  2. Purpose
    - Allow customers to postpone emails for specific periods (1 day, 2 days, 1 week, etc.)
    - Email scheduler will automatically skip customers with active postpone dates
    - Tracks both automatic (AI-detected) and manual postponements
  
  3. Security
    - No RLS changes needed as customers table already has proper policies
*/

-- Add postpone_until column to customers table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'postpone_until'
  ) THEN
    ALTER TABLE customers ADD COLUMN postpone_until timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Add postpone_reason column to track why postponement was set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'postpone_reason'
  ) THEN
    ALTER TABLE customers ADD COLUMN postpone_reason text DEFAULT NULL;
  END IF;
END $$;

-- Create index for efficient querying in email scheduler
CREATE INDEX IF NOT EXISTS idx_customers_postpone_until 
ON customers(postpone_until) 
WHERE postpone_until IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN customers.postpone_until IS 'Date until which to postpone sending emails to this customer. NULL means no postponement.';
COMMENT ON COLUMN customers.postpone_reason IS 'Reason for postponement (AI-detected or manually set by admin).';