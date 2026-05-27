/*
  # Create customer picker list function

  1. New Function
    - `get_customer_picker_list()` - Returns all customers for the current user's org
      - Returns: customer_id, customer_name, email_address
      - Uses SECURITY DEFINER with explicit org filtering to avoid RLS issues
      - Deduplicates by customer_name

  2. Purpose
    - Provides a reliable way to fetch all customers for dropdowns/pickers
    - Handles orgs with >1000 customers
    - Explicitly filters by user's organization_id from user_profiles
*/

CREATE OR REPLACE FUNCTION get_customer_picker_list()
RETURNS TABLE(customer_id text, customer_name text, email_address text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM user_profiles
  WHERE id = auth.uid();

  RETURN QUERY
  SELECT DISTINCT ON (ac.customer_name)
    ac.customer_id,
    ac.customer_name,
    ac.email_address
  FROM acumatica_customers ac
  WHERE ac.organization_id = v_org_id
    AND ac.customer_name IS NOT NULL
  ORDER BY ac.customer_name;
END;
$$;
