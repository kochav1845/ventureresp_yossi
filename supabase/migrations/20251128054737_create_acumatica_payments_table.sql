/*
  # Create Acumatica Payments Table

  1. New Tables
    - `acumatica_payments`
      - `id` (uuid, primary key) - Internal database ID
      - `acumatica_id` (text) - Acumatica's unique ID
      - `row_number` (integer) - Row number from API
      - `reference_number` (text, unique, not null) - Payment reference number
      - `type` (text) - Payment type (Payment, Prepayment, Credit Memo, etc.)
      - `customer_id` (text) - Customer identifier
      - `customer_location_id` (text) - Customer location
      - `status` (text) - Payment status (Open, Closed, etc.)
      - `application_date` (timestamptz) - Date payment was applied
      - `payment_amount` (numeric) - Payment amount
      - `available_balance` (numeric) - Available balance
      - `currency_id` (text) - Currency code
      - `description` (text) - Payment description
      - `payment_method` (text) - Payment method used
      - `payment_ref` (text) - Payment reference
      - `cash_account` (text) - Cash account
      - `card_account_nbr` (text) - Card account number (masked)
      - `external_ref` (text) - External reference
      - `hold` (boolean, default false) - On hold flag
      - `is_cc_payment` (boolean, default false) - Is credit card payment
      - `is_new_card` (boolean, default false) - Is new card
      - `save_card` (boolean, default false) - Save card flag
      - `processing_center_id` (text) - Processing center ID
      - `orig_transaction` (text) - Original transaction reference
      - `note_id` (text) - Note ID
      - `note` (text) - Payment notes
      - `last_modified_datetime` (timestamptz) - Last modified timestamp
      - `applied_to_documents` (jsonb) - Applied documents data
      - `applied_to_orders` (jsonb) - Applied orders data
      - `raw_data` (jsonb) - Complete raw JSON from Acumatica
      - `synced_at` (timestamptz, default now()) - Last sync timestamp
      - `created_at` (timestamptz, default now()) - Record creation timestamp

  2. Indexes
    - Unique index on reference_number
    - Index on customer_id for faster lookups
    - Index on status for filtering
    - Index on application_date for date-based queries
    - Index on synced_at for sync tracking

  3. Security
    - Enable RLS on `acumatica_payments` table
    - Add policy for authenticated users to read payments
    - Add policy for authenticated users to insert payments (for sync)
    - Add policy for authenticated users to update payments (for sync)

  ## Important Notes
  - The reference_number is the unique identifier for payments in Acumatica
  - All monetary amounts are stored as numeric for precision
  - The raw_data field preserves the complete API response
  - Timestamps are stored in UTC with timezone
*/

-- Create the acumatica_payments table
CREATE TABLE IF NOT EXISTS acumatica_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acumatica_id text,
  row_number integer,
  reference_number text UNIQUE NOT NULL,
  type text,
  customer_id text,
  customer_location_id text,
  status text,
  application_date timestamptz,
  payment_amount numeric,
  available_balance numeric,
  currency_id text,
  description text,
  payment_method text,
  payment_ref text,
  cash_account text,
  card_account_nbr text,
  external_ref text,
  hold boolean DEFAULT false,
  is_cc_payment boolean DEFAULT false,
  is_new_card boolean DEFAULT false,
  save_card boolean DEFAULT false,
  processing_center_id text,
  orig_transaction text,
  note_id text,
  note text,
  last_modified_datetime timestamptz,
  applied_to_documents jsonb,
  applied_to_orders jsonb,
  raw_data jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON acumatica_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON acumatica_payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_application_date ON acumatica_payments(application_date);
CREATE INDEX IF NOT EXISTS idx_payments_synced_at ON acumatica_payments(synced_at);
CREATE INDEX IF NOT EXISTS idx_payments_reference_number ON acumatica_payments(reference_number);

-- Enable Row Level Security
ALTER TABLE acumatica_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can read all payments
CREATE POLICY "Authenticated users can read payments"
  ON acumatica_payments
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert payments (for sync operations)
CREATE POLICY "Authenticated users can insert payments"
  ON acumatica_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Authenticated users can update payments (for sync operations)
CREATE POLICY "Authenticated users can update payments"
  ON acumatica_payments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can delete payments (for cleanup operations)
CREATE POLICY "Authenticated users can delete payments"
  ON acumatica_payments
  FOR DELETE
  TO authenticated
  USING (true);
