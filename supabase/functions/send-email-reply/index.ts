import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendEmailRequest {
  to: string;
  subject: string;
  body?: string;
  html?: string;
  inbound_email_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { to, subject, body, html, inbound_email_id }: SendEmailRequest = await req.json();

    if (!to || !subject || (!body && !html)) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: to, subject, and either body or html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = [];
    if (body) {
      content.push({
        type: "text/plain",
        value: body,
      });
    }
    if (html) {
      content.push({
        type: "text/html",
        value: html,
      });
    }

    const emailData = {
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: {
        email: "ventureresp@starwork.dev",
        name: "Venture Response Team",
      },
      subject: subject,
      content: content,
      tracking_settings: {
        click_tracking: {
          enable: false,
          enable_text: false,
        },
        open_tracking: {
          enable: false,
        },
      },
    };

    console.log("Sending email via SendGrid:", { to, subject });

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("SendGrid API error:", errorText);
      throw new Error(`SendGrid error: ${response.status} - ${errorText}`);
    }

    console.log("Email sent successfully via SendGrid");

    if (inbound_email_id) {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("outbound_replies").insert({
        inbound_email_id: inbound_email_id,
        sent_to: to,
        subject: subject,
        body: body || html || '',
        sent_by: user?.id,
        sent_at: new Date().toISOString(),
      });

      console.log("Reply logged in database");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
