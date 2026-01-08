import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  customerName: string;
  customerEmail: string;
  totalBalance: number;
  pdfBase64: string;
  paymentUrl?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { customerName, customerEmail, totalBalance, pdfBase64, paymentUrl }: RequestBody = await req.json();

    if (!customerName || !customerEmail || !pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    if (!SENDGRID_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'SendGrid API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    };

    const emailData = {
      personalizations: [
        {
          to: [{ email: customerEmail, name: customerName }],
          subject: `Invoice Statement - ${formatCurrency(totalBalance)} Due`,
        },
      ],
      from: {
        email: 'invoices@starwork.dev',
        name: 'Accounts Receivable',
      },
      content: [
        {
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e293b;">Invoice Statement</h2>
              <p>Dear ${customerName},</p>
              <p>Please find attached your current invoice statement.</p>
              <div style="background-color: #fee; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
                <strong style="color: #dc2626; font-size: 18px;">Total Balance Due: ${formatCurrency(totalBalance)}</strong>
              </div>
              ${paymentUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${paymentUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  💳 Pay Now Securely
                </a>
              </div>
              ` : ''}
              <p>Please review the attached statement and remit payment at your earliest convenience.</p>
              <p>If you have any questions, please don't hesitate to contact us.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              <p style="color: #64748b; font-size: 12px;">Thank you for your business!</p>
            </div>
          `,
        },
      ],
      attachments: [
        {
          content: pdfBase64,
          filename: `Invoice_Statement_${new Date().toISOString().split('T')[0]}.png`,
          type: 'image/png',
          disposition: 'attachment',
        },
      ],
      tracking_settings: {
        click_tracking: {
          enable: false,
          enable_text: false
        },
        open_tracking: {
          enable: false
        }
      }
    };

    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!sendGridResponse.ok) {
      const errorText = await sendGridResponse.text();
      console.error('SendGrid error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorText }),
        {
          status: sendGridResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
