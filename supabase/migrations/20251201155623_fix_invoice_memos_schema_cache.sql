/*
  # Fix Invoice Memos Schema Cache Issue
  
  1. Issue
    - Supabase REST API returning "column user_id does not exist" error
    - Column exists in database but not exposed properly through REST API
    
  2. Solution
    - Notify PostgREST to reload schema cache
    - Ensure all columns are properly indexed and accessible
*/

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verify the invoice_memos table structure
DO $$
DECLARE
  v_column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'invoice_memos' 
    AND column_name = 'user_id'
  ) INTO v_column_exists;
  
  IF NOT v_column_exists THEN
    RAISE EXCEPTION 'Column user_id does not exist in invoice_memos table';
  END IF;
  
  RAISE NOTICE 'Column user_id exists in invoice_memos table';
END $$;

-- Add helpful comment to the table
COMMENT ON TABLE invoice_memos IS 'Stores user notes and memos for invoices with attachments';
COMMENT ON COLUMN invoice_memos.user_id IS 'References the user who created the memo (from user_profiles table)';
