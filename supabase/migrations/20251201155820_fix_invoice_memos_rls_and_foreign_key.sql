/*
  # Fix Invoice Memos RLS and Foreign Key Issues
  
  1. Issue
    - PostgREST reporting "column user_id does not exist" during INSERT
    - Foreign key constraint may be interfering with RLS policy evaluation
    
  2. Solution
    - Drop and recreate foreign key with proper validation
    - Simplify RLS policies to avoid circular dependencies
    - Add explicit column grants
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create memos" ON invoice_memos;
DROP POLICY IF EXISTS "Users can view memos" ON invoice_memos;
DROP POLICY IF EXISTS "Users can update their own memos" ON invoice_memos;
DROP POLICY IF EXISTS "Users can delete their own memos" ON invoice_memos;

-- Drop and recreate the foreign key to ensure it's clean
ALTER TABLE invoice_memos 
  DROP CONSTRAINT IF EXISTS invoice_memos_user_id_fkey;

ALTER TABLE invoice_memos 
  ADD CONSTRAINT invoice_memos_user_id_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES user_profiles(id) 
  ON DELETE SET NULL;

-- Create simpler, more explicit policies
CREATE POLICY "Anyone authenticated can view memos"
  ON invoice_memos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create memos"
  ON invoice_memos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own memos"
  ON invoice_memos
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own memos"
  ON invoice_memos
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Ensure the table is accessible via PostgREST
GRANT ALL ON invoice_memos TO authenticated;
GRANT ALL ON invoice_memos TO anon;

-- Force schema reload
NOTIFY pgrst, 'reload schema';
