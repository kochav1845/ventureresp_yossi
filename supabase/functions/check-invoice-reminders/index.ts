import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // LEFT join, not !inner: a reminder doesn't have to hang off an invoice.
    // Ticket reminders and due-date reminders that only carry a reference
    // number were silently never triggered under the inner join.
    const { data: dueReminders, error: fetchError } = await supabase
      .from('invoice_reminders')
      .select(`
        *,
        acumatica_invoices(reference_number, customer, customer_name),
        collection_tickets(ticket_number, customer_name)
      `)
      .eq('is_triggered', false)
      .is('completed_at', null)
      .lte('reminder_date', now);

    if (fetchError) {
      throw fetchError;
    }

    if (!dueReminders || dueReminders.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No reminders due',
          triggered: 0
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const notifications = dueReminders.map(reminder => {
      // Name whatever the reminder is actually about; none of these are
      // guaranteed to be present now that the join is a LEFT one.
      const invRef =
        (reminder.acumatica_invoices as any)?.reference_number ||
        reminder.invoice_reference_number;
      const ticketNo = (reminder.collection_tickets as any)?.ticket_number;
      const about = invRef
        ? `Invoice ${invRef}`
        : ticketNo
        ? `Ticket ${ticketNo}`
        : null;

      return {
        user_id: reminder.user_id,
        reminder_id: reminder.id,
        invoice_id: reminder.invoice_id,
        message: about
          ? `Reminder for ${about}: ${reminder.title}`
          : `Reminder: ${reminder.title}`,
      };
    });

    const { error: notifError } = await supabase
      .from('user_reminder_notifications')
      .insert(notifications);

    if (notifError) {
      throw notifError;
    }

    const reminderIds = dueReminders.map(r => r.id);
    const { error: updateError } = await supabase
      .from('invoice_reminders')
      .update({
        is_triggered: true,
        triggered_at: now
      })
      .in('id', reminderIds);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Triggered ${dueReminders.length} reminder(s)`,
        triggered: dueReminders.length,
        reminders: dueReminders.map(r => ({
          id: r.id,
          invoice: (r.acumatica_invoices as any).reference_number,
          user_id: r.user_id,
          message: r.title
        }))
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error checking reminders:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
});