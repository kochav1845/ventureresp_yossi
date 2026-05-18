/*
  # Create user analytics default filters table

  1. New Tables
    - `user_analytics_default_filters`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `page` (text, either 'invoice_analytics' or 'payment_analytics')
      - `filters` (jsonb, stores all filter values)
      - `excluded_customers` (text[], array of customer IDs to exclude)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Users can only read/write their own default filters

  3. Notes
    - Each user has one default filter config per analytics page
    - Excluded customers are stored separately for easy access
    - The filters JSONB contains page-specific filter values
*/

CREATE TABLE IF NOT EXISTS user_analytics_default_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page text NOT NULL CHECK (page IN ('invoice_analytics', 'payment_analytics')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  excluded_customers text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, page)
);

ALTER TABLE user_analytics_default_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own default filters"
  ON user_analytics_default_filters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own default filters"
  ON user_analytics_default_filters
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own default filters"
  ON user_analytics_default_filters
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own default filters"
  ON user_analytics_default_filters
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_analytics_default_filters_user_page
  ON user_analytics_default_filters(user_id, page);
