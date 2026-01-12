/*
  # Drop Duplicate get_customers_with_balance Function

  1. Problem
    - Two function overloads exist with similar signatures
    - PostgreSQL cannot determine which one to call
    - Error: PGRST203 - Could not choose the best candidate function

  2. Solution
    - Drop the older version without p_date_context parameter
    - Keep only the newer version with all parameters
*/

DROP FUNCTION IF EXISTS get_customers_with_balance(
  text, text, text, text, text, integer, integer, 
  timestamptz, timestamptz, text, numeric, numeric, 
  integer, integer, numeric, numeric
);
