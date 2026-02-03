/*
  # Create Ticket Status Management System

  1. New Tables
    - `ticket_status_options`
      - `id` (uuid, primary key)
      - `status_name` (text, unique) - Internal identifier (lowercase, no spaces)
      - `display_name` (text) - Human-readable name shown in UI
      - `color_class` (text) - CSS color class for visual styling
      - `sort_order` (integer) - Order in dropdown lists
      - `is_active` (boolean) - Whether status is currently available
      - `is_system` (boolean) - Whether this is a default status that cannot be deleted
      - `created_at` (timestamptz)
      - `created_by` (uuid, foreign key to user_profiles)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `ticket_status_options` table
    - Add policies for authenticated users to read active statuses
    - Add policies for admins to manage statuses

  3. Initial Data
    - Populate with existing ticket statuses (open, pending, promised, paid, disputed, closed)
*/

-- Create ticket_status_options table
CREATE TABLE IF NOT EXISTS ticket_status_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  color_class text DEFAULT 'bg-gray-200 text-gray-800',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES user_profiles(id),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ticket_status_options ENABLE ROW LEVEL SECURITY;

-- Policies for reading active statuses (all authenticated users)
CREATE POLICY "Authenticated users can view active ticket statuses"
  ON ticket_status_options
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Policies for admins to manage statuses
CREATE POLICY "Admins can insert ticket statuses"
  ON ticket_status_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can update ticket statuses"
  ON ticket_status_options
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Admins can delete non-system ticket statuses"
  ON ticket_status_options
  FOR DELETE
  TO authenticated
  USING (
    is_system = false
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ticket_status_options_active ON ticket_status_options(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_ticket_status_options_name ON ticket_status_options(status_name);

-- Insert default ticket statuses
INSERT INTO ticket_status_options (status_name, display_name, color_class, sort_order, is_system) VALUES
  ('open', 'Open', 'bg-blue-100 text-blue-800', 1, true),
  ('pending', 'Pending', 'bg-yellow-100 text-yellow-800', 2, true),
  ('promised', 'Promised', 'bg-purple-100 text-purple-800', 3, true),
  ('paid', 'Paid', 'bg-green-100 text-green-800', 4, true),
  ('disputed', 'Disputed', 'bg-red-100 text-red-800', 5, true),
  ('closed', 'Closed', 'bg-gray-100 text-gray-800', 6, true)
ON CONFLICT (status_name) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ticket_status_options_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS ticket_status_options_updated_at ON ticket_status_options;
CREATE TRIGGER ticket_status_options_updated_at
  BEFORE UPDATE ON ticket_status_options
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_status_options_updated_at();

-- Function to get active ticket statuses ordered by sort_order
CREATE OR REPLACE FUNCTION get_active_ticket_statuses()
RETURNS TABLE (
  id uuid,
  status_name text,
  display_name text,
  color_class text,
  sort_order integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.status_name,
    t.display_name,
    t.color_class,
    t.sort_order
  FROM ticket_status_options t
  WHERE t.is_active = true
  ORDER BY t.sort_order ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
