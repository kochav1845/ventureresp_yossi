/*
  # Remove Duplicate Customer Balance Function
  
  There are two overloaded versions of get_customers_with_balance causing ambiguity.
  Drop the old version without p_date_context parameter.
*/

-- Drop the old version without p_date_context
DROP FUNCTION IF EXISTS get_customers_with_balance(
  text, text, text, text, text, integer, integer, 
  timestamp with time zone, timestamp with time zone, 
  text, numeric, numeric, integer, integer, numeric, numeric
);
