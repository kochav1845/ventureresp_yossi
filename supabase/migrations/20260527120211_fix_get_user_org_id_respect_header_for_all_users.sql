/*
  # Fix get_user_org_id to respect x-org-id header for all users

  1. Changes
    - Modified `get_user_org_id()` to allow any authenticated user to use the `x-org-id` header
      if their `user_profiles.organization_id` matches the requested org
    - Super admins can still switch to any org
    - Regular users can only use the header if it matches their own org (no change in effective behavior, 
      but ensures the header is always read properly)

  2. Security
    - Non-super-admin users cannot access orgs they don't belong to
    - Super admins retain full org switching capability
*/

CREATE OR REPLACE FUNCTION get_user_org_id() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_org_id uuid;
  v_cached text;
  v_header_org text;
  v_is_super boolean;
  v_user_org uuid;
BEGIN
  -- Fast path: check session cache
  v_cached := current_setting('app.current_org_id', true);
  IF v_cached IS NOT NULL AND v_cached != '' THEN
    RETURN v_cached::uuid;
  END IF;

  -- Get user's own org
  SELECT organization_id INTO v_user_org
  FROM user_profiles
  WHERE id = auth.uid();

  -- Check if there's a header-specified org
  BEGIN
    v_header_org := current_setting('request.headers', true)::json->>'x-org-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_org := NULL;
  END;

  IF v_header_org IS NOT NULL AND v_header_org != '' THEN
    -- Super admins can switch to any org
    SELECT EXISTS(SELECT 1 FROM super_admins WHERE user_id = auth.uid()) INTO v_is_super;
    IF v_is_super THEN
      v_org_id := v_header_org::uuid;
      PERFORM set_config('app.current_org_id', v_org_id::text, true);
      RETURN v_org_id;
    END IF;

    -- Regular users: use header only if it matches their own org
    IF v_user_org IS NOT NULL AND v_user_org::text = v_header_org THEN
      PERFORM set_config('app.current_org_id', v_user_org::text, true);
      RETURN v_user_org;
    END IF;
  END IF;

  -- Default: use user's own org
  IF v_user_org IS NOT NULL THEN
    PERFORM set_config('app.current_org_id', v_user_org::text, true);
  END IF;

  RETURN v_user_org;
END;
$$;
