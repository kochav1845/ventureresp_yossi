/*
  # In-app reminder notifications for reminders that are not about an invoice

  check-invoice-reminders has selected ticket reminders and reference-number-only
  due-date reminders since "Due dates: schedule reminders ahead of them" (LEFT join
  instead of !inner). Those reminders have no invoice_id, but
  user_reminder_notifications.invoice_id was still NOT NULL from the days when every
  reminder hung off an invoice.

  The function inserts the whole batch in one statement, so a single ticket reminder
  made the insert fail: the function answered 500 on every cron run (once a minute
  since 2026-10-10 20:50 UTC) and NO reminder was triggered, including invoice ones.

  invoice_reminders.invoice_id has been nullable all along (ticket_id /
  invoice_reference_number cover the other cases), so the notification's copy of it
  must be nullable too. reminder_id still points at the reminder, which says what it
  is about. The FK (ON DELETE CASCADE) is unchanged.
*/

ALTER TABLE public.user_reminder_notifications
  ALTER COLUMN invoice_id DROP NOT NULL;

COMMENT ON COLUMN public.user_reminder_notifications.invoice_id IS
  'Invoice the reminder is about. NULL for ticket and reference-number-only reminders; reminder_id always identifies the reminder.';
