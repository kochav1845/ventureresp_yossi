/*
  # Add Timezone Support to Customer Assignments

  1. Changes
    - Add `timezone` column to `customer_assignments` table
    - Default timezone is 'America/New_York'
    - This allows each assignment to have its own timezone
    
  2. Notes
    - Times in `send_time` column are interpreted in the assignment's timezone
    - The scheduler will convert to UTC when checking if it's time to send
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_assignments' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE customer_assignments ADD COLUMN timezone text DEFAULT 'America/New_York' NOT NULL;
  END IF;
END $$;