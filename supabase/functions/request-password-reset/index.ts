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
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user exists in auth.users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error checking user:', authError);
      return new Response(
        JSON.stringify({ error: 'Failed to process request' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userExists = authUsers.users.find(u => u.email === email);
    
    // Always return success even if user doesn't exist (security best practice)
    if (!userExists) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return new Response(
        JSON.stringify({ success: true, message: 'If that email exists, a reset link has been sent' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate a secure random token
    const token = crypto.randomUUID() + '-' + crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    // Store the token in the database
    const { error: insertError } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_email: email,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Error storing token:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create reset token' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create reset URL with token
    const resetUrl = `https://ventureresp.app/reset-password?resetlink=${token}`;

    // Send email with reset link
    const emailSubject = 'Reset Your Password';
    const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset</h1>
  </div>
  
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    <div style="background: white; padding: 25px; border-radius: 8px;">
      <h2 style="color: #2d3748; margin-top: 0; font-size: 22px;">Reset Your Password</h2>
      
      <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
        You recently requested to reset your password. Click the button below to reset it.
      </p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #06b6d4 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
      </div>
      
      <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #eab308;">
        <p style="margin: 0; color: #854d0e; font-size: 14px;"><strong>⚠️ Security Notice:</strong></p>
        <p style="margin: 8px 0 0 0; color: #854d0e; font-size: 14px;">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
      </div>
      
      <p style="color: #718096; font-size: 14px; margin-top: 20px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color: #3182ce; font-size: 12px; word-break: break-all;">
        ${resetUrl}
      </p>
    </div>
    
    <p style="text-align: center; color: #718096; font-size: 14px; margin-top: 20px;">
      If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    </p>
  </div>
</body>
</html>
    `;

    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email-reply`;
    const emailResponse = await fetch(sendEmailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        to: email,
        subject: emailSubject,
        html: emailBody,
      }),
    });

    if (!emailResponse.ok) {
      const sendError = await emailResponse.json();
      console.error('Error sending email:', sendError);
      return new Response(
        JSON.stringify({ error: 'Failed to send reset email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Password reset email sent to ${email}`);

    return new Response(
      JSON.stringify({ success: true, message: 'If that email exists, a reset link has been sent' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in request-password-reset function:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
