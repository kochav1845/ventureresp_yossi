/*
  # Create Comprehensive Collector Management System
  
  1. New Tables
    - `collector_assignments` - Stores assignment details with full control
    - `collector_email_schedules` - Email scheduling by collectors
    - `invoice_change_log` - Detailed audit trail for invoice changes
    - `payment_change_log` - Detailed audit trail for payment changes
  
  2. Changes to Existing Tables
    - Add `last_modified_by` to acumatica_invoices
    - Add `last_modified_by` to acumatica_payments
    - Add `modified_by` to invoice_status_changes
  
  3. Views
    - `collector_activity_summary` - Aggregated collector activities
  
  4. Functions
    - `get_collector_activity` - Get detailed activity for a collector
    - `get_invoice_change_history` - Get full change history for an invoice
  
  5. Security
    - RLS policies for new tables
    - Audit triggers
*/

-- Add last_modified_by to invoices
ALTER TABLE acumatica_invoices 
ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES user_profiles(id);

ALTER TABLE acumatica_invoices 
ADD COLUMN IF NOT EXISTS last_modified_at timestamptz DEFAULT now();

-- Add last_modified_by to payments
ALTER TABLE acumatica_payments 
ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES user_profiles(id);

ALTER TABLE acumatica_payments 
ADD COLUMN IF NOT EXISTS last_modified_at timestamptz DEFAULT now();

-- Add modified_by to invoice_status_changes if column doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoice_status_changes' AND column_name = 'modified_by'
  ) THEN
    ALTER TABLE invoice_status_changes 
    ADD COLUMN modified_by uuid REFERENCES user_profiles(id);
  END IF;
END $$;

-- Create collector_assignments table (enhanced version)
CREATE TABLE IF NOT EXISTS collector_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES acumatica_customers(customer_id),
  assigned_date timestamptz DEFAULT now(),
  assignment_type text DEFAULT 'regular',
  priority text DEFAULT 'medium',
  notes text,
  target_collection_amount numeric(15,2),
  status text DEFAULT 'active',
  assigned_by uuid REFERENCES user_profiles(id),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(collector_id, customer_id)
);

-- Create collector_email_schedules table
CREATE TABLE IF NOT EXISTS collector_email_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  customer_id text REFERENCES acumatica_customers(customer_id),
  invoice_id text,
  email_template_id uuid REFERENCES email_templates(id),
  scheduled_date timestamptz NOT NULL,
  email_type text NOT NULL,
  subject text,
  body text,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create invoice_change_log table
CREATE TABLE IF NOT EXISTS invoice_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES acumatica_invoices(id),
  invoice_reference_number text NOT NULL,
  changed_by uuid NOT NULL REFERENCES user_profiles(id),
  change_type text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  change_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create payment_change_log table
CREATE TABLE IF NOT EXISTS payment_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES acumatica_payments(id),
  payment_reference_number text NOT NULL,
  changed_by uuid NOT NULL REFERENCES user_profiles(id),
  change_type text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  change_reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_collector_assignments_collector ON collector_assignments(collector_id);
CREATE INDEX IF NOT EXISTS idx_collector_assignments_customer ON collector_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_collector_email_schedules_collector ON collector_email_schedules(collector_id);
CREATE INDEX IF NOT EXISTS idx_collector_email_schedules_scheduled ON collector_email_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_invoice_change_log_invoice ON invoice_change_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_change_log_changed_by ON invoice_change_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_payment_change_log_payment ON payment_change_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_change_log_changed_by ON payment_change_log(changed_by);

-- Create view for collector activity summary
CREATE OR REPLACE VIEW collector_activity_summary AS
SELECT 
  up.id as collector_id,
  up.email as collector_email,
  COUNT(DISTINCT ca.customer_id) as assigned_customers,
  COUNT(DISTINCT icl.invoice_id) as invoices_modified,
  COUNT(DISTINCT pcl.payment_id) as payments_modified,
  COUNT(DISTINCT ces.id) as emails_scheduled,
  COUNT(DISTINCT CASE WHEN ces.status = 'sent' THEN ces.id END) as emails_sent,
  MAX(ual.created_at) as last_activity_at
FROM user_profiles up
LEFT JOIN collector_assignments ca ON up.id = ca.collector_id AND ca.status = 'active'
LEFT JOIN invoice_change_log icl ON up.id = icl.changed_by
LEFT JOIN payment_change_log pcl ON up.id = pcl.changed_by
LEFT JOIN collector_email_schedules ces ON up.id = ces.collector_id
LEFT JOIN user_activity_logs ual ON up.id = ual.user_id
WHERE up.role = 'collector'
GROUP BY up.id, up.email;

-- Function to log invoice changes
CREATE OR REPLACE FUNCTION log_invoice_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := current_setting('app.current_user_id', true)::uuid;
  
  IF v_user_id IS NULL THEN
    v_user_id := NEW.last_modified_by;
  END IF;

  IF TG_OP = 'UPDATE' AND v_user_id IS NOT NULL THEN
    IF OLD.color_status IS DISTINCT FROM NEW.color_status THEN
      INSERT INTO invoice_change_log (
        invoice_id, invoice_reference_number, changed_by, change_type,
        field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.reference_number, v_user_id, 'color_status_change',
        'color_status', OLD.color_status, NEW.color_status
      );
    END IF;
    
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO invoice_change_log (
        invoice_id, invoice_reference_number, changed_by, change_type,
        field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.reference_number, v_user_id, 'status_change',
        'status', OLD.status, NEW.status
      );
    END IF;
    
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
      INSERT INTO invoice_change_log (
        invoice_id, invoice_reference_number, changed_by, change_type,
        field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.reference_number, v_user_id, 'balance_change',
        'balance', OLD.balance::text, NEW.balance::text
      );
    END IF;

    NEW.last_modified_at := now();
    IF v_user_id IS NOT NULL THEN
      NEW.last_modified_by := v_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log payment changes
CREATE OR REPLACE FUNCTION log_payment_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := current_setting('app.current_user_id', true)::uuid;
  
  IF v_user_id IS NULL THEN
    v_user_id := NEW.last_modified_by;
  END IF;

  IF TG_OP = 'UPDATE' AND v_user_id IS NOT NULL THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO payment_change_log (
        payment_id, payment_reference_number, changed_by, change_type,
        field_name, old_value, new_value
      ) VALUES (
        NEW.id, NEW.reference_number, v_user_id, 'status_change',
        'status', OLD.status, NEW.status
      );
    END IF;

    NEW.last_modified_at := now();
    IF v_user_id IS NOT NULL THEN
      NEW.last_modified_by := v_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_log_invoice_change ON acumatica_invoices;
CREATE TRIGGER trigger_log_invoice_change
  BEFORE UPDATE ON acumatica_invoices
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_change();

DROP TRIGGER IF EXISTS trigger_log_payment_change ON acumatica_payments;
CREATE TRIGGER trigger_log_payment_change
  BEFORE UPDATE ON acumatica_payments
  FOR EACH ROW
  EXECUTE FUNCTION log_payment_change();

-- Function to get collector activity
CREATE OR REPLACE FUNCTION get_collector_activity(
  p_collector_id uuid,
  p_days_back integer DEFAULT 30
)
RETURNS TABLE (
  activity_date date,
  invoices_modified bigint,
  payments_modified bigint,
  emails_sent bigint,
  customers_contacted bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(activity_time) as activity_date,
    COUNT(DISTINCT CASE WHEN activity_type = 'invoice_modified' THEN entity_id END) as invoices_modified,
    COUNT(DISTINCT CASE WHEN activity_type = 'payment_modified' THEN entity_id END) as payments_modified,
    COUNT(DISTINCT CASE WHEN activity_type = 'email_sent' THEN entity_id END) as emails_sent,
    COUNT(DISTINCT customer_id) as customers_contacted
  FROM (
    SELECT 
      created_at as activity_time,
      'invoice_modified' as activity_type,
      invoice_id::text as entity_id,
      NULL as customer_id
    FROM invoice_change_log
    WHERE changed_by = p_collector_id
      AND created_at >= now() - (p_days_back || ' days')::interval
    
    UNION ALL
    
    SELECT 
      created_at as activity_time,
      'payment_modified' as activity_type,
      payment_id::text as entity_id,
      NULL as customer_id
    FROM payment_change_log
    WHERE changed_by = p_collector_id
      AND created_at >= now() - (p_days_back || ' days')::interval
    
    UNION ALL
    
    SELECT 
      sent_at as activity_time,
      'email_sent' as activity_type,
      id::text as entity_id,
      customer_id
    FROM collector_email_schedules
    WHERE collector_id = p_collector_id
      AND sent_at >= now() - (p_days_back || ' days')::interval
  ) activities
  GROUP BY DATE(activity_time)
  ORDER BY activity_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get invoice change history
CREATE OR REPLACE FUNCTION get_invoice_change_history(p_invoice_ref text)
RETURNS TABLE (
  changed_at timestamptz,
  changed_by_email text,
  change_type text,
  field_name text,
  old_value text,
  new_value text,
  change_reason text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    icl.created_at as changed_at,
    up.email as changed_by_email,
    icl.change_type,
    icl.field_name,
    icl.old_value,
    icl.new_value,
    icl.change_reason
  FROM invoice_change_log icl
  JOIN user_profiles up ON icl.changed_by = up.id
  WHERE icl.invoice_reference_number = p_invoice_ref
  ORDER BY icl.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE collector_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collector_email_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_change_log ENABLE ROW LEVEL SECURITY;

-- Collectors can view their own assignments
CREATE POLICY "Collectors can view own assignments"
  ON collector_assignments FOR SELECT
  TO authenticated
  USING (
    collector_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Collectors can create their own assignments
CREATE POLICY "Collectors can create assignments"
  ON collector_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    collector_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Collectors can update their own assignments
CREATE POLICY "Collectors can update own assignments"
  ON collector_assignments FOR UPDATE
  TO authenticated
  USING (
    collector_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Email schedules policies
CREATE POLICY "Collectors can manage own email schedules"
  ON collector_email_schedules FOR ALL
  TO authenticated
  USING (
    collector_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- Change log policies (read-only for collectors, full access for admins)
CREATE POLICY "Users can view change logs"
  ON invoice_change_log FOR SELECT
  TO authenticated
  USING (
    changed_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "System can insert invoice change logs"
  ON invoice_change_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view payment change logs"
  ON payment_change_log FOR SELECT
  TO authenticated
  USING (
    changed_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "System can insert payment change logs"
  ON payment_change_log FOR INSERT
  TO authenticated
  WITH CHECK (true);