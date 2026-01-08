/*
  # Create Acumatica Invoices Table

  1. New Tables
    - `acumatica_invoices`
      - `id` (uuid, primary key)
      - `type` (text) - Invoice, Debit Memo, Credit Memo, Overdue Charge, Credit WO
      - `reference_number` (text, unique) - Invoice reference number
      - `status` (text) - Invoice status (Open, Closed, Canceled, Balanced, etc.)
      - `date` (date) - Invoice date
      - `post_period` (text) - Posting period
      - `customer` (text) - Customer number
      - `customer_name` (text) - Customer name
      - `dac` (text) - DAC field
      - `sc` (text) - SC field
      - `customer_order_number` (text) - Customer order number
      - `dac_total` (numeric) - DAC total amount
      - `currency` (text) - Currency code
      - `origin_reference_number` (text) - Origin reference number
      - `printed` (boolean) - Whether invoice was printed
      - `emailed` (boolean) - Whether invoice was emailed
      - `tag_zone_id` (text) - Tag zone ID
      - `tag_zone_name` (text) - Tag zone name
      - `line_total` (numeric) - Line total amount
      - `parent` (text) - Parent field
      - `customer_class` (text) - Customer class
      - `ar_invoice_external_ref` (text) - AR invoice external reference
      - `default_sales_person` (text) - Default salesperson
      - `external_reference` (text) - External reference
      - `parent_account` (text) - Parent account
      - `account_name` (text) - Account name
      - `raw_data` (jsonb) - Complete raw JSON from Acumatica
      - `synced_at` (timestamptz) - Last sync timestamp
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Security
    - Enable RLS on `acumatica_invoices` table
    - Add policies for authenticated admin users to manage invoices
*/

CREATE TABLE IF NOT EXISTS acumatica_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  reference_number text UNIQUE NOT NULL,
  status text,
  date date,
  post_period text,
  customer text,
  customer_name text,
  dac text,
  sc text,
  customer_order_number text,
  dac_total numeric(18, 2),
  currency text,
  origin_reference_number text,
  printed boolean DEFAULT false,
  emailed boolean DEFAULT false,
  tag_zone_id text,
  tag_zone_name text,
  line_total numeric(18, 2),
  parent text,
  customer_class text,
  ar_invoice_external_ref text,
  default_sales_person text,
  external_reference text,
  parent_account text,
  account_name text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acumatica_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view all invoices"
  ON acumatica_invoices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can insert invoices"
  ON acumatica_invoices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can update invoices"
  ON acumatica_invoices
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

CREATE POLICY "Admin users can delete invoices"
  ON acumatica_invoices
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_reference_number ON acumatica_invoices(reference_number);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_status ON acumatica_invoices(status);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_type ON acumatica_invoices(type);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_customer ON acumatica_invoices(customer);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_date ON acumatica_invoices(date);
