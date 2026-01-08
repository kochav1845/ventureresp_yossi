/*
  # Migrate legacy roles to RBAC system (v2)

  1. Issue
    - The user_profiles table has users with legacy roles: customer, secretary
    - The new RBAC system uses: admin, manager, collector, viewer
    - Need to migrate existing users before updating the constraint

  2. Migration Strategy
    - First: Drop the old constraint
    - Second: Update existing user roles to new RBAC roles
    - Third: Add new constraint with RBAC roles only

  3. Role Mapping
    - customer -> collector (customer-facing collection work)
    - secretary -> viewer (read-only access to necessary information)
    - admin -> admin (no change)

  4. Security
    - Maintains data integrity
    - Ensures all users have valid roles in the new system
*/

-- Step 1: Drop the old constraint (allows us to update roles freely)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

-- Step 2: Migrate legacy roles to new RBAC roles
UPDATE user_profiles 
SET role = 'collector' 
WHERE role = 'customer';

UPDATE user_profiles 
SET role = 'viewer' 
WHERE role = 'secretary';

-- Step 3: Add new constraint with RBAC roles only
ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_role_check 
CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'collector'::text, 'viewer'::text]));
