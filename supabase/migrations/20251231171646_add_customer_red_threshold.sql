/*
  # Add Red Status Threshold to Customers

  1. Changes
    - Add `days_past_due_threshold` column to `acumatica_customers` table
      - Default to 30 days past due before marking invoices as red
      - Allows each customer to have a custom threshold
    
  2. Purpose
    - Enable custom "days past due" rules per customer
    - Automatically determine when unpaid invoices should be marked red
    - Provide flexibility for different customer payment arrangements
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_customers' AND column_name = 'days_past_due_threshold'
  ) THEN
    ALTER TABLE acumatica_customers 
    ADD COLUMN days_past_due_threshold integer DEFAULT 30;
  END IF;
END $$;

COMMENT ON COLUMN acumatica_customers.days_past_due_threshold IS 
  'Number of days past due date before invoices should be marked red (default: 30 days)';
