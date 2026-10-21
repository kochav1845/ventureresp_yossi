/*
  # Restore the "can be assigned as collector" toggle, admin-gated

  20261021210000 revoked UPDATE on user_profiles from authenticated and granted
  back only (full_name, assigned_color, ui_preferences, must_change_password),
  to stop any user editing their own role / account_status / organization_id.
  That also took out the Manage Users toggle at UserManagementSidebar.tsx:216,
  which writes can_be_assigned_as_collector.

  Rather than grant that column to every signed-in user -- who could then mark
  themselves assignable -- this is an admin-gated setter with the same two
  checks as admin_set_user_role(): the caller must be an admin, and the target
  must be in the caller's own organization.
*/

CREATE OR REPLACE FUNCTION public.admin_set_can_be_collector(p_user_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller_org uuid;
  v_target_org uuid;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only an admin can change collector assignability';
  END IF;

  SELECT organization_id INTO v_caller_org FROM user_profiles WHERE id = auth.uid();
  SELECT organization_id INTO v_target_org FROM user_profiles WHERE id = p_user_id;

  IF v_target_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'That user is not in your organization';
  END IF;

  UPDATE user_profiles
     SET can_be_assigned_as_collector = COALESCE(p_value, false),
         updated_at = now()
   WHERE id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_can_be_collector(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_can_be_collector(uuid, boolean) TO authenticated;
