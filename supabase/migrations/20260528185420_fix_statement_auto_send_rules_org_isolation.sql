/*
  # Fix Statement Auto-Send Rules Organization Isolation

  1. Changes
    - Add auto-set org_id trigger so organization_id is always populated
    - Fix RLS policies to NOT allow NULL organization_id to bypass org checks
    - Update existing rows with NULL org_id to match creator's org

  2. Security
    - Removes the dangerous `organization_id IS NULL OR` clause
    - Ensures strict org isolation - rules are only visible within their org
*/

-- First, backfill any existing rows that have NULL organization_id
UPDATE statement_auto_send_rules
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = statement_auto_send_rules.created_by
)
WHERE organization_id IS NULL AND created_by IS NOT NULL;

-- Add the auto-set org_id trigger
DROP TRIGGER IF EXISTS set_org_id_statement_auto_send_rules ON statement_auto_send_rules;
CREATE TRIGGER set_org_id_statement_auto_send_rules
  BEFORE INSERT ON statement_auto_send_rules
  FOR EACH ROW EXECUTE FUNCTION set_org_id_on_insert();

-- Drop old permissive policies
DROP POLICY IF EXISTS "Users can view statement rules in their org" ON statement_auto_send_rules;
DROP POLICY IF EXISTS "Users can insert statement rules" ON statement_auto_send_rules;
DROP POLICY IF EXISTS "Users can update statement rules in their org" ON statement_auto_send_rules;
DROP POLICY IF EXISTS "Users can delete statement rules in their org" ON statement_auto_send_rules;

-- Create strict org-isolated policies (no NULL bypass)
CREATE POLICY "Users can view statement rules in their org"
  ON statement_auto_send_rules FOR SELECT
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert statement rules in their org"
  ON statement_auto_send_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update statement rules in their org"
  ON statement_auto_send_rules FOR UPDATE
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete statement rules in their org"
  ON statement_auto_send_rules FOR DELETE
  TO authenticated
  USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );
