/*
  # Remove Duplicate UPDATE Policy on Invoice Reminders

  1. Issue
    - Two UPDATE policies exist on invoice_reminders table
    - "Users can edit their own reminders" (new, clean)
    - "Users can update their own reminders" (old, duplicate)
    
  2. Solution
    - Remove the duplicate policy
    - Keep only the cleaner version
*/

-- Remove the old duplicate policy
DROP POLICY IF EXISTS "Users can update their own reminders" ON invoice_reminders;