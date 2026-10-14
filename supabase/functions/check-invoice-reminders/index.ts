import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// Reminders handled per run (the cron calls this every minute).
const BATCH_SIZE = 500;

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
    // A reminder with no user_id has nobody to notify (and the notification's
    // user_id is NOT NULL), so it is not "due" for this pass. Oldest first, in
    // bounded batches: a backlog drains over a few runs instead of one huge insert.
    const { data: dueReminders, error: fetchError } = await supabase
      .from('invoice_reminders')
      .select(`
        *,
        acumatica_invoices(reference_number, customer, customer_name),
        collection_tickets(ticket_number, customer_name)
      `)
      .eq('is_triggered', false)
      .is('completed_at', null)
      .not('user_id', 'is', null)
      .lte('reminder_date', now)
      .order('reminder_date', { ascending: true })
      .limit(BATCH_SIZE);

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
        // NULL for ticket / reference-only reminders (nullable since
        // 20261014200000_reminder_notifications_without_invoice).
        invoice_id: reminder.invoice_id ?? null,
        message: about
          ? `Reminder for ${about}: ${reminder.title}`
          : `Reminder: ${reminder.title}`,
      };
    });

    // One insert for the whole batch is the normal path. If it fails, fall back
    // to one row at a time so a single bad reminder can no longer block every
    // other reminder (that is how one NOT NULL column stopped all reminders for
    // days). Only reminders whose notification was written get marked triggered;
    // the failures stay pending, are retried next run, and are reported.
    let deliveredIds: string[] = [];
    const failed: { id: string; error: string }[] = [];

    const { error: notifError } = await supabase
      .from('user_reminder_notifications')
      .insert(notifications);

    if (!notifError) {
      deliveredIds = notifications.map(n => n.reminder_id);
    } else {
      console.error('Batch notification insert failed, retrying one by one:', notifError);
      for (const n of notifications) {
        const { error } = await supabase.from('user_reminder_notifications').insert(n);
        if (error) failed.push({ id: n.reminder_id, error: error.message });
        else deliveredIds.push(n.reminder_id);
        // Ten failures and not one success = the table itself is broken, not a
        // row. Stop instead of firing hundreds of doomed inserts every minute.
        if (failed.length >= 10 && deliveredIds.length === 0) break;
      }
    }

    if (deliveredIds.length > 0) {
      const { error: updateError } = await supabase
        .from('invoice_reminders')
        .update({
          is_triggered: true,
          triggered_at: now
        })
        .in('id', deliveredIds);

      if (updateError) {
        throw updateError;
      }
    }

    if (failed.length > 0) {
      console.error(`Could not deliver ${failed.length} reminder(s):`, JSON.stringify(failed.slice(0, 20)));
    }

    const delivered = new Set(deliveredIds);
    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        message: `Triggered ${deliveredIds.length} reminder(s)` +
          (failed.length ? `, ${failed.length} failed` : ''),
        triggered: deliveredIds.length,
        failed,
        reminders: dueReminders.filter(r => delivered.has(r.id)).map(r => ({
          id: r.id,
          invoice: (r.acumatica_invoices as any)?.reference_number ?? r.invoice_reference_number ?? null,
          ticket: (r.collection_tickets as any)?.ticket_number ?? null,
          user_id: r.user_id,
          message: r.title
        }))
      }),
      {
        // Nothing could be delivered at all -> still a failure for the monitors.
        status: failed.length > 0 && deliveredIds.length === 0 ? 500 : 200,
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