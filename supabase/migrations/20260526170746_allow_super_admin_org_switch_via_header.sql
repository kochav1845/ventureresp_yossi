/*
  # Allow super admins to switch org context via request header

  Super admins can view data from any org by passing an x-org-id header.
  Regular users always see their own org's data regardless of the header.

  Also creates an RPC function `set_org_context` that any user can call
  to set their org context for the session (validated against their profile
  or super_admin status).
*/

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_cached text;
  v_header_org text;
  v_is_super boolean;
BEGIN
  -- Try to get from session cache first
  BEGIN
    v_cached := current_setting('app.current_org_id', true);
    IF v_cached IS NOT NULL AND v_cached != '' THEN
      RETURN v_cached::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Check if there's a header-specified org (for super admins)
  BEGIN
    v_header_org := current_setting('request.headers', true)::json->>'x-org-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_org := NULL;
  END;

  IF v_header_org IS NOT NULL AND v_header_org != '' THEN
    -- Verify user is super admin
    SELECT EXISTS(SELECT 1 FROM super_admins WHERE user_id = auth.uid()) INTO v_is_super;
    IF v_is_super THEN
      v_org_id := v_header_org::uuid;
      PERFORM set_config('app.current_org_id', v_org_id::text, true);
      RETURN v_org_id;
    END IF;
  END IF;

  -- Regular user: look up from profile
  SELECT organization_id INTO v_org_id
  FROM user_profiles
  WHERE id = auth.uid();

  IF v_org_id IS NOT NULL THEN
    PERFORM set_config('app.current_org_id', v_org_id::text, true);
  END IF;

  RETURN v_org_id;
END;
$$;

-- Create a simple RPC to set org context for the current request
-- This is useful for the frontend to call before loading data
CREATE OR REPLACE FUNCTION set_org_context(p_org_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_user_org uuid;
  v_is_super boolean;
BEGIN
  -- Look up org by slug
  SELECT id INTO v_org_id FROM organizations WHERE slug = p_org_slug AND is_active = true;
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if user is super admin
  SELECT EXISTS(SELECT 1 FROM super_admins WHERE user_id = auth.uid()) INTO v_is_super;

  IF v_is_super THEN
    PERFORM set_config('app.current_org_id', v_org_id::text, true);
    RETURN v_org_id;
  END IF;

  -- Regular user: verify they belong to this org
  SELECT organization_id INTO v_user_org FROM user_profiles WHERE id = auth.uid();
  IF v_user_org = v_org_id THEN
    PERFORM set_config('app.current_org_id', v_org_id::text, true);
    RETURN v_org_id;
  END IF;

  -- User doesn't belong to this org, return their own org
  PERFORM set_config('app.current_org_id', v_user_org::text, true);
  RETURN v_user_org;
END;
$$;
