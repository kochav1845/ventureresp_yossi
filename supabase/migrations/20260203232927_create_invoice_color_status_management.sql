/*
  # Create Invoice Color Status Management System

  1. New Tables
    - `invoice_color_status_options`
      - `id` (uuid, primary key)
      - `status_name` (text, unique) - Internal identifier (e.g., 'red', 'yellow', 'green')
      - `display_name` (text) - User-friendly name shown in UI
      - `color_class` (text) - Tailwind CSS classes for the color display
      - `sort_order` (integer) - Order in which options appear
      - `is_active` (boolean) - Whether this option is currently available
      - `is_system` (boolean) - Whether this is a default system option (cannot be deleted)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Initial Data
    - Populate with default color statuses:
      - Red: "Will Not Pay"
      - Yellow: "Will Take Care"
      - Green: "Will Pay"

  3. Security
    - Enable RLS on `invoice_color_status_options` table
    - Authenticated users can read all options
    - Only admins can create, update, or delete options
*/

-- Create the invoice_color_status_options table
CREATE TABLE IF NOT EXISTS invoice_color_status_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  color_class text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for sorting
CREATE INDEX IF NOT EXISTS idx_invoice_color_status_sort ON invoice_color_status_options(sort_order);

-- Enable RLS
ALTER TABLE invoice_color_status_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read invoice color status options"
  ON invoice_color_status_options
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert invoice color status options"
  ON invoice_color_status_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update invoice color status options"
  ON invoice_color_status_options
  FOR UPDATE
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

CREATE POLICY "Admins can delete non-system invoice color status options"
  ON invoice_color_status_options
  FOR DELETE
  TO authenticated
  USING (
    is_system = false AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Insert default color status options
INSERT INTO invoice_color_status_options (status_name, display_name, color_class, sort_order, is_system) VALUES
  ('red', 'Will Not Pay', 'bg-red-500 border-red-700', 1, true),
  ('yellow', 'Will Take Care', 'bg-yellow-400 border-yellow-600', 2, true),
  ('green', 'Will Pay', 'bg-green-500 border-green-700', 3, true)
ON CONFLICT (status_name) DO NOTHING;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_invoice_color_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_color_status_updated_at
  BEFORE UPDATE ON invoice_color_status_options
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_color_status_updated_at();
