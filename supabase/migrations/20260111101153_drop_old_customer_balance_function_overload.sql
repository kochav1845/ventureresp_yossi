/*
  # Drop Old Customer Balance Function Overload

  1. Changes
    - Drop the old version of get_customers_with_balance that doesn't have p_date_context
    - This resolves the function overloading conflict (PGRST203 error)

  2. Notes
    - The new version with p_date_context will remain and be the only version
*/

-- Drop the old version without p_date_context parameter
DROP FUNCTION IF EXISTS get_customers_with_balance(
  text, text, text, text, text, int, int, 
  timestamptz, timestamptz, text, numeric, numeric, 
  int, int, numeric, numeric
);
