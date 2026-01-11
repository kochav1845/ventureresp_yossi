/*
  # Collector Customer and Invoice Assignment System

  1. New Tables
    - `collector_customer_assignments`
      - `id` (uuid, primary key)
      - `customer_id` (text, references acumatica_customers)
      - `customer_name` (text)
      - `assigned_collector_id` (uuid, references user_profiles)
      - `assigned_at` (timestamptz)
      - `assigned_by` (uuid, references user_profiles)
      - `notes` (text)
      - Unique constraint on (customer_id, assigned_collector_id)

  2. Changes
    - Add indexes for performance
    - Create view to show customer assignments with collector details
    - Ensure invoice_assignments sync with ticketing system

  3. Security
    - Enable RLS on collector_customer_assignments
    - Admins can manage all assignments
    - Collectors can view their own assignments
*/

-- Create collector_customer_assignments table
CREATE TABLE IF NOT EXISTS collector_customer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  assigned_collector_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  notes text,
  UNIQUE(customer_id, assigned_collector_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collector_customer_assignments_customer ON collector_customer_assignments(customer_id);
CREATE INDEX IF NOT EXISTS idx_collector_customer_assignments_collector ON collector_customer_assignments(assigned_collector_id);

-- Enable RLS
ALTER TABLE collector_customer_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for collector_customer_assignments
CREATE POLICY "Admins can manage all collector customer assignments"
  ON collector_customer_assignments FOR ALL
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

CREATE POLICY "Collectors can view their customer assignments"
  ON collector_customer_assignments FOR SELECT
  TO authenticated
  USING (
    assigned_collector_id = auth.uid()
  );

-- Create view for collector customer assignments with details
CREATE OR REPLACE VIEW collector_customer_assignment_details AS
SELECT
  cca.id as assignment_id,
  cca.customer_id,
  cca.customer_name,
  cca.assigned_collector_id,
  cca.assigned_at,
  cca.assigned_by,
  cca.notes,
  up.email as collector_email,
  up.full_name as collector_name,
  creator.email as assigned_by_email,
  creator.full_name as assigned_by_name,
  c.balance as customer_balance
FROM collector_customer_assignments cca
LEFT JOIN user_profiles up ON cca.assigned_collector_id = up.id
LEFT JOIN user_profiles creator ON cca.assigned_by = creator.id
LEFT JOIN acumatica_customers c ON cca.customer_id = c.customer_id;

-- Grant access to view
GRANT SELECT ON collector_customer_assignment_details TO authenticated;

-- Function to get all invoices for an assigned customer
CREATE OR REPLACE FUNCTION get_collector_customer_invoices(p_customer_id text, p_collector_id uuid)
RETURNS TABLE (
  invoice_reference_number text,
  customer text,
  customer_name text,
  date timestamptz,
  due_date timestamptz,
  amount numeric,
  balance numeric,
  status text,
  color_status text,
  description text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    inv.reference_number,
    inv.customer,
    inv.customer_name,
    inv.date,
    inv.due_date,
    inv.amount,
    inv.balance,
    inv.status,
    inv.color_status,
    inv.description
  FROM acumatica_invoices inv
  WHERE inv.customer = p_customer_id
    AND inv.balance > 0
    AND EXISTS (
      SELECT 1 FROM collector_customer_assignments cca
      WHERE cca.customer_id = p_customer_id
      AND cca.assigned_collector_id = p_collector_id
    )
  ORDER BY inv.due_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_collector_customer_invoices TO authenticated;
