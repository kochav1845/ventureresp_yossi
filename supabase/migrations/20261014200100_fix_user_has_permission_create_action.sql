/*
  # user_has_permission(): the 'create' action always errored

  The three-argument overload built its column with format('SELECT can_%I ...', p_action).
  %I quotes the action on its own, and CREATE is a reserved word, so 'create' became
  can_"create" -- Postgres reads that as column can_ followed by a quoted name:

    ERROR 42703: column "can_" does not exist

  Every RLS policy that asks for 'create' therefore failed with a 400 for every
  non-admin (admins return early): invoice_assignments (assign a collector from a
  ticket), invoice_status_changes, customer_files, collector_assignments.
  ('view', 'edit' and 'delete' are not reserved, so they happened to work.)

  Fix: validate the action against the four columns that exist, build the whole
  column name, and quote it as one identifier.
*/

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text, p_action text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_role text;
  v_has_permission boolean;
  v_column text;
BEGIN
  SELECT role INTO v_user_role FROM user_profiles WHERE id = p_user_id;
  IF v_user_role = 'admin' THEN RETURN true; END IF;

  -- Only the four permission columns exist; anything else is simply not granted.
  IF p_action IS NULL OR p_action NOT IN ('view', 'create', 'edit', 'delete') THEN
    RETURN false;
  END IF;
  -- Quote the full column name (can_create), never just the action: 'create' is a
  -- reserved word and %I would turn it into can_"create".
  v_column := 'can_' || p_action;

  EXECUTE format('SELECT %I FROM user_custom_permissions WHERE user_id = $1 AND permission_key = $2', v_column)
  INTO v_has_permission USING p_user_id, p_permission_key;
  IF v_has_permission IS NOT NULL THEN RETURN v_has_permission; END IF;

  EXECUTE format('SELECT %I FROM role_permissions WHERE role = $1 AND permission_key = $2', v_column)
  INTO v_has_permission USING v_user_role, p_permission_key;

  RETURN COALESCE(v_has_permission, false);
END;
$function$;
