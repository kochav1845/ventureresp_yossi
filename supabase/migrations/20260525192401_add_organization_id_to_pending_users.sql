/*
  # Add organization_id to pending_users

  1. Changes
    - Add organization_id column to pending_users table
    - Link to organizations table

  2. Notes
    - When a user signs up on an org's page, the org_id is stored
    - When approved, the org_id is passed to the new user profile
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_users' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE pending_users ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
END $$;
