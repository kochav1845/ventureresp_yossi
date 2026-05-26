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
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create demo user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: 'demo@demo.com',
      password: 'demo1234',
      email_confirm: true,
      user_metadata: {
        full_name: 'Demo User',
        org_slug: 'demo'
      }
    });

    if (createError) {
      return new Response(
        JSON.stringify({ success: false, error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update profile to be admin for the demo org
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        role: 'admin',
        organization_id: 'cc534e42-cf01-42a0-9337-afd66aca67a7',
        full_name: 'Demo User',
        account_status: 'approved'
      })
      .eq('id', authData.user.id);

    return new Response(
      JSON.stringify({ success: true, user_id: authData.user.id, update_error: updateError?.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
