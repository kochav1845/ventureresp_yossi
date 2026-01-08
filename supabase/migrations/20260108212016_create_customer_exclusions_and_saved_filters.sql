/*
  # Customer Exclusions and Saved Filters

  1. New Tables
    - `excluded_customers`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `customer_id` (text, references acumatica_customers)
      - `excluded_at` (timestamptz)
      - `notes` (text, optional reason for exclusion)

    - `saved_customer_filters`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `filter_name` (text, name of the saved filter)
      - `filter_config` (jsonb, stores all filter settings)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can only view/manage their own exclusions and filters
*/

-- Create excluded_customers table
CREATE TABLE IF NOT EXISTS excluded_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  excluded_at timestamptz DEFAULT now(),
  notes text,
  UNIQUE(user_id, customer_id)
);

-- Create saved_customer_filters table
CREATE TABLE IF NOT EXISTS saved_customer_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filter_name text NOT NULL,
  filter_config jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, filter_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_excluded_customers_user_id ON excluded_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_excluded_customers_customer_id ON excluded_customers(customer_id);
CREATE INDEX IF NOT EXISTS idx_saved_customer_filters_user_id ON saved_customer_filters(user_id);

-- Enable RLS
ALTER TABLE excluded_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_customer_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policies for excluded_customers
CREATE POLICY "Users can view own excluded customers"
  ON excluded_customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can exclude customers"
  ON excluded_customers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove exclusions"
  ON excluded_customers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for saved_customer_filters
CREATE POLICY "Users can view own saved filters"
  ON saved_customer_filters FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create saved filters"
  ON saved_customer_filters FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved filters"
  ON saved_customer_filters FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved filters"
  ON saved_customer_filters FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_customer_filters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_saved_customer_filters_updated_at_trigger ON saved_customer_filters;
CREATE TRIGGER update_saved_customer_filters_updated_at_trigger
  BEFORE UPDATE ON saved_customer_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_customer_filters_updated_at();