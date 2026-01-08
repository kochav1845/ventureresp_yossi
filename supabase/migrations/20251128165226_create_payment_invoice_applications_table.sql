/*
  # Create Payment-to-Invoice Application Links Table

  1. New Tables
    - `payment_invoice_applications`
      - `id` (uuid, primary key)
      - `payment_id` (uuid, foreign key to acumatica_payments)
      - `payment_reference_number` (text) - For easy reference
      - `invoice_reference_number` (text) - The invoice being paid
      - `customer_id` (text) - Customer identifier
      - `application_date` (timestamptz) - When payment was applied
      - `amount_paid` (decimal) - Amount applied to this invoice
      - `balance` (decimal) - Remaining balance after application
      - `cash_discount_taken` (decimal) - Discount amount
      - `post_period` (text) - Posting period
      - `application_period` (text) - Application period
      - `due_date` (timestamptz) - Invoice due date
      - `customer_order` (text) - Customer order reference
      - `description` (text) - Application description
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Indexes
    - Index on payment_id for fast lookups
    - Index on invoice_reference_number for searching
    - Index on customer_id for customer-specific queries
    - Index on application_date for date-based queries

  3. Security
    - Enable RLS on `payment_invoice_applications` table
    - Add policy for authenticated users to read all data
*/

-- Create the payment_invoice_applications table
CREATE TABLE IF NOT EXISTS payment_invoice_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES acumatica_payments(id) ON DELETE CASCADE,
  payment_reference_number text NOT NULL,
  invoice_reference_number text NOT NULL,
  customer_id text NOT NULL,
  application_date timestamptz,
  amount_paid decimal(18, 2) DEFAULT 0,
  balance decimal(18, 2) DEFAULT 0,
  cash_discount_taken decimal(18, 2) DEFAULT 0,
  post_period text,
  application_period text,
  due_date timestamptz,
  customer_order text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_invoice_apps_payment_id 
  ON payment_invoice_applications(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_invoice_apps_invoice_ref 
  ON payment_invoice_applications(invoice_reference_number);

CREATE INDEX IF NOT EXISTS idx_payment_invoice_apps_customer_id 
  ON payment_invoice_applications(customer_id);

CREATE INDEX IF NOT EXISTS idx_payment_invoice_apps_application_date 
  ON payment_invoice_applications(application_date);

-- Enable RLS
ALTER TABLE payment_invoice_applications ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read all data
CREATE POLICY "Authenticated users can read all payment-invoice applications"
  ON payment_invoice_applications
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy for authenticated users to insert data
CREATE POLICY "Authenticated users can insert payment-invoice applications"
  ON payment_invoice_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy for authenticated users to update data
CREATE POLICY "Authenticated users can update payment-invoice applications"
  ON payment_invoice_applications
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy for authenticated users to delete data
CREATE POLICY "Authenticated users can delete payment-invoice applications"
  ON payment_invoice_applications
  FOR DELETE
  TO authenticated
  USING (true);
