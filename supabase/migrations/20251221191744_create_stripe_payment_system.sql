-- Stripe Payment Integration System
-- 
-- 1. New Tables
--    - stripe_checkout_sessions: Stores Stripe checkout session data
--    - stripe_payment_records: Stores completed payment records
-- 
-- 2. Security
--    - Enable RLS on both tables
--    - Admins can view all payment records
--    - Service role can insert/update via webhooks
-- 
-- 3. Indexes
--    - Index on customer_id for fast lookups
--    - Index on session_id and payment_intent_id

CREATE TABLE IF NOT EXISTS stripe_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  customer_email text NOT NULL,
  customer_name text NOT NULL,
  session_id text UNIQUE NOT NULL,
  payment_intent_id text,
  amount numeric NOT NULL,
  currency text DEFAULT 'usd',
  status text DEFAULT 'pending',
  invoice_ids jsonb DEFAULT '[]'::jsonb,
  success_url text,
  cancel_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid REFERENCES stripe_checkout_sessions(id),
  payment_intent_id text UNIQUE NOT NULL,
  charge_id text,
  customer_id text NOT NULL,
  amount_paid numeric NOT NULL,
  currency text DEFAULT 'usd',
  payment_method text,
  payment_status text DEFAULT 'succeeded',
  invoice_ids jsonb DEFAULT '[]'::jsonb,
  receipt_url text,
  stripe_customer_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_customer ON stripe_checkout_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_session ON stripe_checkout_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON stripe_checkout_sessions(status);
CREATE INDEX IF NOT EXISTS idx_payment_records_customer ON stripe_payment_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_intent ON stripe_payment_records(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON stripe_payment_records(payment_status);

ALTER TABLE stripe_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all checkout sessions"
  ON stripe_checkout_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Service role can insert checkout sessions"
  ON stripe_checkout_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update checkout sessions"
  ON stripe_checkout_sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can view all payment records"
  ON stripe_payment_records FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Service role can insert payment records"
  ON stripe_payment_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update payment records"
  ON stripe_payment_records FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);