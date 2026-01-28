import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  to: string;
  name: string;
  temporaryPassword: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { to, name, temporaryPassword }: RequestBody = await req.json();

    if (!to || !name || !temporaryPassword) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, name, temporaryPassword" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const loginUrl = `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.com') || 'https://your-app.com'}/signin`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Venture Respiratory Admin Portal</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container {
              background-color: #ffffff;
              border-radius: 8px;
              padding: 40px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #2563eb;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #2563eb;
              margin-bottom: 10px;
            }
            .title {
              font-size: 20px;
              font-weight: 600;
              color: #1f2937;
              margin-bottom: 10px;
            }
            .greeting {
              font-size: 16px;
              color: #4b5563;
              margin-bottom: 20px;
            }
            .password-box {
              background-color: #f3f4f6;
              border: 2px solid #2563eb;
              border-radius: 6px;
              padding: 20px;
              margin: 25px 0;
              text-align: center;
            }
            .password-label {
              font-size: 14px;
              font-weight: 600;
              color: #6b7280;
              margin-bottom: 10px;
            }
            .password {
              font-family: 'Courier New', monospace;
              font-size: 18px;
              font-weight: bold;
              color: #1f2937;
              background-color: #ffffff;
              padding: 12px;
              border-radius: 4px;
              letter-spacing: 1px;
            }
            .instructions {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .instructions strong {
              color: #b45309;
            }
            .button {
              display: inline-block;
              background-color: #2563eb;
              color: #ffffff;
              text-decoration: none;
              padding: 14px 32px;
              border-radius: 6px;
              font-weight: 600;
              margin: 20px 0;
              transition: background-color 0.3s;
            }
            .button:hover {
              background-color: #1d4ed8;
            }
            .steps {
              list-style: none;
              padding: 0;
              margin: 20px 0;
            }
            .steps li {
              padding: 10px 0;
              padding-left: 30px;
              position: relative;
            }
            .steps li:before {
              content: "✓";
              position: absolute;
              left: 0;
              background-color: #10b981;
              color: white;
              width: 20px;
              height: 20px;
              border-radius: 50%;
              text-align: center;
              line-height: 20px;
              font-size: 12px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
              font-size: 14px;
              color: #6b7280;
            }
            .warning {
              background-color: #fee2e2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
              color: #991b1b;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Venture Respiratory</div>
              <div class="title">Welcome to the Admin Portal</div>
            </div>

            <div class="greeting">
              Hello ${name},
            </div>

            <p>
              An administrator has created an account for you in the Venture Respiratory Admin Portal.
              You can now access the system to manage customers, invoices, and collections.
            </p>

            <div class="password-box">
              <div class="password-label">Your Temporary Password</div>
              <div class="password">${temporaryPassword}</div>
            </div>

            <div class="instructions">
              <strong>Important:</strong> This temporary password expires in 7 days.
              Please log in as soon as possible to set your own permanent password.
            </div>

            <div style="text-align: center;">
              <a href="${loginUrl}" class="button">Log In Now</a>
            </div>

            <div>
              <h3 style="color: #1f2937; font-size: 16px;">Getting Started:</h3>
              <ul class="steps">
                <li>Click the "Log In Now" button above</li>
                <li>Enter your email address: <strong>${to}</strong></li>
                <li>Use the temporary password shown above</li>
                <li>You'll be prompted to create a new permanent password</li>
                <li>Start managing your collections!</li>
              </ul>
            </div>

            <div class="warning">
              <strong>Security Note:</strong> Please do not share this temporary password with anyone.
              If you did not expect this email, please contact your system administrator immediately.
            </div>

            <div class="footer">
              <p>This is an automated email from Venture Respiratory Admin Portal.</p>
              <p>If you have any questions, please contact your administrator.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailText = `
Welcome to Venture Respiratory Admin Portal

Hello ${name},

An administrator has created an account for you in the Venture Respiratory Admin Portal.

YOUR TEMPORARY PASSWORD: ${temporaryPassword}

IMPORTANT: This temporary password expires in 7 days. Please log in as soon as possible to set your own permanent password.

To get started:
1. Visit: ${loginUrl}
2. Enter your email: ${to}
3. Use the temporary password above
4. You'll be prompted to create a new permanent password
5. Start managing your collections!

SECURITY NOTE: Please do not share this temporary password with anyone. If you did not expect this email, please contact your system administrator immediately.

This is an automated email from Venture Respiratory Admin Portal.
    `;

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    if (!SENDGRID_API_KEY) {
      console.error('SendGrid API key not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured. Please contact administrator.' }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const emailData = {
      personalizations: [
        {
          to: [{ email: to, name: name }],
          subject: 'Welcome to Venture Respiratory - Temporary Password',
        },
      ],
      from: {
        email: 'noreply@starwork.dev',
        name: 'Venture Respiratory Admin',
      },
      content: [
        {
          type: 'text/html',
          value: emailHtml,
        },
      ],
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SendGrid error:', errorText);
      return new Response(
        JSON.stringify({
          error: 'Failed to send email',
          details: errorText,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('Temporary password email sent successfully to:', to);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error sending temporary password email:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send email",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
