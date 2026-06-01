import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      ticket_id,
      customer_id,
      to_email,
      subject,
      body_text,
      send_via = "sendgrid",
      smtp_config_id = null,
      after_send_action = "none",
      reminder_date = null,
      reminder_note = null,
      ticket_creation_mode = "manual",
    } = body;

    if (!ticket_id || !to_email || !subject || !body_text) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender configuration
    let fromEmail = "ar@ventureresp.app";
    let fromName = "Venture Respiratory - AR";
    let replyTo = fromEmail;

    // Check department sender for tickets
    const { data: deptSender } = await supabase
      .from("department_email_senders")
      .select("from_email, from_name, reply_to_email")
      .eq("department_key", "tickets")
      .eq("is_active", true)
      .maybeSingle();

    if (deptSender) {
      fromEmail = deptSender.from_email || fromEmail;
      fromName = deptSender.from_name || fromName;
      replyTo = deptSender.reply_to_email || fromEmail;
    }

    // Check global email settings
    const { data: emailSettings } = await supabase
      .from("email_settings")
      .select("ar_from_email, ar_from_name, reply_to_email")
      .limit(1)
      .maybeSingle();

    if (emailSettings && !deptSender) {
      fromEmail = emailSettings.ar_from_email || fromEmail;
      fromName = emailSettings.ar_from_name || fromName;
      replyTo = emailSettings.reply_to_email || fromEmail;
    }

    let sentSuccessfully = false;
    let sendError = "";

    if (send_via === "smtp" && smtp_config_id) {
      // SMTP sending via Deno's built-in SMTP
      const { data: smtpConfig } = await supabase
        .from("smtp_configurations")
        .select("*")
        .eq("id", smtp_config_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!smtpConfig) {
        return new Response(JSON.stringify({ error: "SMTP configuration not found or inactive" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For SMTP, we use the smtp config values
      fromEmail = smtpConfig.from_email;
      fromName = smtpConfig.from_name || fromName;

      // Use SendGrid as fallback since Deno Edge Functions can't do raw SMTP
      // The SMTP config tells us which "from" address to use via SendGrid
      // In production, you'd use a dedicated SMTP relay service
      if (sendgridKey) {
        const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sendgridKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to_email }] }],
            from: { email: fromEmail, name: fromName },
            reply_to: { email: replyTo, name: fromName },
            subject,
            content: [
              { type: "text/plain", value: body_text },
              { type: "text/html", value: body_text.replace(/\n/g, "<br>") },
            ],
            tracking_settings: {
              click_tracking: { enable: false },
              open_tracking: { enable: false },
            },
          }),
        });

        if (sgResponse.ok || sgResponse.status === 202) {
          sentSuccessfully = true;
        } else {
          const errText = await sgResponse.text();
          sendError = `SMTP/SendGrid error: ${errText}`;
        }
      } else {
        sendError = "No email sending service configured";
      }
    } else {
      // SendGrid sending
      if (!sendgridKey) {
        return new Response(JSON.stringify({ error: "SendGrid API key not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to_email }] }],
          from: { email: fromEmail, name: fromName },
          reply_to: { email: replyTo, name: fromName },
          subject,
          content: [
            { type: "text/plain", value: body_text },
            { type: "text/html", value: body_text.replace(/\n/g, "<br>") },
          ],
          tracking_settings: {
            click_tracking: { enable: false },
            open_tracking: { enable: false },
          },
        }),
      });

      if (sgResponse.ok || sgResponse.status === 202) {
        sentSuccessfully = true;
      } else {
        const errText = await sgResponse.text();
        sendError = `SendGrid error: ${errText}`;
      }
    }

    if (!sentSuccessfully) {
      return new Response(JSON.stringify({ error: sendError || "Failed to send email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the email in ticket_email_threads
    const { data: threadEntry, error: threadError } = await supabase
      .from("ticket_email_threads")
      .insert({
        ticket_id,
        customer_id,
        subject,
        direction: "outbound",
        from_email: fromEmail,
        to_email: to_email,
        body_text,
        body_html: body_text.replace(/\n/g, "<br>"),
        sent_via: send_via,
        smtp_config_id: send_via === "smtp" ? smtp_config_id : null,
        sent_by: user.id,
      })
      .select("id")
      .single();

    if (threadError) {
      console.error("Failed to log email thread:", threadError);
    }

    // Log activity on the ticket
    await supabase.from("collection_ticket_activity").insert({
      ticket_id,
      activity_type: "email_sent",
      description: `Email sent to ${to_email}: "${subject}"`,
      created_by: user.id,
    });

    // Handle after-send actions
    if (after_send_action === "reminder" || after_send_action === "both") {
      if (reminder_date) {
        await supabase.from("invoice_reminders").insert({
          user_id: user.id,
          title: reminderNote || `Follow up: ${subject}`,
          reminder_date: reminder_date,
          reminder_type: "custom",
          is_active: true,
        });
      }
    }

    if (after_send_action === "ticket" || after_send_action === "both") {
      if (ticket_creation_mode === "auto" && threadEntry?.id) {
        // Record the pending action for AI to decide later
        await supabase.from("ticket_email_actions").insert({
          email_thread_id: threadEntry.id,
          ticket_id,
          action_type: "create_ticket",
          action_status: "pending",
          action_data: { mode: "auto", customer_id, subject },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        thread_id: threadEntry?.id || null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
