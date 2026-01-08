/*
  # Collection Ticketing System

  1. New Tables
    - `collection_tickets`
      - `id` (uuid, primary key)
      - `ticket_number` (text, unique, auto-generated)
      - `customer_id` (text, references acumatica_customers)
      - `customer_name` (text)
      - `assigned_collector_id` (uuid, references user_profiles)
      - `status` (text: 'open', 'in_progress', 'resolved', 'closed')
      - `priority` (text: 'low', 'medium', 'high', 'urgent')
      - `notes` (text)
      - `created_by` (uuid, references user_profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `resolved_at` (timestamptz, nullable)
    
    - `ticket_invoices`
      - `id` (uuid, primary key)
      - `ticket_id` (uuid, references collection_tickets)
      - `invoice_reference_number` (text, references acumatica_invoices)
      - `added_at` (timestamptz)
      - `added_by` (uuid, references user_profiles)
    
    - `invoice_assignments`
      - `id` (uuid, primary key)
      - `invoice_reference_number` (text, references acumatica_invoices, unique)
      - `assigned_collector_id` (uuid, references user_profiles)
      - `ticket_id` (uuid, references collection_tickets, nullable)
      - `assigned_at` (timestamptz)
      - `assigned_by` (uuid, references user_profiles)
      - `notes` (text)

  2. Changes
    - Update role constraint to include all existing roles plus 'collector'

  3. Security
    - Enable RLS on all new tables
    - Admins can manage all tickets and assignments
    - Collectors can view their assigned tickets and invoices
    - Collectors can update notes and status on their assignments
*/

-- Update role constraint to include all existing roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_profiles_role_check' 
    AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_role_check;
  END IF;
END $$;

ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_role_check 
CHECK (role IN ('admin', 'developer', 'user', 'secretary', 'collector', 'manager', 'viewer'));

-- Create collection_tickets table
CREATE TABLE IF NOT EXISTS collection_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  assigned_collector_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  notes text,
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Create ticket_invoices junction table
CREATE TABLE IF NOT EXISTS ticket_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  invoice_reference_number text NOT NULL,
  added_at timestamptz DEFAULT now(),
  added_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  UNIQUE(ticket_id, invoice_reference_number)
);

-- Create invoice_assignments table
CREATE TABLE IF NOT EXISTS invoice_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_reference_number text UNIQUE NOT NULL,
  assigned_collector_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES collection_tickets(id) ON DELETE SET NULL,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  notes text
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collection_tickets_customer ON collection_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_collection_tickets_collector ON collection_tickets(assigned_collector_id);
CREATE INDEX IF NOT EXISTS idx_collection_tickets_status ON collection_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_invoices_ticket ON ticket_invoices(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_invoices_invoice ON ticket_invoices(invoice_reference_number);
CREATE INDEX IF NOT EXISTS idx_invoice_assignments_collector ON invoice_assignments(assigned_collector_id);
CREATE INDEX IF NOT EXISTS idx_invoice_assignments_invoice ON invoice_assignments(invoice_reference_number);

-- Function to generate ticket numbers
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS text AS $$
DECLARE
  next_num integer;
  ticket_num text;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 4) AS integer)), 0) + 1
  INTO next_num
  FROM collection_tickets
  WHERE ticket_number ~ '^TKT[0-9]+$';
  
  ticket_num := 'TKT' || LPAD(next_num::text, 6, '0');
  RETURN ticket_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate ticket numbers
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_ticket_number
BEFORE INSERT ON collection_tickets
FOR EACH ROW
EXECUTE FUNCTION set_ticket_number();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ticket_timestamp
BEFORE UPDATE ON collection_tickets
FOR EACH ROW
EXECUTE FUNCTION update_ticket_timestamp();

-- Enable RLS
ALTER TABLE collection_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for collection_tickets
CREATE POLICY "Admins can manage all tickets"
  ON collection_tickets FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Collectors can view their assigned tickets"
  ON collection_tickets FOR SELECT
  TO authenticated
  USING (
    assigned_collector_id = auth.uid()
  );

CREATE POLICY "Collectors can update their assigned tickets"
  ON collection_tickets FOR UPDATE
  TO authenticated
  USING (
    assigned_collector_id = auth.uid()
  )
  WITH CHECK (
    assigned_collector_id = auth.uid()
  );

-- RLS Policies for ticket_invoices
CREATE POLICY "Admins can manage all ticket invoices"
  ON ticket_invoices FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Collectors can view ticket invoices for their tickets"
  ON ticket_invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collection_tickets ct
      WHERE ct.id = ticket_invoices.ticket_id
      AND ct.assigned_collector_id = auth.uid()
    )
  );

-- RLS Policies for invoice_assignments
CREATE POLICY "Admins can manage all invoice assignments"
  ON invoice_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Collectors can view their assignments"
  ON invoice_assignments FOR SELECT
  TO authenticated
  USING (
    assigned_collector_id = auth.uid()
  );

CREATE POLICY "Collectors can update notes on their assignments"
  ON invoice_assignments FOR UPDATE
  TO authenticated
  USING (
    assigned_collector_id = auth.uid()
  )
  WITH CHECK (
    assigned_collector_id = auth.uid()
  );

-- Create view for collector assignments with invoice details
CREATE OR REPLACE VIEW collector_assignment_details AS
SELECT 
  ia.id as assignment_id,
  ia.invoice_reference_number,
  ia.assigned_collector_id,
  ia.ticket_id,
  ia.assigned_at,
  ia.assigned_by,
  ia.notes as assignment_notes,
  inv.customer,
  inv.customer_name,
  inv.date,
  inv.due_date,
  inv.amount,
  inv.balance,
  inv.status as invoice_status,
  inv.description,
  ct.ticket_number,
  ct.status as ticket_status,
  ct.priority as ticket_priority,
  up.email as collector_email,
  creator.email as assigned_by_email
FROM invoice_assignments ia
LEFT JOIN acumatica_invoices inv ON ia.invoice_reference_number = inv.reference_number
LEFT JOIN collection_tickets ct ON ia.ticket_id = ct.id
LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
LEFT JOIN user_profiles creator ON ia.assigned_by = creator.id;

-- Grant access to view
GRANT SELECT ON collector_assignment_details TO authenticated;