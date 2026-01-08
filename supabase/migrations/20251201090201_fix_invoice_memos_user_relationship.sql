/*
  # Fix Invoice Memos User Relationship

  1. Overview
    - Drop the foreign key to auth.users (cross-schema issues)
    - Add foreign key to user_profiles instead
    - This allows PostgREST to properly join the tables

  2. Changes
    - Drop existing constraint to auth.users
    - Add new constraint to user_profiles
    - PostgREST can now resolve the relationship

  3. Notes
    - user_profiles.id references auth.users.id, so data integrity is maintained
*/

-- Drop the cross-schema foreign key
ALTER TABLE invoice_memos 
  DROP CONSTRAINT IF EXISTS invoice_memos_user_id_fkey;

-- Add foreign key to user_profiles (same schema)
ALTER TABLE invoice_memos 
  ADD CONSTRAINT invoice_memos_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES user_profiles(id) 
  ON DELETE CASCADE;
