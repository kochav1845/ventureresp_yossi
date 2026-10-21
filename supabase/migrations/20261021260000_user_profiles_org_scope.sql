/*
  # user_profiles was cross-org readable AND cross-org WRITABLE (audit C2)

  Commit 94ad6d6 filtered the nine people-lists in the app by organization, and
  deliberately left the RLS alone for the read. The write was never addressed,
  and it is the dangerous half: every admin UPDATE policy is just `is_admin()`,
  which checks role and account_status and never the organization. So the demo
  org's admin -- demo@demo.com, the shared login behind the public
  stardevar.dev/demo, which anyone can sign up for -- could send one PATCH to
  /rest/v1/user_profiles and demote all seven live admins to 'viewer', locking
  the real company out of its own admin screens, or promote itself by editing a
  live profile.

  Every policy here now carries `organization_id = get_user_org_id()`. The reads
  change nothing visible, because the app already filters each list to the same
  organization; they just stop the API answering for the other tenant. A super
  admin switching organizations still works: get_user_org_id() honours the
  x-org-id header for super admins.

  Also dropped: "Allow profile creation during signup", an INSERT policy on
  {anon} with WITH CHECK true -- i.e. anyone holding the public anon key could
  insert an arbitrary profile row, with any id, any organization and
  role='admin'. Nothing needs it: profiles are created by handle_new_user(),
  which is SECURITY DEFINER and bypasses RLS, and by service-role callers, which
  have their own policy.

  The two identical "Admins can read all profiles" / "Admins can view all
  profiles" SELECT policies are collapsed into one.
*/

-- SELECT
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view profiles in their org"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (is_admin() AND organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Managers can view all profiles" ON public.user_profiles;
CREATE POLICY "Managers can view profiles in their org"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (is_manager_or_admin() AND organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can view collectors for assignment" ON public.user_profiles;
CREATE POLICY "Users can view collectors for assignment"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    role = ANY (ARRAY['collector'::text, 'manager'::text, 'admin'::text])
    AND account_status = 'approved'::text
    AND organization_id = get_user_org_id()
  );

-- "Users can read own profile" is left as is: a user must be able to read their
-- own row to resolve their organization in the first place.

-- UPDATE
DROP POLICY IF EXISTS "Admins can update any profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.user_profiles;
CREATE POLICY "Admins can update profiles in their org"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (is_admin() AND organization_id = get_user_org_id())
  WITH CHECK (is_admin() AND organization_id = get_user_org_id());

-- INSERT
DROP POLICY IF EXISTS "Allow profile creation during signup" ON public.user_profiles;
