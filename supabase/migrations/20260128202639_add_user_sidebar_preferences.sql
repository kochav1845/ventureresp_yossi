/*
  # Add User UI Preferences

  1. Changes
    - Add `ui_preferences` JSONB column to `user_profiles` table
    - Store user interface preferences including sidebar state

  2. Purpose
    - Enable users to customize their UI experience
    - Persist sidebar collapsed/expanded state across sessions
    - Allow future UI preferences to be stored in the same field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'ui_preferences'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN ui_preferences JSONB DEFAULT '{"sidebarCollapsed": false}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN user_profiles.ui_preferences IS 
  'User interface preferences stored as JSON (sidebar state, theme, etc.)';
