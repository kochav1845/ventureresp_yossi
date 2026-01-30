/*
  # Enable Admins and Managers as Assignable Collectors
  
  ## Changes
  
  1. Database Updates
    - Set `can_be_assigned_as_collector = true` for all existing admins
    - Set `can_be_assigned_as_collector = true` for all existing managers
    - Create trigger to automatically enable flag for new admins/managers
  
  2. Purpose
    - Allow admins and managers to be assigned tickets and invoices
    - Provide flexibility in workload distribution
    - Enable all management levels to handle collection tasks
  
  ## Notes
  - Collectors already have this flag enabled
  - New admins/managers will automatically get the flag
  - Flag can be manually disabled if needed
*/

-- Update all existing admins and managers to be assignable as collectors
UPDATE user_profiles
SET can_be_assigned_as_collector = true
WHERE role IN ('admin', 'manager')
  AND can_be_assigned_as_collector = false;

-- Create trigger function to automatically enable flag for new admins/managers
CREATE OR REPLACE FUNCTION enable_collector_assignment_for_management_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Automatically enable can_be_assigned_as_collector for admin, manager, and collector roles
  IF NEW.role IN ('admin', 'manager', 'collector') THEN
    NEW.can_be_assigned_as_collector = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_collector_assignment_flag_on_insert ON user_profiles;
CREATE TRIGGER set_collector_assignment_flag_on_insert
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION enable_collector_assignment_for_management_roles();

-- Also handle updates to role
DROP TRIGGER IF EXISTS set_collector_assignment_flag_on_update ON user_profiles;
CREATE TRIGGER set_collector_assignment_flag_on_update
  BEFORE UPDATE OF role ON user_profiles
  FOR EACH ROW
  WHEN (NEW.role IN ('admin', 'manager', 'collector'))
  EXECUTE FUNCTION enable_collector_assignment_for_management_roles();
