/*
  # Create Payment Fetch Logs Table

  1. New Tables
    - `payment_application_fetch_logs`
      - `id` (uuid, primary key)
      - `payment_id` (uuid, foreign key to acumatica_payments)
      - `payment_reference_number` (text)
      - `customer_id` (text)
      - `customer_name` (text)
      - `applications_count` (integer)
      - `fetched_by` (uuid, foreign key to user_profiles)
      - `fetched_at` (timestamptz)
      - `fetch_status` (text - success/error)
      - `error_message` (text, nullable)
      - `applications_data` (jsonb, nullable)

  2. Security
    - Enable RLS on `payment_application_fetch_logs` table
    - Add policies for authenticated users to insert and view logs
*/

CREATE TABLE IF NOT EXISTS payment_application_fetch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES acumatica_payments(id) ON DELETE CASCADE,
  payment_reference_number text NOT NULL,
  customer_id text,
  customer_name text,
  applications_count integer DEFAULT 0,
  fetched_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  fetched_at timestamptz DEFAULT now(),
  fetch_status text NOT NULL DEFAULT 'success',
  error_message text,
  applications_data jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_application_fetch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert fetch logs"
  ON payment_application_fetch_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view fetch logs"
  ON payment_application_fetch_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_payment_fetch_logs_payment_id
  ON payment_application_fetch_logs(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_fetch_logs_fetched_at
  ON payment_application_fetch_logs(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_fetch_logs_fetched_by
  ON payment_application_fetch_logs(fetched_by);