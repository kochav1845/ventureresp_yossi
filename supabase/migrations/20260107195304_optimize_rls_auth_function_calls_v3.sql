/*
  # Optimize RLS Policies - Use (select auth.uid()) Pattern

  1. Performance Optimization
    - Replace auth.uid() with (select auth.uid()) in RLS policies
    - This prevents re-evaluation of the auth function for each row
    - Significantly improves query performance at scale

  2. Policies Updated
    - user_profiles, invoice_reminders, reminder_notifications
    - user_reminder_notifications, user_custom_permissions, invoice_memos
    - invoice_status_changes, collector_assignments, collector_email_schedules
    - invoice_assignments, customer_notes
*/

-- Drop and recreate optimized policies for user_profiles
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- Optimize invoice_reminders policies
DROP POLICY IF EXISTS "Users can create their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can delete their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can edit their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can update their own reminders" ON invoice_reminders;
DROP POLICY IF EXISTS "Users can view their own reminders" ON invoice_reminders;

CREATE POLICY "Users can create their own reminders"
  ON invoice_reminders FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete their own reminders"
  ON invoice_reminders FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own reminders"
  ON invoice_reminders FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can view their own reminders"
  ON invoice_reminders FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Optimize reminder_notifications policies
DROP POLICY IF EXISTS "Users can delete their own reminder notifications" ON reminder_notifications;
DROP POLICY IF EXISTS "Users can update their own reminder notifications" ON reminder_notifications;
DROP POLICY IF EXISTS "Users can view their own reminder notifications" ON reminder_notifications;

CREATE POLICY "Users can delete their own reminder notifications"
  ON reminder_notifications FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own reminder notifications"
  ON reminder_notifications FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can view their own reminder notifications"
  ON reminder_notifications FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Optimize user_reminder_notifications policies
DROP POLICY IF EXISTS "Users can update their own notifications" ON user_reminder_notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON user_reminder_notifications;

CREATE POLICY "Users can update their own notifications"
  ON user_reminder_notifications FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can view their own notifications"
  ON user_reminder_notifications FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Optimize user_custom_permissions policies
DROP POLICY IF EXISTS "Users can view their own custom permissions" ON user_custom_permissions;

CREATE POLICY "Users can view their own custom permissions"
  ON user_custom_permissions FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Optimize invoice_memos policies (uses created_by_user_id column)
DROP POLICY IF EXISTS "Users can delete their own memos" ON invoice_memos;
DROP POLICY IF EXISTS "Users can edit their own memos" ON invoice_memos;
DROP POLICY IF EXISTS "users_can_delete_own_memos" ON invoice_memos;
DROP POLICY IF EXISTS "users_can_update_own_memos" ON invoice_memos;

CREATE POLICY "Users can delete their own memos"
  ON invoice_memos FOR DELETE
  TO authenticated
  USING (created_by_user_id = (select auth.uid()));

CREATE POLICY "Users can edit their own memos"
  ON invoice_memos FOR UPDATE
  TO authenticated
  USING (created_by_user_id = (select auth.uid()))
  WITH CHECK (created_by_user_id = (select auth.uid()));

-- Optimize invoice_status_changes policies
DROP POLICY IF EXISTS "Users can log their own status changes" ON invoice_status_changes;

CREATE POLICY "Users can log their own status changes"
  ON invoice_status_changes FOR INSERT
  TO authenticated
  WITH CHECK (modified_by = (select auth.uid()));

-- Optimize collector_assignments policies
DROP POLICY IF EXISTS "Collectors can view own assignments" ON collector_assignments;
DROP POLICY IF EXISTS "Collectors can update own assignments" ON collector_assignments;
DROP POLICY IF EXISTS "Collectors can create assignments" ON collector_assignments;

CREATE POLICY "Collectors can view own assignments"
  ON collector_assignments FOR SELECT
  TO authenticated
  USING (collector_id = (select auth.uid()));

CREATE POLICY "Collectors can update own assignments"
  ON collector_assignments FOR UPDATE
  TO authenticated
  USING (collector_id = (select auth.uid()))
  WITH CHECK (collector_id = (select auth.uid()));

CREATE POLICY "Collectors can create assignments"
  ON collector_assignments FOR INSERT
  TO authenticated
  WITH CHECK (collector_id = (select auth.uid()));

-- Optimize collector_email_schedules policies
DROP POLICY IF EXISTS "Collectors can manage own email schedules" ON collector_email_schedules;

CREATE POLICY "Collectors can manage own email schedules"
  ON collector_email_schedules FOR ALL
  TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

-- Optimize invoice_assignments policies (uses assigned_collector_id column)
DROP POLICY IF EXISTS "Collectors can view their assignments" ON invoice_assignments;
DROP POLICY IF EXISTS "Collectors can update notes on their assignments" ON invoice_assignments;

CREATE POLICY "Collectors can view their assignments"
  ON invoice_assignments FOR SELECT
  TO authenticated
  USING (assigned_collector_id = (select auth.uid()));

CREATE POLICY "Collectors can update notes on their assignments"
  ON invoice_assignments FOR UPDATE
  TO authenticated
  USING (assigned_collector_id = (select auth.uid()))
  WITH CHECK (assigned_collector_id = (select auth.uid()));

-- Optimize customer_notes policies (uses created_by_user_id column)
DROP POLICY IF EXISTS "Authenticated users can create customer notes" ON customer_notes;
DROP POLICY IF EXISTS "Users can update own customer notes" ON customer_notes;

CREATE POLICY "Authenticated users can create customer notes"
  ON customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = (select auth.uid()));

CREATE POLICY "Users can update own customer notes"
  ON customer_notes FOR UPDATE
  TO authenticated
  USING (created_by_user_id = (select auth.uid()))
  WITH CHECK (created_by_user_id = (select auth.uid()));
