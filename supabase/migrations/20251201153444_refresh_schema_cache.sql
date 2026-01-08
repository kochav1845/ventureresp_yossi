/*
  # Refresh PostgREST Schema Cache
  
  1. Purpose
    - Force PostgREST to reload the schema cache
    - Ensures the API recognizes the correct column name 'reference_number'
  
  2. Notes
    - This is a no-op migration that triggers cache refresh
    - Helps resolve "Could not find the 'reference_nbr' column" errors
*/

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
