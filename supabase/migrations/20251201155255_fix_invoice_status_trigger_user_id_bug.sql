/*
  # Fix Invoice Status Change Trigger Bug
  
  1. Issue
    - Trigger function uses wrong column name 'user_id' instead of 'id'
    - This causes "column user_id does not exist" error when updating invoice color status
  
  2. Fix
    - Update trigger function to use correct column name 'id' 
    - Ensures user color is properly fetched and stored
*/

CREATE OR REPLACE FUNCTION update_invoice_last_modified_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.color_status IS DISTINCT FROM NEW.color_status) THEN
    NEW.last_modified_by := auth.uid();
    NEW.last_modified_by_color := (
      SELECT assigned_color 
      FROM user_profiles 
      WHERE id = auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$;
