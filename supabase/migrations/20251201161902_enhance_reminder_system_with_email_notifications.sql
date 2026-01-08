/*
  # Enhanced Reminder System with Email Notifications
  
  1. Changes
    - Add email notification support to invoice_reminders
    - Add completion tracking and notes
    - Add categories and priorities
    - Create reminder notifications tracking table
    - Add indexes for efficient querying
    
  2. New Features
    - Email notifications for reminders
    - Completion status tracking
    - Additional notes on reminders
    - Priority levels
    - Notification history
*/

-- Add new columns to invoice_reminders table
ALTER TABLE invoice_reminders
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_by_user_id uuid,
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS send_email_notification boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS reminder_type text DEFAULT 'general' CHECK (reminder_type IN ('call', 'email', 'meeting', 'payment', 'follow_up', 'general'));

-- Create table for tracking reminder notifications
CREATE TABLE IF NOT EXISTS reminder_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES invoice_reminders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('email', 'popup', 'both')),
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_user_id ON invoice_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_reminder_date ON invoice_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_completed ON invoice_reminders(completed_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_email_pending ON invoice_reminders(send_email_notification, email_sent, reminder_date) WHERE send_email_notification = true AND email_sent = false;
CREATE INDEX IF NOT EXISTS idx_reminder_notifications_user_id ON reminder_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_notifications_dismissed ON reminder_notifications(dismissed_at) WHERE dismissed_at IS NULL;

-- Enable RLS on reminder_notifications
ALTER TABLE reminder_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reminder_notifications
CREATE POLICY "Users can view their own reminder notifications"
  ON reminder_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert reminder notifications"
  ON reminder_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own reminder notifications"
  ON reminder_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own reminder notifications"
  ON reminder_notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create function to get reminder counts by date range
CREATE OR REPLACE FUNCTION get_reminder_counts(p_user_id uuid)
RETURNS TABLE (
  today_count bigint,
  tomorrow_count bigint,
  this_week_count bigint,
  next_week_count bigint,
  overdue_count bigint,
  total_active_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE DATE(reminder_date AT TIME ZONE 'UTC') = CURRENT_DATE) as today_count,
    COUNT(*) FILTER (WHERE DATE(reminder_date AT TIME ZONE 'UTC') = CURRENT_DATE + INTERVAL '1 day') as tomorrow_count,
    COUNT(*) FILTER (WHERE reminder_date AT TIME ZONE 'UTC' BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days') as this_week_count,
    COUNT(*) FILTER (WHERE reminder_date AT TIME ZONE 'UTC' BETWEEN CURRENT_DATE + INTERVAL '7 days' AND CURRENT_DATE + INTERVAL '14 days') as next_week_count,
    COUNT(*) FILTER (WHERE reminder_date < NOW() AND completed_at IS NULL) as overdue_count,
    COUNT(*) FILTER (WHERE completed_at IS NULL) as total_active_count
  FROM invoice_reminders
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get active reminders for today
CREATE OR REPLACE FUNCTION get_todays_active_reminders(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  invoice_id uuid,
  reminder_date timestamptz,
  reminder_message text,
  priority text,
  reminder_type text,
  notes text,
  invoice_reference text,
  customer_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ir.id,
    ir.invoice_id,
    ir.reminder_date,
    ir.reminder_message,
    ir.priority,
    ir.reminder_type,
    ir.notes,
    ai.reference_number as invoice_reference,
    ai.customer_name
  FROM invoice_reminders ir
  LEFT JOIN acumatica_invoices ai ON ir.invoice_id = ai.id
  WHERE ir.user_id = p_user_id
    AND ir.completed_at IS NULL
    AND DATE(ir.reminder_date AT TIME ZONE 'UTC') <= CURRENT_DATE
  ORDER BY ir.priority DESC, ir.reminder_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE reminder_notifications IS 'Tracks when and how reminder notifications were sent to users';
COMMENT ON COLUMN invoice_reminders.send_email_notification IS 'Whether to send an email when reminder is due';
COMMENT ON COLUMN invoice_reminders.priority IS 'Priority level: low, medium, high, urgent';
COMMENT ON COLUMN invoice_reminders.reminder_type IS 'Type of reminder: call, email, meeting, payment, follow_up, general';
