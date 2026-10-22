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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── AuthZ ───────────────────────────────────────────────────────────────
    // This had no auth check of any kind. An unauthenticated POST of
    // {"recipient_emails":["attacker@example.com"]} would render every due
    // reminder -- title, private notes, priority, customer name, invoice
    // reference -- and mail the lot to that address, then mark them email_sent
    // so the collectors they belonged to never got them. Repeating it also made
    // the company's SendGrid account a free open relay.
    //
    // The cron wrapper send_reminder_emails_via_cron() calls this with the
    // service-role key, which is the internal path below.
    const authToken = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isCron = authToken === supabaseKey;
    let callerOrgId: string | null = null;

    if (!isCron) {
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
      const { data: { user: caller } } = await anonClient.auth.getUser(authToken);
      if (!caller) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: callerProfile } = await supabase
        .from('user_profiles').select('role, account_status, organization_id').eq('id', caller.id).maybeSingle();
      if (!callerProfile
          || (callerProfile as any).account_status !== 'approved'
          || !['admin', 'manager'].includes((callerProfile as any).role)) {
        return new Response(JSON.stringify({ error: 'Forbidden: admin or manager only' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      callerOrgId = (callerProfile as any).organization_id ?? null;
      if (!callerOrgId) {
        return new Response(JSON.stringify({ error: 'Caller has no organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    let recipientEmails: string[] = [];
    try {
      const body = await req.json();
      // Only a signed-in admin/manager may redirect reminders, and only their
      // own organization's reminders are in scope (below). The cron path never
      // accepts an override.
      recipientEmails = (!isCron && Array.isArray(body?.recipient_emails)) ? body.recipient_emails : [];
    } catch {
      // no body
    }

    // A manual, targeted nudge: scope to the caller's organization by resolving
    // whose reminders may be touched at all.
    let allowedUserIds: string[] | null = null;
    if (!isCron) {
      const { data: orgUsers } = await supabase
        .from('user_profiles').select('id').eq('organization_id', callerOrgId);
      allowedUserIds = (orgUsers || []).map((u: any) => u.id);
      if (allowedUserIds.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'No users in organization', total: 0, results: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const now = new Date();
    const { data: reminders, error: fetchError } = await supabase
      .from('invoice_reminders')
      .select(`
        id,
        user_id,
        invoice_id,
        invoice_reference_number,
        ticket_id,
        title,
        description,
        reminder_date,
        priority,
        reminder_type,
        notes,
        send_email_notification,
        email_sent,
        completed_at,
        acumatica_invoices (
          reference_number,
          customer_name
        ),
        collection_tickets (
          ticket_number,
          customer_name
        )
      `)
      .eq('send_email_notification', true)
      .eq('email_sent', false)
      .is('completed_at', null)
      .lte('reminder_date', now.toISOString())
      .order('reminder_date', { ascending: true })
      .limit(500);

    if (fetchError) {
      throw fetchError;
    }

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No reminders to process', total: 0, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only reminders this caller is allowed to touch. On the cron path that is
    // all of them; for a manual send it is the caller's own organization, so a
    // live-org reminder can never be mailed to a demo-org address.
    const inScope = allowedUserIds
      ? reminders.filter(r => allowedUserIds!.includes(r.user_id))
      : reminders;

    if (inScope.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No reminders in scope', total: 0, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Each reminder's own owner. The old code built one de-duplicated union of
    // the owners of ALL due reminders and then sent EVERY reminder to EVERY
    // address in it -- reminders.length x targets.length emails. Two collectors
    // with a reminder due in the same 5-minute window each read the other's
    // private note, customer name and invoice reference, and when a live
    // reminder shared a window with any of the 2,800 demo ones, a real
    // customer's details went to mike.chen@demo.com. Live data confirmed it:
    // 2026-07-26 09:06 UTC sent 6 reminders belonging to 4 distinct users.
    const ownerIds = [...new Set(inScope.map(r => r.user_id))];
    const { data: owners } = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', ownerIds);
    const ownerEmail = new Map((owners || []).map((u: any) => [u.id, u.email]));

    const emailResults: any[] = [];

    for (const reminder of inScope) {
      const invoiceRef = reminder.invoice_reference_number || (reminder as any).acumatica_invoices?.reference_number;
      const customerName = (reminder as any).acumatica_invoices?.customer_name || (reminder as any).collection_tickets?.customer_name;
      const ticketNumber = (reminder as any).collection_tickets?.ticket_number;
      const ticketId = reminder.ticket_id;

      const appDomain = 'https://stardevar.com';
      const reminderUrl = `${appDomain}/reminders?id=${reminder.id}`;
      const invoiceUrl = invoiceRef ? `${appDomain}/customers?invoice=${invoiceRef}` : null;
      const ticketUrl = ticketId ? `${appDomain}/ticketing?ticket=${ticketId}` : null;

      const emailSubject = `Reminder: ${reminder.title}`;
      const emailBody = buildEmailHtml(reminder, invoiceRef, customerName, ticketNumber, reminderUrl, invoiceUrl, ticketUrl);

      // Cron: the owner, and only the owner. Manual: the addresses the
      // admin named.
      const targets = recipientEmails.length > 0
        ? recipientEmails
        : [ownerEmail.get(reminder.user_id)].filter(Boolean) as string[];

      if (targets.length === 0) {
        emailResults.push({ id: reminder.id, status: 'skipped', error: 'No email address for the reminder owner' });
        continue;
      }

      let allSentOk = true;

      for (const targetEmail of targets) {
        try {
          const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email-reply`;
          const emailResponse = await fetch(sendEmailUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              to: targetEmail,
              subject: emailSubject,
              html: emailBody,
              department: 'reminders',
            }),
          });

          if (!emailResponse.ok) {
            const sendError = await emailResponse.json();
            emailResults.push({ id: reminder.id, email: targetEmail, status: 'failed', error: sendError.message });
            allSentOk = false;
          } else {
            emailResults.push({ id: reminder.id, email: targetEmail, status: 'sent' });
          }
        } catch (error) {
          emailResults.push({ id: reminder.id, email: targetEmail, status: 'error', error: (error as Error).message });
          allSentOk = false;
        }
      }

      // Mark email_sent only when the OWNER was mailed. A manual nudge to
      // other addresses must not suppress the owner's own notification -- that
      // is how reminders used to vanish: they were marked sent after going to
      // somebody else entirely.
      const ownerWasMailed = recipientEmails.length === 0
        && emailResults.some(r => r.id === reminder.id && r.status === 'sent');

      if (ownerWasMailed) {
        await supabase
          .from('invoice_reminders')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          })
          .eq('id', reminder.id);

        await supabase.from('reminder_notifications').insert({
          reminder_id: reminder.id,
          user_id: reminder.user_id,
          notification_type: 'email',
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Reminder emails processed',
        total: inScope.length,
        mode: recipientEmails.length > 0 ? 'manual' : 'cron',
        results: emailResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function buildEmailHtml(
  reminder: any,
  invoiceRef: string | null,
  customerName: string | null,
  ticketNumber: string | null,
  reminderUrl: string,
  invoiceUrl: string | null,
  ticketUrl: string | null
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0d9488 0%, #115e59 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Reminder Alert</h1>
  </div>
  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    <div style="background: white; padding: 25px; border-radius: 8px; border-left: 4px solid ${getPriorityColor(reminder.priority)};">
      <h2 style="color: #2d3748; margin-top: 0; font-size: 22px;">${reminder.title}</h2>
      <div style="margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>Priority:</strong> <span style="background: ${getPriorityBadgeColor(reminder.priority)}; padding: 4px 12px; border-radius: 12px; font-size: 12px; text-transform: uppercase;">${reminder.priority}</span></p>
        <p style="margin: 8px 0;"><strong>Type:</strong> ${formatReminderType(reminder.reminder_type)}</p>
        <p style="margin: 8px 0;"><strong>Due:</strong> ${new Date(reminder.reminder_date).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
        ${ticketNumber ? `<p style="margin: 8px 0;"><strong>Ticket:</strong> #${ticketNumber}</p>` : ''}
        ${invoiceRef ? `<p style="margin: 8px 0;"><strong>Invoice:</strong> ${invoiceRef}</p>` : ''}
        ${customerName ? `<p style="margin: 8px 0;"><strong>Customer:</strong> ${customerName}</p>` : ''}
      </div>
      ${reminder.description || reminder.notes ? `
      <div style="background: #f7fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #4a5568;"><strong>Notes:</strong></p>
        <p style="margin: 8px 0 0 0; color: #4a5568;">${reminder.description || reminder.notes}</p>
      </div>` : ''}
      <div style="margin-top: 30px; text-align: center;">
        <a href="${reminderUrl}" style="display: inline-block; background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin-bottom: 10px;">View & Mark Complete</a>
        <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          ${invoiceUrl ? `<a href="${invoiceUrl}" style="display: inline-block; background: #48bb78; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px;">View Invoice</a>` : ''}
          ${ticketUrl ? `<a href="${ticketUrl}" style="display: inline-block; background: #ed8936; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px;">View Ticket</a>` : ''}
        </div>
      </div>
    </div>
    <p style="text-align: center; color: #718096; font-size: 14px; margin-top: 20px;">
      This is an automated reminder from your collection system.
    </p>
  </div>
</body>
</html>`;
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#dc2626';
    case 'high': return '#f97316';
    case 'medium': return '#eab308';
    case 'low': return '#22c55e';
    default: return '#6b7280';
  }
}

function getPriorityBadgeColor(priority: string): string {
  switch (priority) {
    case 'urgent': return '#fecaca';
    case 'high': return '#fed7aa';
    case 'medium': return '#fef3c7';
    case 'low': return '#bbf7d0';
    default: return '#e5e7eb';
  }
}

function formatReminderType(type: string): string {
  const types: { [key: string]: string } = {
    call: 'Phone Call',
    email: 'Email',
    meeting: 'Meeting',
    payment: 'Payment',
    follow_up: 'Follow Up',
    general: 'General',
  };
  return types[type] || type;
}
