/*
  # Fix Color Status Change Tracking

  1. New Function
    - `update_invoice_color_status` - Properly sets user context and updates color status
  
  2. Changes
    - Ensures all color status changes are properly logged with user information
    - Automatically sets last_modified_by and last_modified_at
  
  3. Security
    - Function respects RLS policies
    - Only authenticated users can update color status
*/

-- Create function to update invoice color status with proper logging
CREATE OR REPLACE FUNCTION update_invoice_color_status(
  p_invoice_id uuid,
  p_color_status text,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  -- Set the session variable for the trigger
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
  
  -- Update the invoice
  UPDATE acumatica_invoices
  SET 
    color_status = p_color_status,
    last_modified_by = p_user_id,
    last_modified_at = now()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_invoice_color_status(uuid, text, uuid) TO authenticated;

-- Create function to batch update invoice color status
CREATE OR REPLACE FUNCTION batch_update_invoice_color_status(
  p_invoice_ids uuid[],
  p_color_status text,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  -- Set the session variable for the trigger
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
  
  -- Update all invoices
  UPDATE acumatica_invoices
  SET 
    color_status = p_color_status,
    last_modified_by = p_user_id,
    last_modified_at = now()
  WHERE id = ANY(p_invoice_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION batch_update_invoice_color_status(uuid[], text, uuid) TO authenticated;

-- Create function to update by reference number
CREATE OR REPLACE FUNCTION update_invoice_color_status_by_ref(
  p_reference_number text,
  p_color_status text,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  -- Set the session variable for the trigger
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
  
  -- Update the invoice
  UPDATE acumatica_invoices
  SET 
    color_status = p_color_status,
    last_modified_by = p_user_id,
    last_modified_at = now()
  WHERE reference_number = p_reference_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_invoice_color_status_by_ref(text, text, uuid) TO authenticated;

-- Create function to batch update by reference numbers
CREATE OR REPLACE FUNCTION batch_update_invoice_color_status_by_refs(
  p_reference_numbers text[],
  p_color_status text,
  p_user_id uuid
)
RETURNS void AS $$
BEGIN
  -- Set the session variable for the trigger
  PERFORM set_config('app.current_user_id', p_user_id::text, true);
  
  -- Update all invoices
  UPDATE acumatica_invoices
  SET 
    color_status = p_color_status,
    last_modified_by = p_user_id,
    last_modified_at = now()
  WHERE reference_number = ANY(p_reference_numbers);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION batch_update_invoice_color_status_by_refs(text[], text, uuid) TO authenticated;