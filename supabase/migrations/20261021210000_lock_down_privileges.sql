/*
  # Close four critical privilege holes (audit C3, C4, C6, C7)

  All four verified against the live database before changing anything.

  C4 PRIVILEGE ESCALATION. `authenticated` AND `anon` held UPDATE on
  user_profiles.role, account_status, organization_id, is_super_admin and
  permissions, and the only self-update policy is
  USING/CHECK (id = auth.uid()) -- nothing stopped a user setting their own
  role. Any logged-in user could run
      update user_profiles set role='admin', is_super_admin=true
       where id = auth.uid()
  and become an admin, or move themselves into the other organization.
  anon additionally held INSERT/UPDATE/DELETE/TRUNCATE on the table. RLS and
  the lack of a DELETE policy blunted some of that, but TRUNCATE ignores RLS
  entirely; none of it is needed, because signup writes profiles through the
  SECURITY DEFINER trigger handle_new_user, not through the anon role.

  C7 ACCOUNT TAKEOVER. password_reset_tokens had a SELECT policy for
  {anon, authenticated} with USING (used = false AND expires_at > now()) --
  i.e. anyone holding the public anon key could list every LIVE reset token
  together with its user_email, and use one to take an account over. It returns
  [] only because no reset is currently outstanding. Only two edge functions
  read this table and both use the service role, so no caller needs the policy.

  C3/C6 ANON-CALLABLE MUTATORS. Eight SECURITY DEFINER functions were
  EXECUTE-able by anon. delete_extra_payment is the worst: it permanently
  deletes a payment and its applications, change log, attachments and fetch
  logs, with no auth check. Proven live -- an anonymous POST to
  /rest/v1/rpc/delete_extra_payment returned HTTP 200 and ran. Every caller of
  all eight lives in src/ behind a login, so none of them needs anon.

  Role changes keep working: UserManagementSidebar goes through the new
  admin_set_user_role() below, which verifies the caller is an admin AND that
  the target is in the caller's own organization.
*/

-- ── C4: user_profiles ──────────────────────────────────────────────────────

-- anon has no business writing profiles at all.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_profiles FROM anon;

-- Signed-in users may edit their own harmless fields, never their standing.
REVOKE UPDATE ON public.user_profiles FROM authenticated;
GRANT  UPDATE (full_name, assigned_color, ui_preferences, must_change_password)
    ON public.user_profiles TO authenticated;

/*
  Admin-gated role change. SECURITY DEFINER so it can write the column the
  caller no longer holds, with the two checks the old direct UPDATE lacked:
  the caller must be an admin, and the target must be in the caller's own org
  (an admin of the demo org must not be able to re-role a live-org user).
*/
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
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
    RAISE EXCEPTION 'Only an admin can change a user''s role';
  END IF;

  IF p_role NOT IN ('admin','manager','collector','secretary','viewer','user','customer') THEN
    RAISE EXCEPTION 'Unknown role: %', p_role;
  END IF;

  SELECT organization_id INTO v_caller_org FROM user_profiles WHERE id = auth.uid();
  SELECT organization_id INTO v_target_org FROM user_profiles WHERE id = p_user_id;

  IF v_target_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'That user is not in your organization';
  END IF;

  UPDATE user_profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

-- ── C7: password reset tokens ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can validate their own tokens" ON public.password_reset_tokens;
REVOKE SELECT ON public.password_reset_tokens FROM anon, authenticated;

-- ── C3/C6: stop anon calling SECURITY DEFINER mutators ─────────────────────

REVOKE EXECUTE ON FUNCTION public.delete_extra_payment(text, text)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.reassign_invoice_collector(uuid, uuid, uuid, text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_ticket_priority(uuid, text, uuid)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_email_to_folder(uuid, text)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_temporary_password_used(uuid)                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_user_login(uuid)                                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_user_logout(uuid)                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_filter_last_used(uuid)                          FROM anon;

-- C6: and make the destructive one check who is calling, and scope to their org.
CREATE OR REPLACE FUNCTION public.delete_extra_payment(p_reference_number text, p_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_payment_id uuid;
  v_deleted integer := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only an admin can delete a payment';
  END IF;

  SELECT id INTO v_payment_id
    FROM acumatica_payments
   WHERE reference_number = p_reference_number
     AND type = p_type
     AND organization_id = get_user_org_id();   -- never another org's payment

  IF v_payment_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM payment_invoice_applications      WHERE payment_id = v_payment_id;
  DELETE FROM payment_change_log                WHERE payment_id = v_payment_id;
  DELETE FROM payment_attachments               WHERE payment_id = v_payment_id;
  DELETE FROM payment_application_fetch_logs    WHERE payment_id = v_payment_id;
  DELETE FROM acumatica_payments                WHERE id = v_payment_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_extra_payment(text, text) FROM anon;

NOTIFY pgrst, 'reload schema';
