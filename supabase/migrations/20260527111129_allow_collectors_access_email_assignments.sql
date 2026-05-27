/*
  # Allow collectors to access email assignments

  1. Changes
    - Adds SELECT policy on `customer_assignments` for collectors/managers
    - Adds INSERT policy on `customer_assignments` for collectors/managers
    - Adds UPDATE policy on `customer_assignments` for collectors/managers
    - Also adds SELECT on `email_formulas` and `email_templates` for collectors

  2. Security
    - All require authenticated user with collector, manager, or admin role
*/

CREATE POLICY "Collectors can view assignments"
  ON customer_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('collector', 'manager', 'admin')
    )
  );

CREATE POLICY "Collectors can create assignments"
  ON customer_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('collector', 'manager', 'admin')
    )
  );

CREATE POLICY "Collectors can update assignments"
  ON customer_assignments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('collector', 'manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('collector', 'manager', 'admin')
    )
  );

-- Also allow collectors to view formulas and templates for the assignment form
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'email_formulas' AND policyname = 'Collectors can view formulas'
  ) THEN
    CREATE POLICY "Collectors can view formulas"
      ON email_formulas
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role IN ('collector', 'manager', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'email_templates' AND policyname = 'Collectors can view templates'
  ) THEN
    CREATE POLICY "Collectors can view templates"
      ON email_templates
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role IN ('collector', 'manager', 'admin')
        )
      );
  END IF;
END $$;
