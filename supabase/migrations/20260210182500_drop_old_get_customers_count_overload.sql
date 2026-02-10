/*
  # Drop Old Count Function Overload

  1. Purpose
    - Remove the old 3-parameter version of get_customers_with_balance_count
    - Keep only the full-featured version with all parameters

  2. Impact
    - Cleaner function signature
    - No confusion between function overloads
*/

-- Drop the old 3-parameter version
DROP FUNCTION IF EXISTS get_customers_with_balance_count(text, text, text);
