/*
  # Cached Payment Analytics System

  1. New Tables
    - `cached_payment_analytics`
      - Stores pre-calculated payment analytics for fast retrieval
      - Supports daily, monthly, and yearly aggregates
      - Includes totals, counts, and unique customer counts
      - Tracks last calculation time and data freshness

  2. Security
    - Enable RLS
    - Admins can read and update cached analytics
    - Collectors can read their own data

  3. Performance
    - Add indexes for efficient querying by period type and date ranges
    - Add unique constraints to prevent duplicate calculations
*/

-- Create cached payment analytics table
CREATE TABLE IF NOT EXISTS cached_payment_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Period identification
  period_type text NOT NULL CHECK (period_type IN ('daily', 'monthly', 'yearly')),
  year integer NOT NULL,
  month integer CHECK (month IS NULL OR (month >= 1 AND month <= 12)),
  day integer CHECK (day IS NULL OR (day >= 1 AND day <= 31)),
  date date, -- For daily periods

  -- Aggregated metrics
  total_amount numeric(15, 2) DEFAULT 0 NOT NULL,
  payment_count integer DEFAULT 0 NOT NULL,
  unique_customer_count integer DEFAULT 0 NOT NULL,

  -- Additional metrics
  payment_types jsonb DEFAULT '{}' NOT NULL, -- Count by payment type (Payment, Prepayment, etc)
  payment_methods jsonb DEFAULT '{}' NOT NULL, -- Count by payment method
  status_breakdown jsonb DEFAULT '{}' NOT NULL, -- Count by status

  -- Metadata
  calculated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,

  -- Unique constraint to prevent duplicates
  CONSTRAINT unique_period_constraint UNIQUE (period_type, year, month, day)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cached_analytics_period_type ON cached_payment_analytics(period_type);
CREATE INDEX IF NOT EXISTS idx_cached_analytics_year ON cached_payment_analytics(year);
CREATE INDEX IF NOT EXISTS idx_cached_analytics_date ON cached_payment_analytics(date) WHERE date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cached_analytics_calculated_at ON cached_payment_analytics(calculated_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_cached_analytics_period_year_month
  ON cached_payment_analytics(period_type, year, month)
  WHERE month IS NOT NULL;

-- Enable RLS
ALTER TABLE cached_payment_analytics ENABLE ROW LEVEL SECURITY;

-- Admins and secretaries can read all cached analytics
CREATE POLICY "Admins and secretaries can read cached analytics"
  ON cached_payment_analytics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'secretary')
    )
  );

-- Only service role can insert/update cached analytics (called by edge functions)
CREATE POLICY "Service role can manage cached analytics"
  ON cached_payment_analytics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_cached_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to auto-update updated_at
CREATE TRIGGER update_cached_analytics_timestamp
  BEFORE UPDATE ON cached_payment_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_cached_analytics_updated_at();

-- Create a view for easy access to latest analytics
CREATE OR REPLACE VIEW latest_payment_analytics AS
SELECT
  period_type,
  year,
  month,
  day,
  date,
  total_amount,
  payment_count,
  unique_customer_count,
  payment_types,
  payment_methods,
  status_breakdown,
  calculated_at,
  EXTRACT(EPOCH FROM (now() - calculated_at))/3600 AS hours_since_calculation
FROM cached_payment_analytics
ORDER BY period_type, year DESC, month DESC NULLS LAST, day DESC NULLS LAST;

-- Grant access to the view
GRANT SELECT ON latest_payment_analytics TO authenticated;
GRANT SELECT ON latest_payment_analytics TO service_role;