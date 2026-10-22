import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { token, password, action } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate action
    if (action === 'validate') {
      // Just check if token is valid
      const { data: tokenData, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (tokenError || !tokenData) {
        return new Response(
          JSON.stringify({ valid: false, error: 'Invalid or expired token' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ valid: true, email: tokenData.user_email }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Reset password
    if (action === 'reset') {
      if (!password || password.length < 6) {
        return new Response(
          JSON.stringify({ error: 'Password must be at least 6 characters' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validate and fetch token
      const { data: tokenData, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (tokenError || !tokenData) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired token' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Look the user up through user_profiles, the same way
      // request-password-reset does, and case-insensitively.
      //
      // This used to be auth.admin.listUsers() plus
      // `users.find(u => u.email === tokenData.user_email)`, which had two
      // faults. (a) The comparison was exact, while the token row stores the
      // address exactly as the person typed it into the form -- someone who
      // typed FINANCE@VENTURERESP.COM got a token whose email never matched the
      // lowercase address in auth.users, so submitting a new password returned
      // "User not found" with no way to tell why. (b) listUsers() returns only
      // the first 50 users by default and was called with no pagination, so
      // past 50 accounts a reset would fail for everyone further down the list.
      // request-password-reset already carries a comment about that exact trap;
      // this half of the flow never got the same fix.
      const { data: profile, error: authError } = await supabase
        .from('user_profiles')
        .select('id, email')
        .ilike('email', tokenData.user_email)
        .maybeSingle();

      if (authError) {
        console.error('Error looking up user:', authError);
        return new Response(
          JSON.stringify({ error: 'Failed to reset password' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const user = profile;

      if (!user) {
        console.error('User not found for email:', tokenData.user_email);
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Update password using admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: password }
      );

      if (updateError) {
        console.error('Error updating password:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to reset password' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Mark token as used
      const { error: markUsedError } = await supabase
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('token', token);

      if (markUsedError) {
        console.error('Error marking token as used:', markUsedError);
      }

      console.log(`Password reset successful for email: ${tokenData.user_email}`);

      return new Response(
        JSON.stringify({ success: true, message: 'Password reset successfully' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in validate-and-reset-password function:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
