/*
  # Create User Quick Filters System

  ## Overview
  Create a comprehensive system for users to define and save their own custom quick filters
  for the customer list view. Each filter can include multiple criteria types.

  ## 1. New Tables
    - `user_quick_filters`
      - `id` (uuid, primary key) - Unique filter identifier
      - `user_id` (uuid, foreign key) - User who created this filter
      - `name` (text) - Display name for the filter button
      - `icon` (text) - Lucide icon name (optional)
      - `color` (text) - Button color theme (blue, red, green, purple, orange, etc.)
      - `filter_config` (jsonb) - Comprehensive filter configuration
      - `sort_order` (integer) - Display order (lower numbers first)
      - `is_active` (boolean) - Whether to show this filter
      - `created_at` (timestamptz) - When filter was created
      - `updated_at` (timestamptz) - When filter was last modified

  ## 2. Filter Configuration Schema
  The `filter_config` JSONB field supports:
  ```json
  {
    "dateRange": {
      "type": "relative|absolute|none",
      "relativeDays": 30,
      "fromDate": "2024-01-01",
      "toDate": "2024-12-31"
    },
    "balance": {
      "min": 0,
      "max": 999999999
    },
    "invoiceCount": {
      "min": 0,
      "max": 999
    },
    "overdueCount": {
      "min": 0,
      "max": 999
    },
    "colorStatus": ["red", "yellow", "green"],
    "daysOverdue": {
      "min": 0,
      "max": 365
    },
    "excludeFromAnalytics": true|false,
    "excludeFromReports": true|false,
    "hasCollectorAssigned": true|false|null,
    "hasActiveTickets": true|false|null
  }
  ```

  ## 3. Security
    - Enable RLS
    - Users can only view/edit their own filters
    - Admins can view all filters

  ## 4. Indexes
    - Index on user_id for fast filter lookup
    - Index on sort_order for display ordering
*/

-- Create user_quick_filters table
CREATE TABLE IF NOT EXISTS user_quick_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 50),
  icon text DEFAULT 'filter',
  color text DEFAULT 'blue' CHECK (color IN ('blue', 'red', 'green', 'purple', 'orange', 'yellow', 'pink', 'cyan', 'gray')),
  filter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_quick_filters_user_id ON user_quick_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quick_filters_sort_order ON user_quick_filters(user_id, sort_order) WHERE is_active = true;

-- Enable RLS
ALTER TABLE user_quick_filters ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own quick filters"
  ON user_quick_filters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quick filters"
  ON user_quick_filters
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quick filters"
  ON user_quick_filters
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own quick filters"
  ON user_quick_filters
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all quick filters
CREATE POLICY "Admins can view all quick filters"
  ON user_quick_filters
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_user_quick_filters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_quick_filters_updated_at
  BEFORE UPDATE ON user_quick_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_user_quick_filters_updated_at();