/*
  # Add Multiple Send Times Support to Email Formulas

  ## Summary
  This migration adds the ability to configure multiple specific times during the day when emails should be sent (e.g., 9:00 AM and 3:00 PM).

  ## Changes Made
  
  1. **Modify `email_formulas` table**
     - Add `send_times` column (jsonb array) - Stores multiple times of day when emails should be sent
     - Format: ["09:00:00", "15:00:00"] for 9 AM and 3 PM
     - Defaults to empty array
  
  2. **Update schedule structure**
     - Keep existing `schedule` column with day/frequency structure
     - Add separate `send_times` array for time-of-day configuration
     - System will send emails at each specified time on scheduled days
  
  ## Important Notes
  - If `send_times` is empty, system defaults to single send time from customer_assignments
  - Multiple times allow flexible scheduling (e.g., morning and afternoon sends)
  - Times are stored in 24-hour format (HH:MM:SS)
*/

-- Add send_times column to email_formulas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_formulas' AND column_name = 'send_times'
  ) THEN
    ALTER TABLE email_formulas ADD COLUMN send_times jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;