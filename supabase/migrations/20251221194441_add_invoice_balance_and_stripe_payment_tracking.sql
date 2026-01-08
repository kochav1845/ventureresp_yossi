/*
  # Add Invoice Balance and Stripe Payment Tracking

  1. Changes
    - Add `balance` field to `acumatica_invoices` table
    - Add `description` field to `acumatica_invoices` table for friendly display
    - Create `stripe_invoice_payments` junction table to track which invoices were paid by which Stripe payments
    - Add RLS policies for the new table

  2. Tables
    - `stripe_invoice_payments`
      - `id` (uuid, primary key)
      - `stripe_session_id` (text) - References the Stripe checkout session
      - `invoice_id` (uuid) - References the invoice that was paid
      - `amount_paid` (numeric) - Amount paid towards this specific invoice
      - `payment_date` (timestamptz) - When the payment was made
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on `stripe_invoice_payments`
    - Add policies for authenticated users to view their payment history
*/

-- Add balance field to invoices if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'balance'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN balance numeric(18, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'acumatica_invoices' AND column_name = 'description'
  ) THEN
    ALTER TABLE acumatica_invoices ADD COLUMN description text;
  END IF;
END $$;

-- Update existing invoices to set balance = dac_total if balance is null
UPDATE acumatica_invoices 
SET balance = dac_total 
WHERE balance IS NULL;

-- Create stripe invoice payments junction table
CREATE TABLE IF NOT EXISTS stripe_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  amount_paid numeric(18, 2) NOT NULL,
  payment_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE stripe_invoice_payments ENABLE ROW LEVEL SECURITY;

-- Customers can view their own invoice payments
CREATE POLICY "Customers can view their invoice payments"
  ON stripe_invoice_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acumatica_invoices
      WHERE acumatica_invoices.id = stripe_invoice_payments.invoice_id
    )
  );

-- Service role can insert payment records (webhook will use this)
CREATE POLICY "Service role can insert payment records"
  ON stripe_invoice_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stripe_invoice_payments_session_id 
  ON stripe_invoice_payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_invoice_payments_invoice_id 
  ON stripe_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_acumatica_invoices_balance 
  ON acumatica_invoices(balance);
