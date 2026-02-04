/*
  # Add Active Column to Collection Tickets

  1. Changes
    - Add `active` column to `collection_tickets` table
    - Default value: true (all tickets active by default)
    - Only admins can modify the `active` column
    
  2. Security
    - Update RLS policy to restrict `active` column modifications to admins only
    - Collectors cannot see or modify the `active` column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'collection_tickets' AND column_name = 'active'
  ) THEN
    ALTER TABLE collection_tickets ADD COLUMN active boolean DEFAULT true;
  END IF;
END $$;

-- Create a more restrictive policy for admins to manage all fields including active
DROP POLICY IF EXISTS "Admins can manage all tickets" ON collection_tickets;

CREATE POLICY "Admins can manage all tickets including active status"
  ON collection_tickets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Update collector view policy to only show active tickets
DROP POLICY IF EXISTS "Collectors can view their assigned tickets" ON collection_tickets;

CREATE POLICY "Collectors can view their active assigned tickets"
  ON collection_tickets FOR SELECT
  TO authenticated
  USING (
    assigned_collector_id = auth.uid() AND active = true
  );

-- Update collector update policy to only allow updates on active tickets
DROP POLICY IF EXISTS "Collectors can update their assigned tickets" ON collection_tickets;

CREATE POLICY "Collectors can update their active assigned tickets"
  ON collection_tickets FOR UPDATE
  TO authenticated
  USING (
    assigned_collector_id = auth.uid() AND active = true
  )
  WITH CHECK (
    assigned_collector_id = auth.uid() AND active = true
  );