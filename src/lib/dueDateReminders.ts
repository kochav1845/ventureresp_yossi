import { supabase } from './supabase';

/**
 * Reminders scheduled off a due date.
 *
 * Whenever a due date is set — on a hand-entered invoice, on a ticket — you can
 * ask to be reminded ahead of it. Each lead time becomes one row in
 * `invoice_reminders`, which is the same table the Reminders section lists and
 * the same one the two crons already drain:
 *
 *   check-invoice-reminders   every minute   → the in-app reminder/popup
 *   send-reminder-emails      every 5 min    → the email, when send_email_notification
 *
 * So nothing new has to run on a schedule; writing the rows is the whole job.
 *
 * NOTE on channels: the in-app pass triggers on every due reminder regardless
 * of flags, so an in-app reminder always happens and email is the opt-in extra.
 * That's why the plan has `sendEmail` rather than a 3-way channel choice — it
 * matches what the pipeline actually does.
 */

export interface DueDateReminderPlan {
  enabled: boolean;
  /** Days before the due date. 0 = on the due date itself. */
  offsets: number[];
  sendEmail: boolean;
  /** Local time of day to fire at, 'HH:MM'. */
  timeOfDay: string;
}

export const DEFAULT_REMINDER_PLAN: DueDateReminderPlan = {
  enabled: false,
  offsets: [3],
  sendEmail: true,
  timeOfDay: '09:00',
};

/** Offered as one-click chips; any other number can be typed in. */
export const OFFSET_PRESETS = [7, 3, 2, 1, 0];

export const offsetLabel = (days: number) =>
  days === 0 ? 'On the due date' : `${days} day${days === 1 ? '' : 's'} before`;

/** When a given lead time would actually fire, in local time. */
export function reminderDateFor(dueDate: string, offsetDays: number, timeOfDay: string): Date {
  const [h, m] = timeOfDay.split(':').map(Number);
  const d = new Date(`${dueDate}T00:00:00`);
  d.setDate(d.getDate() - offsetDays);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export interface CreateDueDateRemindersArgs {
  plan: DueDateReminderPlan;
  /** The due date itself, 'YYYY-MM-DD'. */
  dueDate: string;
  userId: string;
  title: string;
  description?: string | null;
  /** acumatica_invoices.id — set it when known so the in-app pass can name it. */
  invoiceId?: string | null;
  invoiceReference?: string | null;
  ticketId?: string | null;
  reminderType?: string;
  priority?: string;
}

export interface CreateDueDateRemindersResult {
  created: number;
  /** Lead times that already fell in the past and were not scheduled. */
  skippedPast: number[];
}

/**
 * Write one reminder per lead time. Lead times already in the past are skipped
 * rather than scheduled — back-dating a due date would otherwise fire every
 * reminder at once on the next cron tick.
 */
export async function createDueDateReminders(
  args: CreateDueDateRemindersArgs
): Promise<CreateDueDateRemindersResult> {
  const { plan, dueDate, userId } = args;
  if (!plan.enabled || !dueDate || !plan.offsets.length) {
    return { created: 0, skippedPast: [] };
  }

  const now = Date.now();
  const rows: any[] = [];
  const skippedPast: number[] = [];

  // De-duplicate and schedule the earliest first.
  for (const offset of [...new Set(plan.offsets)].sort((a, b) => b - a)) {
    const when = reminderDateFor(dueDate, offset, plan.timeOfDay);
    if (when.getTime() <= now) {
      skippedPast.push(offset);
      continue;
    }

    rows.push({
      user_id: userId,
      reminder_date: when.toISOString(),
      title: args.title,
      description:
        args.description ??
        `${offsetLabel(offset)} the due date (${dueDate})`,
      send_email_notification: plan.sendEmail,
      status: 'pending',
      reminder_type: args.reminderType || 'payment',
      priority: args.priority || 'medium',
      invoice_id: args.invoiceId || null,
      invoice_reference_number: args.invoiceReference || null,
      ticket_id: args.ticketId || null,
    });
  }

  if (rows.length) {
    const { error } = await supabase.from('invoice_reminders').insert(rows);
    if (error) throw error;
  }

  return { created: rows.length, skippedPast };
}
