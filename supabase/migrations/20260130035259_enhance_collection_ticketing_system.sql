/*
  # Enhanced Collection Ticketing System

  1. Changes to existing tables
    - Add `ticket_type` field to collection_tickets (overdue payment, partial payment, chargeback, settlement)
    - Update status constraint to: 'open', 'pending', 'promised', 'paid', 'disputed', 'closed'
    
  2. New Tables
    - `ticket_status_history`
      - Tracks all status changes for tickets
      - Includes who changed it and when
      
    - `ticket_activity_log`
      - Tracks all activities (notes, status changes, assignments, etc.)
      - Provides comprehensive audit trail

  3. Security
    - Enable RLS on new tables
    - Admins and assigned collectors can view ticket history
    - Only admins and assigned collectors can add activities
*/

-- Add ticket_type column to collection_tickets
ALTER TABLE collection_tickets 
ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'overdue payment' 
CHECK (ticket_type IN ('overdue payment', 'partial payment', 'chargeback', 'settlement'));

-- Update status constraint to new values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'collection_tickets_status_check' 
    AND table_name = 'collection_tickets'
  ) THEN
    ALTER TABLE collection_tickets DROP CONSTRAINT collection_tickets_status_check;
  END IF;
END $$;

ALTER TABLE collection_tickets 
ADD CONSTRAINT collection_tickets_status_check 
CHECK (status IN ('open', 'pending', 'promised', 'paid', 'disputed', 'closed'));

-- Create ticket_status_history table
CREATE TABLE IF NOT EXISTS ticket_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  changed_at timestamptz DEFAULT now(),
  notes text
);

-- Create ticket_activity_log table
CREATE TABLE IF NOT EXISTS ticket_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('note', 'status_change', 'assignment_change', 'invoice_added', 'invoice_removed', 'created')),
  description text NOT NULL,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket ON ticket_status_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_changed_at ON ticket_status_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_log_ticket ON ticket_activity_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_log_created_at ON ticket_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_tickets_status ON collection_tickets(status);
CREATE INDEX IF NOT EXISTS idx_collection_tickets_ticket_type ON collection_tickets(ticket_type);

-- Enable RLS
ALTER TABLE ticket_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ticket_status_history
CREATE POLICY "Admins can view all status history"
  ON ticket_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Collectors can view their ticket status history"
  ON ticket_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_status_history.ticket_id
      AND ct.assigned_collector_id = auth.uid()
    )
  );

CREATE POLICY "Admins and managers can insert status history"
  ON ticket_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Collectors can insert status history for their tickets"
  ON ticket_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_status_history.ticket_id
      AND ct.assigned_collector_id = auth.uid()
    )
  );

-- RLS Policies for ticket_activity_log
CREATE POLICY "Admins can view all activity logs"
  ON ticket_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Collectors can view their ticket activity logs"
  ON ticket_activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_activity_log.ticket_id
      AND ct.assigned_collector_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can insert activity logs"
  ON ticket_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Create trigger to automatically log status changes
CREATE OR REPLACE FUNCTION log_ticket_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
    
    INSERT INTO ticket_activity_log (ticket_id, activity_type, description, created_by, metadata)
    VALUES (
      NEW.id, 
      'status_change', 
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      auth.uid(),
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO ticket_activity_log (ticket_id, activity_type, description, created_by, metadata)
    VALUES (
      NEW.id,
      'created',
      'Ticket created',
      NEW.created_by,
      jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'ticket_type', NEW.ticket_type)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ticket_status_change_trigger ON collection_tickets;
CREATE TRIGGER ticket_status_change_trigger
  AFTER INSERT OR UPDATE ON collection_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_status_change();