/*
  # Remove password_hash from pending_users table

  ## Changes
  
  1. Security Fix
    - Remove `password_hash` column from `pending_users` table
    - Passwords are now generated securely in the approval edge function
    - No plain text passwords are stored in the database
  
  ## Notes
  - This is a critical security improvement
  - Temporary passwords are now generated server-side with crypto.getRandomValues()
  - Users will receive temporary passwords via email after approval
*/

-- Remove the password_hash column as we no longer store passwords
ALTER TABLE pending_users DROP COLUMN IF EXISTS password_hash;
