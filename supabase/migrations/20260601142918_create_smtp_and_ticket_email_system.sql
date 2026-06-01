/*
  # Add SMTP Configuration and Ticket Email System

  1. New Table: `smtp_configurations`
    - Allows users to connect their own SMTP email server
    - Supports multiple SMTP configs per organization
    - Stores SMTP host, port, username, encrypted password reference, from address
    - Enables sending emails through user's own mail server instead of SendGrid

  2. New Table: `ticket_email_threads`
    - Links email conversations to specific tickets
    - Tracks sent emails and received replies in context of tickets
    - Enables AI analysis of replies and auto-actions

  3. Modifications to `email_settings`
    - `smtp_enabled` - Whether SMTP is enabled as default send method
    - `default_send_method` - 'sendgrid' or 'smtp'

  4. New Table: `ticket_email_actions`
    - Stores AI-suggested actions from email analysis
    - Can create tickets, reminders, or flag for review
    - action_type: 'create_ticket', 'set_reminder', 'send_email', 'flag_review', 'auto_close', 'escalate'

  5. Security
    - RLS on all new tables
    - Only authenticated users with admin/manager role can manage SMTP
    - Collectors can view their own ticket emails
*/

-- SMTP Configurations table
CREATE TABLE IF NOT EXISTS smtp_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default SMTP',
  host text NOT NULL,
  port integer NOT NULL DEFAULT 587,
  username text NOT NULL,
  password_secret_name text NOT NULL,
  from_email text NOT NULL,
  from_name text NOT NULL DEFAULT '',
  encryption text NOT NULL DEFAULT 'tls',
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_encryption CHECK (encryption IN ('none', 'tls', 'ssl')),
  CONSTRAINT valid_port CHECK (port > 0 AND port < 65536)
);

-- Ticket email threads linking emails to tickets
CREATE TABLE IF NOT EXISTS ticket_email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  subject text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  from_email text NOT NULL,
  to_email text NOT NULL,
  body_html text,
  body_text text,
  sent_via text DEFAULT 'sendgrid',
  smtp_config_id uuid REFERENCES smtp_configurations(id),
  sent_by uuid REFERENCES user_profiles(id),
  ai_analysis jsonb,
  ai_suggested_action text,
  action_taken text,
  in_reply_to uuid REFERENCES ticket_email_threads(id),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound'))
);

-- AI-suggested actions from email analysis
CREATE TABLE IF NOT EXISTS ticket_email_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_thread_id uuid NOT NULL REFERENCES ticket_email_threads(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES collection_tickets(id),
  action_type text NOT NULL,
  action_status text DEFAULT 'pending',
  action_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  executed_at timestamptz,
  executed_by uuid REFERENCES user_profiles(id),
  CONSTRAINT valid_action_type CHECK (action_type IN ('create_ticket', 'set_reminder', 'send_email', 'flag_review', 'auto_close', 'escalate')),
  CONSTRAINT valid_action_status CHECK (action_status IN ('pending', 'executed', 'dismissed', 'auto_executed'))
);

-- Add SMTP fields to email_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_settings' AND column_name = 'smtp_enabled'
  ) THEN
    ALTER TABLE email_settings ADD COLUMN smtp_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_settings' AND column_name = 'default_send_method'
  ) THEN
    ALTER TABLE email_settings ADD COLUMN default_send_method text DEFAULT 'sendgrid';
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_smtp_configs_active ON smtp_configurations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ticket_email_threads_ticket ON ticket_email_threads(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_email_threads_customer ON ticket_email_threads(customer_id);
CREATE INDEX IF NOT EXISTS idx_ticket_email_threads_direction ON ticket_email_threads(direction);
CREATE INDEX IF NOT EXISTS idx_ticket_email_actions_email ON ticket_email_actions(email_thread_id);
CREATE INDEX IF NOT EXISTS idx_ticket_email_actions_status ON ticket_email_actions(action_status) WHERE action_status = 'pending';

-- Enable RLS
ALTER TABLE smtp_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_email_actions ENABLE ROW LEVEL SECURITY;

-- SMTP configs: admins manage
CREATE POLICY "Admins can manage SMTP configurations"
  ON smtp_configurations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can insert SMTP configurations"
  ON smtp_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can update SMTP configurations"
  ON smtp_configurations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can delete SMTP configurations"
  ON smtp_configurations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Ticket email threads: users can see threads for their assigned tickets
CREATE POLICY "Users can view ticket emails for their assigned tickets"
  ON ticket_email_threads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_id
      AND (ct.assigned_collector_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
        ))
    )
  );

CREATE POLICY "Authenticated users can send ticket emails"
  ON ticket_email_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_id
      AND (ct.assigned_collector_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
        ))
    )
  );

-- Ticket email actions: users can view/manage for their tickets
CREATE POLICY "Users can view email actions for their tickets"
  ON ticket_email_actions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ticket_email_threads tet
      JOIN collection_tickets ct ON ct.id = tet.ticket_id
      WHERE tet.id = email_thread_id
      AND (ct.assigned_collector_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
        ))
    )
  );

CREATE POLICY "Users can insert email actions"
  ON ticket_email_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update their email actions"
  ON ticket_email_actions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Updated at trigger for smtp_configurations
CREATE OR REPLACE FUNCTION update_smtp_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_smtp_configurations_updated_at'
  ) THEN
    CREATE TRIGGER update_smtp_configurations_updated_at
      BEFORE UPDATE ON smtp_configurations
      FOR EACH ROW
      EXECUTE FUNCTION update_smtp_configurations_updated_at();
  END IF;
END $$;
