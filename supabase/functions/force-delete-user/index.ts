import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log('Force delete user request received');

    const { email } = await req.json();
    console.log('Email to delete:', email);

    if (!email) {
      console.error('No email provided');
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey
    });

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const anonClient = createClient(supabaseUrl ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    const { data: { user: caller } } = await anonClient.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles').select('role').eq('id', caller.id).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Don't let an admin delete themselves via this endpoint.
    if (caller.email === email) {
      return new Response(JSON.stringify({ error: 'You cannot delete your own account here' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Listing all users to find target...');
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    console.log('listUsers response:', { hasData: !!users, error: listError });

    if (listError) {
      console.error('Error listing users:', listError);
      return new Response(
        JSON.stringify({ error: 'Failed to list users', details: listError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!users || !users.users) {
      console.error('No users data returned');
      return new Response(
        JSON.stringify({ error: 'No users data returned from auth system' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${users.users.length} total users, searching for ${email}`);
    const user = users.users.find(u => u.email === email);
    console.log('User found:', !!user);

    if (!user) {
      console.log('User not found in auth system');
      return new Response(
        JSON.stringify({ message: 'User not found in auth system', email }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found user with ID:', user.id);

    // Delete from user_profiles first
    const { error: profileDeleteError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', user.id);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
    }

    // Delete from pending_users if exists
    const { error: pendingDeleteError } = await supabaseAdmin
      .from('pending_users')
      .delete()
      .eq('email', email);

    if (pendingDeleteError) {
      console.error('Error deleting pending user:', pendingDeleteError);
    }

    // Delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user', details: deleteError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${email} has been completely deleted`,
        userId: user.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
