/*
  # Add Secretary Role to User Profiles

  1. Overview
    - Update the role check constraint to include 'secretary'
    - Previously only 'customer' and 'admin' were allowed

  2. Changes
    - Drop existing constraint
    - Add new constraint allowing 'customer', 'secretary', and 'admin'

  3. Security
    - No RLS changes needed
    - Existing policies continue to work
*/

-- Drop the old constraint
ALTER TABLE user_profiles 
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Add new constraint with secretary role
ALTER TABLE user_profiles 
  ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('customer', 'secretary', 'admin'));
