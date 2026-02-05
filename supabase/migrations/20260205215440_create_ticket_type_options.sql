/*
  # Create Ticket Type Options Management System

  1. New Tables
    - `ticket_type_options`
      - `id` (uuid, primary key)
      - `value` (text, unique) - Lowercase value used in database
      - `label` (text) - Display label shown to users
      - `is_active` (boolean) - Whether this type is currently active
      - `display_order` (integer) - Order in which to display in dropdowns
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Data
    - Pre-populate with all existing and standard ticket types
    - Includes: Overdue Payment, Settlement, Partial Payment, Chargeback, Dispute, Follow Up, Payment Plan, Other

  3. Security
    - Enable RLS on `ticket_type_options` table
    - Add policies for authenticated users to read
    - Only admins can insert/update/delete
*/

CREATE TABLE IF NOT EXISTS ticket_type_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text UNIQUE NOT NULL,
  label text NOT NULL,
  is_active boolean DEFAULT true,
  display_order integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ticket_type_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active ticket types"
  ON ticket_type_options
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can insert ticket types"
  ON ticket_type_options
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update ticket types"
  ON ticket_type_options
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

CREATE POLICY "Admins can delete ticket types"
  ON ticket_type_options
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

INSERT INTO ticket_type_options (value, label, display_order) VALUES
  ('overdue payment', 'Overdue Payment', 1),
  ('settlement', 'Settlement', 2),
  ('partial payment', 'Partial Payment', 3),
  ('chargeback', 'Chargeback', 4),
  ('dispute', 'Dispute', 5),
  ('follow up', 'Follow Up', 6),
  ('payment plan', 'Payment Plan', 7),
  ('other', 'Other', 8)
ON CONFLICT (value) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ticket_type_options_active ON ticket_type_options(is_active, display_order);
