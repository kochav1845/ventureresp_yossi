/*
  # Fix Invoice Reminders RLS Policy

  1. Changes
    - Simplify the INSERT policy for invoice_reminders
    - Allow any authenticated user to create reminders for themselves
    - Remove permission check that was blocking legitimate users
    
  2. Security
    - Still requires user_id = auth.uid() (users can only create their own reminders)
    - Maintains data integrity while improving usability
*/

-- Drop and recreate the INSERT policy without permission check
DROP POLICY IF EXISTS "Users can create their own reminders" ON invoice_reminders;

CREATE POLICY "Users can create their own reminders"
  ON invoice_reminders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Also simplify UPDATE policy
DROP POLICY IF EXISTS "Users can edit their own reminders" ON invoice_reminders;

CREATE POLICY "Users can edit their own reminders"
  ON invoice_reminders FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Simplify SELECT policy
DROP POLICY IF EXISTS "Users can view their own reminders" ON invoice_reminders;

CREATE POLICY "Users can view their own reminders"
  ON invoice_reminders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Simplify DELETE policy
DROP POLICY IF EXISTS "Users can delete their own reminders" ON invoice_reminders;

CREATE POLICY "Users can delete their own reminders"
  ON invoice_reminders FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());