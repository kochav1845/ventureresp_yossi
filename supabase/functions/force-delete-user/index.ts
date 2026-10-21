import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Work that deleting the user would silently destroy or orphan, through
// ON DELETE CASCADE / SET NULL on user_profiles. invoice_assignments is the
// sharp one: it is what puts invoices on tickets (and on the Invoices tab), and
// it cascades, so deleting a collector used to strip their invoices off every
// ticket without a word. reassign_and_delete_user() hands all of it over.
const ASSIGNED_WORK: Array<{ table: string; column: string; label: string }> = [
  { table: 'invoice_assignments', column: 'assigned_collector_id', label: 'assigned invoice(s)' },
  { table: 'collection_tickets', column: 'assigned_collector_id', label: 'ticket(s) assigned to them' },
  { table: 'ticket_collectors', column: 'collector_id', label: 'ticket(s) shared with them' },
  { table: 'collector_customer_assignments', column: 'assigned_collector_id', label: 'customer(s) assigned to them' },
  { table: 'collector_assignments', column: 'collector_id', label: 'collector assignment(s)' },
  { table: 'invoice_collector_assignments', column: 'collector_id', label: 'invoice collector assignment(s)' },
  { table: 'collector_email_schedules', column: 'collector_id', label: 'scheduled collector email(s)' },
  { table: 'auto_ticket_rules', column: 'assigned_collector_id', label: 'auto-ticket rule(s) assigning to them' },
  { table: 'auto_ticket_rules', column: 'created_by', label: 'auto-ticket rule(s) they created' },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log('Force delete user request received');

    // reassign_to: user id who takes over the target's work, when they hold any.
    const { email, reassign_to } = await req.json();
    if (!email) {
      return json({ error: 'Email is required' }, 400);
    }
    const target = String(email).trim().toLowerCase();
    console.log('Email to delete:', target);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabaseAdmin = createClient(
      supabaseUrl ?? '',
      serviceRoleKey ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // ── AuthZ: caller must be an authenticated admin ──
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const anonClient = createClient(supabaseUrl ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user: caller } } = await anonClient.auth.getUser(token);
    if (!caller) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles').select('role, organization_id').eq('id', caller.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: 'Forbidden: admin only' }, 403);
    }
    // Admin of one organization only. Without this, the demo org's admin could
    // delete Venture's users.
    const { data: superRow } = await supabaseAdmin
      .from('super_admins').select('user_id').eq('user_id', caller.id).maybeSingle();
    const isSuper = !!superRow;
    const sameOrg = (orgId: string | null) => isSuper || orgId === callerProfile.organization_id;

    // ── Find the target ──
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles').select('id, email, full_name, organization_id').eq('email', target).maybeSingle();
    if (profileError) {
      console.error('Error looking up profile:', profileError);
      return json({ error: 'Failed to look up user', details: profileError.message }, 500);
    }

    let userId: string;
    if (profile) {
      if (!sameOrg(profile.organization_id)) {
        return json({ error: 'That user belongs to another organization' }, 403);
      }
      userId = profile.id;
    } else {
      // No profile: a stuck sign-up that the Force Delete page clears so the
      // email can register again. listUsers returns 50 per page; walk them all.
      let found: { id: string } | undefined;
      for (let page = 1; !found; page++) {
        const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) {
          console.error('Error listing users:', listError);
          return json({ error: 'Failed to list users', details: listError.message }, 500);
        }
        found = data.users.find(u => u.email?.toLowerCase() === target);
        if (data.users.length < 1000) break;
      }
      if (!found) {
        return json({ error: `No account found for ${target}` }, 404);
      }
      // Its only link to an organization is a pending sign-up request.
      const { data: pending } = await supabaseAdmin
        .from('pending_users').select('organization_id').eq('email', target);
      if ((pending ?? []).some(p => p.organization_id && !sameOrg(p.organization_id))) {
        return json({ error: 'That account belongs to another organization' }, 403);
      }
      userId = found.id;
    }

    if (userId === caller.id) {
      return json({ error: 'You cannot delete your own account here' }, 400);
    }
    const who = profile?.full_name || target;

    // After a delete: clear their sign-up request so the email can register again.
    const clearPending = async () => {
      let pendingDelete = supabaseAdmin.from('pending_users').delete().eq('email', target);
      if (!isSuper) {
        pendingDelete = pendingDelete.or(`organization_id.is.null,organization_id.eq.${callerProfile.organization_id}`);
      }
      const { error: pendingDeleteError } = await pendingDelete;
      if (pendingDeleteError) {
        console.error('Error deleting pending user:', pendingDeleteError);
      }
    };

    // ── Work a delete would destroy: hand it over, or refuse ──
    if (profile) {
      const held: string[] = [];
      for (const w of ASSIGNED_WORK) {
        const { count, error: countError } = await supabaseAdmin
          .from(w.table).select('*', { count: 'exact', head: true }).eq(w.column, userId);
        if (countError) {
          console.error(`Error counting ${w.table}.${w.column}:`, countError);
          return json({ error: 'Could not check what this user is assigned to, so nothing was deleted', details: countError.message }, 500);
        }
        if (count) held.push(`${count} ${w.label}`);
      }

      if (held.length) {
        // Who may take it: the same people the ticket screens offer as collectors.
        const { data: candidates, error: candidatesError } = await supabaseAdmin
          .from('user_profiles').select('id, full_name, email')
          .eq('organization_id', profile.organization_id)
          .in('role', ['collector', 'manager', 'admin'])
          .eq('account_status', 'approved')
          .neq('id', userId)
          .order('full_name');
        if (candidatesError) {
          console.error('Error loading candidates:', candidatesError);
          return json({ error: 'Could not load who can take over, so nothing was deleted', details: candidatesError.message }, 500);
        }

        if (!reassign_to) {
          return json({
            error: `${who} can't be deleted yet: they still have ${held.join(', ')}. Deleting them would remove that work, so choose who takes it over.`,
            needs_reassign: true,
            held,
            candidates: (candidates ?? []).map(c => ({ id: c.id, name: c.full_name || c.email, email: c.email })),
          }, 409);
        }
        const recipient = (candidates ?? []).find(c => c.id === reassign_to);
        if (!recipient) {
          return json({ error: 'The person taking over must be an approved collector, manager or admin in the same organization' }, 400);
        }

        // Moves everything and deletes the user in ONE transaction: if anything
        // fails, nothing has moved.
        console.log('Reassigning work of', userId, 'to', recipient.id, 'then deleting');
        const { data: moved, error: rpcError } = await supabaseAdmin
          .rpc('reassign_and_delete_user', { p_user: userId, p_to: recipient.id, p_actor: caller.id });
        if (rpcError) {
          console.error('Error reassigning/deleting:', rpcError);
          if (rpcError.code === '23503') {
            return json({
              error: `${who} can't be deleted: their name is on records in the system (notes, memos, status changes or edits) that must keep it. Nothing was moved.`,
              details: rpcError.message,
            }, 409);
          }
          return json({ error: 'Failed to reassign and delete user. Nothing was moved.', details: rpcError.message }, 500);
        }

        await clearPending();
        return json({
          success: true,
          message: `${who}'s work went to ${recipient.full_name || recipient.email}, and ${who} has been deleted`,
          userId,
          reassigned_to: recipient.id,
          moved,
        });
      }
    }

    // ── Delete ──
    // One delete, on auth.users. user_profiles.id cascades from it, so the login
    // and the profile go together or not at all. (Deleting the profile first, as
    // this used to, could leave a login with no profile if the auth delete failed.)
    console.log('Deleting user', userId);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      // History tables (notes, memos, status changes, edits...) reference the user
      // with NO ACTION, so Postgres refuses; GoTrue reports it as a database error.
      if (/database error/i.test(deleteError.message ?? '')) {
        return json({
          error: `${who} can't be deleted: their name is on records in the system (notes, memos, status changes or edits) that must keep it.`,
          details: deleteError.message,
        }, 409);
      }
      return json({ error: 'Failed to delete user', details: deleteError.message }, 500);
    }

    await clearPending();
    return json({
      success: true,
      message: `User ${target} has been completely deleted`,
      userId,
    });

  } catch (error) {
    console.error('Error:', error);
    return json({ error: error.message }, 500);
  }
});
