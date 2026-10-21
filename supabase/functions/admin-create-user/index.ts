import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Create a fully-formed user account from the management screens.
 *
 * The previous flow called supabase.auth.signUp() from the browser. With this
 * project's mailer_autoconfirm turned on that RETURNS A SESSION, so the admin
 * doing the creating was silently signed out and signed in as the new user.
 * It also left the new account on role 'customer' (the on_auth_user_created
 * trigger always sets that) and leaned on an emailed temporary password, so the
 * person still had to go through an outside sign-in step.
 *
 * Doing it here with the service role fixes all of that: the admin's own
 * session is never touched, the account is created already confirmed, and the
 * role and organization are set straight away. The new user just logs in with
 * the password shown on screen.
 *
 * POST { email, full_name, role, password? }
 *   -> { user_id, email, password, generated }
 *
 * The caller must be an admin. The organization is always taken from the
 * CALLER's profile — never from the request — so an admin cannot create users
 * inside another organization.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Roles an admin may hand out here. 'customer' is the trigger's default. */
const ALLOWED_ROLES = ['admin', 'manager', 'collector', 'secretary', 'viewer', 'user', 'customer'];

function generatePassword(): string {
  // Avoid look-alike characters: someone will be reading this off a screen.
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*?';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 14) chars.push(pick(all));

  // Shuffle so the guaranteed classes aren't always in the same positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── AuthZ: the caller must be an authenticated admin ──
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user: caller } } = await anonClient.auth.getUser(token);
    if (!caller) return json({ error: 'Unauthorized' }, 401);

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role, organization_id, full_name, account_status')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.account_status !== 'approved' || callerProfile.role !== 'admin') {
      return json({ error: 'Forbidden: admin only' }, 403);
    }
    if (!callerProfile.organization_id) {
      return json({ error: 'Your account has no organization, so users cannot be created.' }, 400);
    }

    // ── input ──
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.full_name ?? '').trim();
    const role = String(body.role ?? '').trim();
    const suppliedPassword = body.password ? String(body.password) : '';

    if (!email || !email.includes('@')) return json({ error: 'A valid email address is required' }, 400);
    if (!fullName) return json({ error: 'Full name is required' }, 400);
    if (!ALLOWED_ROLES.includes(role)) {
      return json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` }, 400);
    }
    if (suppliedPassword && suppliedPassword.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Report an existing account clearly instead of surfacing a raw auth error.
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id, email, organization_id')
      .eq('email', email)
      .maybeSingle();
    if (existingProfile) {
      return json({ error: `An account already exists for ${email}` }, 409);
    }

    const generated = !suppliedPassword;
    const password = suppliedPassword || generatePassword();

    // email_confirm: the account is usable immediately — no confirmation link,
    // which is the whole point of creating it from in here.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        organization_id: callerProfile.organization_id,
        created_by_admin: true,
      },
    });

    if (createError || !created?.user) {
      const msg = createError?.message || 'User creation failed';
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      return json({ error: msg }, status);
    }

    const newUserId = created.user.id;

    // on_auth_user_created has already made the profile, but it hardcodes
    // role='customer'. Set what the admin actually chose.
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        full_name: fullName,
        role,
        account_status: 'approved',
        organization_id: callerProfile.organization_id,
        approved_by: caller.id,
        approved_at: new Date().toISOString(),
        // Bookkeeping only for now: nothing in the app reads this flag yet, so
        // it does NOT force a change at first login.
        must_change_password: generated,
      })
      .eq('id', newUserId);

    if (profileError) {
      // Don't leave a half-made account behind: an auth user whose profile
      // never got its role would be able to sign in with the wrong access.
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      return json({ error: `Could not set up the profile: ${profileError.message}` }, 500);
    }

    console.log(`[admin-create-user] ${caller.email} created ${email} as ${role}`);

    return json({
      user_id: newUserId,
      email,
      password,
      generated,
      role,
      organization_id: callerProfile.organization_id,
    });
  } catch (error) {
    console.error('[admin-create-user] unexpected error:', error);
    return json({ error: (error as Error).message ?? 'Unexpected error' }, 500);
  }
});
