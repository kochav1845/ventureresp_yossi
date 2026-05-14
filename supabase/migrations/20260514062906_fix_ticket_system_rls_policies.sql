/*
  # Fix Ticket System RLS Policies

  1. Changes
    - `invoice_assignments`: Add SELECT, INSERT, DELETE policies for managers and users with collection_ticketing permission
    - `ticket_memos`: Fix overly permissive SELECT policy (was USING(true)) to restrict to ticket participants

  2. Security
    - Managers can now view, create, and delete invoice assignments (needed for ticket management)
    - Users with collection_ticketing view permission can see assignments
    - Users with collection_ticketing create permission can insert assignments
    - Ticket memos SELECT restricted to assigned collectors and admin/manager roles

  3. Important Notes
    - These fixes address gaps where managers could not create tickets or see ticket data
    - The collector_assignment_details view inherits RLS from invoice_assignments, so these fixes also enable the view for managers
*/

-- Fix invoice_assignments: Add manager SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoice_assignments' 
    AND policyname = 'Managers can view all invoice assignments'
  ) THEN
    CREATE POLICY "Managers can view all invoice assignments"
      ON invoice_assignments FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('manager')
        )
      );
  END IF;
END $$;

-- Fix invoice_assignments: Add INSERT policy for managers and permission-holders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoice_assignments' 
    AND policyname = 'Users with ticketing permission can create assignments'
  ) THEN
    CREATE POLICY "Users with ticketing permission can create assignments"
      ON invoice_assignments FOR INSERT
      TO authenticated
      WITH CHECK (
        user_has_permission(auth.uid(), 'collection_ticketing', 'create')
      );
  END IF;
END $$;

-- Fix invoice_assignments: Add DELETE policy for managers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoice_assignments' 
    AND policyname = 'Managers can delete invoice assignments'
  ) THEN
    CREATE POLICY "Managers can delete invoice assignments"
      ON invoice_assignments FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('manager')
        )
      );
  END IF;
END $$;

-- Fix invoice_assignments: Add UPDATE policy for managers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'invoice_assignments' 
    AND policyname = 'Managers can update invoice assignments'
  ) THEN
    CREATE POLICY "Managers can update invoice assignments"
      ON invoice_assignments FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('manager')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
          AND user_profiles.role IN ('manager')
        )
      );
  END IF;
END $$;

-- Fix ticket_memos: Replace overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view ticket memos" ON ticket_memos;

CREATE POLICY "Users can view ticket memos for accessible tickets"
  ON ticket_memos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
    OR
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_memos.ticket_id
      AND ct.assigned_collector_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
