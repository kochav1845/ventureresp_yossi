/*
  # Anyone could self-register an approved account in the live org (audit C12)

  handle_new_user() set account_status := 'approved' in BOTH branches, and the
  only thing that stopped a pending user was a React query in SignIn.tsx run
  before signIn() was called. So a stranger could POST to submit-signup with
  {"org_slug":"ventureresp"}, then sign in straight against
  /auth/v1/token?grant_type=password with the public anon key -- never loading
  the sign-in page, so the gate never ran -- and hold a valid JWT on a profile
  in the LIVE organization.

  Two changes:

  1. Self-signup now lands in 'pending'. The approval path is untouched:
     approve-pending-user passes approved_from_pending, and admin-create-user,
     create-demo-user and seed-demo-data all set 'approved' explicitly.

  2. get_user_org_id() returns NULL unless the profile is approved. That is the
     server-side gate the app was missing: it is the predicate behind nearly
     every org-scoped RLS policy and SECURITY DEFINER function, so a pending
     JWT now reads nothing at all, whatever route it arrives by.

  All 22 existing profiles are already 'approved', so nobody is locked out.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role text;
  v_account_status text;
  v_full_name text;
  v_is_approved boolean;
  v_organization_id uuid;
  v_org_slug text;
BEGIN
  RAISE LOG 'handle_new_user trigger fired for email: %', NEW.email;

  -- Determine organization_id
  v_organization_id := (NEW.raw_user_meta_data->>'organization_id')::uuid;

  IF v_organization_id IS NULL THEN
    v_org_slug := NEW.raw_user_meta_data->>'org_slug';
    IF v_org_slug IS NOT NULL THEN
      SELECT id INTO v_organization_id FROM organizations WHERE slug = v_org_slug AND is_active = true;
    END IF;
  END IF;

  -- Check if this user is being approved from pending (via metadata)
  v_is_approved := COALESCE((NEW.raw_user_meta_data->>'approved_from_pending')::boolean, false);

  IF v_is_approved THEN
    v_role := 'customer';
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  ELSE
    v_role := CASE
      WHEN NEW.email = 'a88933513@gmail.com' THEN 'admin'
      ELSE 'customer'
    END;
    -- Was 'approved'. A self-signup is a REQUEST for access, not access: the
    -- caller chooses their own password and their own org_slug, so approving
    -- them here handed out live-org JWTs to anyone who could POST.
    v_account_status := CASE
      WHEN NEW.email = 'a88933513@gmail.com' THEN 'approved'
      ELSE 'pending'
    END;
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NULL);
  END IF;

  -- Remove any stale profile with same email but different id
  DELETE FROM public.user_profiles
  WHERE email = NEW.email AND id != NEW.id;

  -- Insert or update user profile with organization
  INSERT INTO public.user_profiles (id, email, role, account_status, full_name, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_account_status,
    v_full_name,
    v_organization_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    account_status = EXCLUDED.account_status,
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    organization_id = COALESCE(EXCLUDED.organization_id, user_profiles.organization_id),
    updated_at = now();

  RAISE LOG 'Successfully created/updated user_profile for %', NEW.email;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user trigger for email %: % %', NEW.email, SQLSTATE, SQLERRM;
    RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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

  -- Get user's own org. The account_status filter is the server-side approval
  -- gate: an unapproved profile resolves to NULL here, and since this function
  -- is the predicate behind nearly every org-scoped RLS policy and SECURITY
  -- DEFINER function, such a session reads nothing.
  SELECT organization_id INTO v_user_org
  FROM user_profiles
  WHERE id = auth.uid()
    AND account_status = 'approved';

  -- Check if there's a header-specified org
  BEGIN
    v_header_org := current_setting('request.headers', true)::json->>'x-org-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_org := NULL;
  END;

  IF v_header_org IS NOT NULL AND v_header_org != '' THEN
    -- Super admins can switch to any org
    SELECT EXISTS(
      SELECT 1 FROM super_admins sa
      JOIN user_profiles p ON p.id = sa.user_id
      WHERE sa.user_id = auth.uid() AND p.account_status = 'approved'
    ) INTO v_is_super;
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
$function$;
