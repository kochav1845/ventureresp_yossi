/*
  # Fix Invoice Reminders User ID Foreign Key

  1. Problem
    - invoice_reminders.user_id has FK to auth.users(id)
    - Frontend code uses profile.id from user_profiles table
    - These should match but the FK constraint is causing issues
    
  2. Solution
    - Change FK to reference user_profiles(id) instead
    - This matches the application's data model better
    
  3. Security
    - RLS policies already ensure user_id = auth.uid()
    - FK ensures referential integrity with user_profiles
*/

-- Drop the existing foreign key constraint
ALTER TABLE invoice_reminders
DROP CONSTRAINT IF EXISTS invoice_reminders_user_id_fkey;

-- Add new foreign key constraint to user_profiles
ALTER TABLE invoice_reminders
ADD CONSTRAINT invoice_reminders_user_id_fkey
FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- Verify the constraint
COMMENT ON CONSTRAINT invoice_reminders_user_id_fkey ON invoice_reminders 
IS 'References user_profiles(id) which matches auth.users(id)';