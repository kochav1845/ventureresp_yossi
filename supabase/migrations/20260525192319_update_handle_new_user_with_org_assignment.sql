/*
  # Update handle_new_user trigger to assign organization

  1. Changes
    - When a new user signs up, read org_slug from user metadata
    - Look up the organization by slug and assign the user to it
    - Super admin (a88933513@gmail.com) gets no org restriction

  2. Notes
    - Frontend passes org_slug in raw_user_meta_data during signup
    - If no org_slug provided, organization_id stays NULL
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_account_status text;
  v_full_name text;
  v_is_approved boolean;
  v_org_slug text;
  v_org_id uuid;
BEGIN
  RAISE LOG 'handle_new_user trigger fired for email: %', NEW.email;

  -- Check if this user is being approved from pending (via metadata)
  v_is_approved := COALESCE((NEW.raw_user_meta_data->>'approved_from_pending')::boolean, false);

  -- Get org_slug from metadata
  v_org_slug := NEW.raw_user_meta_data->>'org_slug';
  IF v_org_slug IS NOT NULL AND v_org_slug != '' THEN
    SELECT id INTO v_org_id FROM organizations WHERE slug = v_org_slug AND is_active = true;
  END IF;

  IF v_is_approved THEN
    RAISE LOG 'User % is being approved from pending_users (via metadata)', NEW.email;
    v_role := 'user';
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
    -- Use org from metadata if not already set
    IF v_org_id IS NULL THEN
      v_org_slug := NEW.raw_user_meta_data->>'organization_slug';
      IF v_org_slug IS NOT NULL THEN
        SELECT id INTO v_org_id FROM organizations WHERE slug = v_org_slug AND is_active = true;
      END IF;
    END IF;
  ELSE
    RAISE LOG 'User % is regular signup', NEW.email;
    v_role := CASE 
      WHEN NEW.email = 'a88933513@gmail.com' THEN 'admin'
      ELSE 'user'
    END;
    v_account_status := 'approved';
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NULL);
  END IF;

  -- Insert or update user profile with conflict handling
  INSERT INTO public.user_profiles (id, email, role, account_status, full_name, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_account_status,
    v_full_name,
    v_org_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    account_status = EXCLUDED.account_status,
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    organization_id = COALESCE(EXCLUDED.organization_id, user_profiles.organization_id),
    updated_at = now();

  RAISE LOG 'Successfully created/updated user_profile for % with org_id %', NEW.email, v_org_id;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user trigger for email %: % %', NEW.email, SQLSTATE, SQLERRM;
    RAISE;
END;
$$;
