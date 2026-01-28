/*
  # Add Collector Assignment Capability for Admins

  1. Changes to Existing Tables
    - Add `can_be_assigned_as_collector` flag to user_profiles
    - This allows admins and other roles to also be assigned as collectors

  2. New Table
    - `invoice_collector_assignments` - Track which collector is assigned to specific invoices

  3. Functions
    - Update collector views to include users with can_be_assigned_as_collector flag

  4. Security
    - RLS policies for invoice_collector_assignments
*/

-- Add can_be_assigned_as_collector flag to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS can_be_assigned_as_collector boolean DEFAULT false;

-- Update existing collectors to have this flag enabled
UPDATE user_profiles
SET can_be_assigned_as_collector = true
WHERE role = 'collector';

-- Create invoice_collector_assignments table
CREATE TABLE IF NOT EXISTS invoice_collector_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  assigned_date timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES user_profiles(id),
  notes text,
  status text DEFAULT 'active',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(invoice_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invoice_collector_assignments_invoice ON invoice_collector_assignments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_collector_assignments_collector ON invoice_collector_assignments(collector_id);
CREATE INDEX IF NOT EXISTS idx_invoice_collector_assignments_status ON invoice_collector_assignments(status);

-- Drop and recreate collector_activity_summary view to include users with collector flag
DROP VIEW IF EXISTS collector_activity_summary;
CREATE VIEW collector_activity_summary AS
SELECT
  up.id as collector_id,
  up.email as collector_email,
  up.role as user_role,
  COUNT(DISTINCT ca.customer_id) as assigned_customers,
  COUNT(DISTINCT ica.invoice_id) as assigned_invoices,
  COUNT(DISTINCT icl.invoice_id) as invoices_modified,
  COUNT(DISTINCT pcl.payment_id) as payments_modified,
  COUNT(DISTINCT ces.id) as emails_scheduled,
  COUNT(DISTINCT CASE WHEN ces.status = 'sent' THEN ces.id END) as emails_sent,
  MAX(ual.created_at) as last_activity_at
FROM user_profiles up
LEFT JOIN collector_assignments ca ON up.id = ca.collector_id AND ca.status = 'active'
LEFT JOIN invoice_collector_assignments ica ON up.id = ica.collector_id AND ica.status = 'active'
LEFT JOIN invoice_change_log icl ON up.id = icl.changed_by
LEFT JOIN payment_change_log pcl ON up.id = pcl.changed_by
LEFT JOIN collector_email_schedules ces ON up.id = ces.collector_id
LEFT JOIN user_activity_logs ual ON up.id = ual.user_id
WHERE up.can_be_assigned_as_collector = true
GROUP BY up.id, up.email, up.role;

-- Function to get available collectors (including admins with flag)
CREATE OR REPLACE FUNCTION get_available_collectors()
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  full_name text,
  assigned_invoices bigint,
  assigned_customers bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id,
    up.email,
    up.role,
    COALESCE(up.full_name, up.email) as full_name,
    COUNT(DISTINCT ica.invoice_id) as assigned_invoices,
    COUNT(DISTINCT ca.customer_id) as assigned_customers
  FROM user_profiles up
  LEFT JOIN invoice_collector_assignments ica ON up.id = ica.collector_id AND ica.status = 'active'
  LEFT JOIN collector_assignments ca ON up.id = ca.collector_id AND ca.status = 'active'
  WHERE up.can_be_assigned_as_collector = true
  GROUP BY up.id, up.email, up.role, up.full_name
  ORDER BY up.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reassign invoice collector
CREATE OR REPLACE FUNCTION reassign_invoice_collector(
  p_invoice_id uuid,
  p_new_collector_id uuid,
  p_assigned_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Complete the old assignment if exists
  UPDATE invoice_collector_assignments
  SET
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  WHERE invoice_id = p_invoice_id AND status = 'active';

  -- Create new assignment
  INSERT INTO invoice_collector_assignments (
    invoice_id,
    collector_id,
    assigned_by,
    notes,
    status
  ) VALUES (
    p_invoice_id,
    p_new_collector_id,
    p_assigned_by,
    p_notes,
    'active'
  )
  ON CONFLICT (invoice_id) DO UPDATE
  SET
    collector_id = p_new_collector_id,
    assigned_by = p_assigned_by,
    notes = p_notes,
    assigned_date = now(),
    status = 'active',
    completed_at = NULL,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE invoice_collector_assignments ENABLE ROW LEVEL SECURITY;

-- Users can view assignments for their invoices or if they're the collector
CREATE POLICY "Users can view invoice assignments"
  ON invoice_collector_assignments FOR SELECT
  TO authenticated
  USING (
    collector_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Admins and managers can create assignments
CREATE POLICY "Admins can create invoice assignments"
  ON invoice_collector_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Admins and managers can update assignments
CREATE POLICY "Admins can update invoice assignments"
  ON invoice_collector_assignments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_available_collectors() TO authenticated;
GRANT EXECUTE ON FUNCTION reassign_invoice_collector(uuid, uuid, uuid, text) TO authenticated;