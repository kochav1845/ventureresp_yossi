/*
  # Create Acumatica Customers Table

  1. New Tables
    - `acumatica_customers`
      - `id` (uuid, primary key)
      - `customer_id` (text, unique) - The Acumatica Customer ID
      - `customer_name` (text) - Customer display name
      - `customer_class` (text) - Customer classification
      - `country` (text) - Customer country
      - `city` (text) - Customer city
      - `terms` (text) - Payment terms
      - `customer_status` (text) - Active, Inactive, etc.
      - `balance` (numeric) - Customer account balance
      - `default_payment_method` (text) - Default payment method
      - `general_email` (text) - General contact email
      - `billing_email` (text) - Billing email address
      - `shipping_email` (text) - Shipping email address
      - `credit_verification` (text) - Credit verification status
      - `credit_limit` (numeric) - Credit limit amount
      - `ppd_customer` (boolean) - PPD customer flag
      - `ppd_type` (text) - PPD type
      - `billing_state` (text) - Billing state/province
      - `location_id` (text) - Location identifier
      - `location_shipping_state` (text) - Shipping location state
      - `web` (text) - Website URL
      - `owner` (text) - Account owner
      - `parent_account` (text) - Parent account reference
      - `account_name` (text) - Account name
      - `raw_data` (jsonb) - Complete raw response from Acumatica
      - `synced_at` (timestamp) - Last sync timestamp
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on `acumatica_customers` table
    - Add policies for authenticated users to read customer data
*/

CREATE TABLE IF NOT EXISTS acumatica_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text UNIQUE NOT NULL,
  customer_name text,
  customer_class text,
  country text,
  city text,
  terms text,
  customer_status text,
  balance numeric DEFAULT 0,
  default_payment_method text,
  general_email text,
  billing_email text,
  shipping_email text,
  credit_verification text,
  credit_limit numeric,
  ppd_customer boolean DEFAULT false,
  ppd_type text,
  billing_state text,
  location_id text,
  location_shipping_state text,
  web text,
  owner text,
  parent_account text,
  account_name text,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE acumatica_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read customers"
  ON acumatica_customers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert customers"
  ON acumatica_customers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
  ON acumatica_customers
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_acumatica_customers_customer_id ON acumatica_customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_acumatica_customers_customer_name ON acumatica_customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_acumatica_customers_synced_at ON acumatica_customers(synced_at);