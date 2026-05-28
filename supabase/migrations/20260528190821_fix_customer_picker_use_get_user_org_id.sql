/*
  # Fix customer picker to use get_user_org_id()

  1. Changes
    - Updated `get_customer_picker_list()` to use `get_user_org_id()` instead of
      directly querying `user_profiles.organization_id`
    - This ensures the function respects the x-org-id header used when viewing
      a demo org or when super admins switch orgs

  2. Impact
    - In demo mode, users will now see demo customers instead of real org customers
    - Super admins switching orgs will see the correct org's customers
*/

CREATE OR REPLACE FUNCTION get_customer_picker_list()
RETURNS TABLE(customer_id text, customer_name text, email_address text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  v_org_id := get_user_org_id();

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
