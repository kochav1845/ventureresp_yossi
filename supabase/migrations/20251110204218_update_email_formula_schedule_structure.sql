/*
  # Update Email Formula Schedule Structure

  ## Summary
  This migration updates the email formula schedule structure to support multiple send times per day instead of frequency counts.

  ## Changes Made
  
  1. **Update `email_formulas` schedule structure**
     - Old format: [{ day: 1, frequency: 1 }, { day: 3, frequency: 2 }]
     - New format: [{ day: 1, times: ["11:00:00"] }, { day: 3, times: ["09:00:00", "15:00:00"] }]
     - Each day can now have multiple specific times when emails should be sent
  
  2. **Remove `send_times` column**
     - Times are now stored per-day in the schedule, not globally for the formula
     - This allows different days to have different send times
  
  ## Important Notes
  - Day 1 at 11:00 AM → { day: 1, times: ["11:00:00"] }
  - Day 3 at 9:00 AM and 3:00 PM → { day: 3, times: ["09:00:00", "15:00:00"] }
  - More flexible scheduling per day
*/

-- Remove the send_times column as it's no longer needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_formulas' AND column_name = 'send_times'
  ) THEN
    ALTER TABLE email_formulas DROP COLUMN send_times;
  END IF;
END $$;