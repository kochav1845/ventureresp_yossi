/*
  # Fix handle_new_user to use full_name from metadata for all signups

  Currently the trigger only sets full_name when the user is approved from pending.
  This change makes it always pick up full_name from user metadata.
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    RAISE LOG 'User % is being approved from pending_users (via metadata)', NEW.email;
    v_role := 'customer';
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  ELSE
    RAISE LOG 'User % is regular signup', NEW.email;
    v_role := CASE 
      WHEN NEW.email = 'a88933513@gmail.com' THEN 'admin'
      ELSE 'customer'
    END;
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NULL);
  END IF;

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
$$;
