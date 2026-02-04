import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface Reminder {
  id: string;
  user_id: string;
  invoice_id: string | null;
  title: string;
  reminder_date: string;
  priority: string;
  reminder_type: string;
  notes: string | null;
  user_email: string;
  invoice_reference?: string;
  customer_name?: string;
}

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

    console.log('Checking for due reminders...');

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
      .lte('reminder_date', now.toISOString());

    if (fetchError) {
      console.error('Error fetching reminders:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${reminders?.length || 0} reminders to process`);

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No reminders to process', emailsSent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = [...new Set(reminders.map(r => r.user_id))];
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', userIds);

    if (usersError) {
      console.error('Error fetching user emails:', usersError);
      throw usersError;
    }

    const userEmailMap = new Map(users?.map(u => [u.id, u.email]) || []);
    const emailResults = [];

    for (const reminder of reminders) {
      try {
        const userEmail = userEmailMap.get(reminder.user_id);
        if (!userEmail) {
          console.error(`No email found for user ${reminder.user_id}`);
          emailResults.push({ id: reminder.id, status: 'failed', error: 'User email not found' });
          continue;
        }

        const invoiceRef = reminder.invoice_reference_number || (reminder as any).acumatica_invoices?.reference_number;
        const customerName = (reminder as any).acumatica_invoices?.customer_name || (reminder as any).collection_tickets?.customer_name;
        const ticketNumber = (reminder as any).collection_tickets?.ticket_number;
        const ticketId = reminder.ticket_id;

        const appDomain = 'https://ventureresp.app';
        const reminderUrl = `${appDomain}/reminders?id=${reminder.id}`;
        const invoiceUrl = invoiceRef ? `${appDomain}/customers?invoice=${invoiceRef}` : null;
        const ticketUrl = ticketId ? `${appDomain}/ticketing?ticket=${ticketId}` : null;

        const emailSubject = `Reminder: ${reminder.title}`;
        const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔔 Reminder Alert</h1>
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
      </div>
      ` : ''}

      <div style="margin-top: 30px; text-align: center;">
        <a href="${reminderUrl}" style="display: inline-block; background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin-bottom: 10px;">View & Mark Complete</a>

        <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          ${invoiceUrl ? `<a href="${invoiceUrl}" style="display: inline-block; background: #48bb78; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px;">View Invoice</a>` : ''}
          ${ticketUrl ? `<a href="${ticketUrl}" style="display: inline-block; background: #ed8936; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 14px;">View Ticket</a>` : ''}
        </div>
      </div>
    </div>
    
    <p style="text-align: center; color: #718096; font-size: 14px; margin-top: 20px;">
      This is an automated reminder from your system. If you've already completed this task, you can mark it as complete by clicking the button above.
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
            to: userEmail,
            subject: emailSubject,
            html: emailBody,
          }),
        });

        const sendError = !emailResponse.ok ? await emailResponse.json() : null;

        if (sendError) {
          console.error(`Error sending email for reminder ${reminder.id}:`, sendError);
          emailResults.push({ id: reminder.id, status: 'failed', error: sendError.message });
          continue;
        }

        const { error: updateError } = await supabase
          .from('invoice_reminders')
          .update({
            email_sent: true,
            email_sent_at: new Date().toISOString(),
          })
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`Error updating reminder ${reminder.id}:`, updateError);
        }

        await supabase.from('reminder_notifications').insert({
          reminder_id: reminder.id,
          user_id: reminder.user_id,
          notification_type: 'email',
        });

        emailResults.push({ id: reminder.id, status: 'sent', email: userEmail });
        console.log(`Email sent successfully for reminder ${reminder.id}`);
      } catch (error) {
        console.error(`Error processing reminder ${reminder.id}:`, error);
        emailResults.push({ id: reminder.id, status: 'error', error: (error as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Reminder emails processed',
        total: reminders.length,
        results: emailResults,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-reminder-emails function:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

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
    call: '📞 Phone Call',
    email: '📧 Email',
    meeting: '🎥 Meeting',
    payment: '💰 Payment',
    follow_up: '💬 Follow Up',
    general: '📋 General',
  };
  return types[type] || type;
}
