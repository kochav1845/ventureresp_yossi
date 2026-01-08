/*
  # Fix User Profile Update Trigger

  1. Changes
    - Remove full_name field check from log_user_profile_update() trigger
    - The user_profiles table doesn't have a full_name column
    - Only log role and assigned_color changes
*/

-- Update trigger function to remove full_name reference
CREATE OR REPLACE FUNCTION log_user_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL) THEN
    IF (OLD.role IS DISTINCT FROM NEW.role) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        auth.uid(),
        'user_role_changed',
        'user_profile',
        NEW.id::text,
        jsonb_build_object(
          'old_role', OLD.role,
          'new_role', NEW.role,
          'target_user_email', NEW.email
        )
      );
    END IF;

    IF (OLD.assigned_color IS DISTINCT FROM NEW.assigned_color) THEN
      INSERT INTO user_activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        details
      )
      VALUES (
        auth.uid(),
        'user_color_changed',
        'user_profile',
        NEW.id::text,
        jsonb_build_object(
          'old_color', OLD.assigned_color,
          'new_color', NEW.assigned_color,
          'target_user_email', NEW.email
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
