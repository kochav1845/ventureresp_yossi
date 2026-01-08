import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { pending_user_id } = await req.json();

    if (!pending_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing pending_user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing approval for pending user:', pending_user_id);

    // Get the pending user
    const { data: pendingUser, error: fetchError } = await supabaseAdmin
      .from('pending_users')
      .select('*')
      .eq('id', pending_user_id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !pendingUser) {
      console.error('Pending user not found:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Pending user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found pending user:', pendingUser.email);

    // Create the auth user with metadata flag for approval
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: pendingUser.email,
      password: pendingUser.password_hash,
      email_confirm: true,
      user_metadata: {
        full_name: pendingUser.full_name,
        approved_from_pending: true  // Flag for trigger to recognize approved user
      }
    });

    if (createError) {
      console.error('Error creating auth user:', createError);
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auth user created successfully:', authData.user.id);

    // Now mark the pending user as approved
    const { error: updateError } = await supabaseAdmin
      .from('pending_users')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', pending_user_id);

    if (updateError) {
      console.error('Error updating pending user status:', updateError);
      // Not critical, user is already created
    }

    console.log('User approval completed successfully');

    return new Response(
      JSON.stringify({ success: true, user: authData.user }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});