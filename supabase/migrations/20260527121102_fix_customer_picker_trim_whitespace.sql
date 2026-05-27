/*
  # Fix customer picker to trim leading/trailing whitespace

  1. Changes
    - Updated `get_customer_picker_list()` to trim tabs, spaces, and non-breaking spaces
      from customer names before returning them
    - Orders by the trimmed name so entries sort correctly

  2. Reason
    - Some Acumatica customer names have leading tab or non-breaking space characters
    - These sort before alphabetical entries, appearing confusingly at the top of lists
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
  SELECT DISTINCT ON (trimmed_name)
    ac.customer_id,
    regexp_replace(btrim(ac.customer_name, E' \t\n\r' || chr(160)), '^\s+', '') as customer_name,
    ac.email_address
  FROM acumatica_customers ac,
    LATERAL (SELECT regexp_replace(btrim(ac.customer_name, E' \t\n\r' || chr(160)), '^\s+', '') as trimmed_name) t
  WHERE ac.organization_id = v_org_id
    AND ac.customer_name IS NOT NULL
    AND btrim(ac.customer_name, E' \t\n\r' || chr(160)) != ''
  ORDER BY trimmed_name;
END;
$$;
