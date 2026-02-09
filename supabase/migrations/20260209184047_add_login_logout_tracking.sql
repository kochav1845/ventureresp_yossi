/*
  # Add Login/Logout Activity Tracking

  1. Changes
    - Update user_activity_logs to allow nullable user_id for system events
    - Add function to log login events
    - Add function to log logout events
    
  2. Security
    - Functions are SECURITY DEFINER to allow logging even during auth flow
*/

-- Make user_id nullable for system-level events (but keep the foreign key)
ALTER TABLE user_activity_logs 
  ALTER COLUMN user_id DROP NOT NULL;

-- Function to log user login
CREATE OR REPLACE FUNCTION log_user_login(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO user_activity_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_user_id,
    'user_login',
    'auth',
    p_user_id::text,
    jsonb_build_object(
      'timestamp', NOW()
    )
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Function to log user logout
CREATE OR REPLACE FUNCTION log_user_logout(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO user_activity_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    details
  )
  VALUES (
    p_user_id,
    'user_logout',
    'auth',
    p_user_id::text,
    jsonb_build_object(
      'timestamp', NOW()
    )
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;
