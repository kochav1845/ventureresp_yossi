/*
  # Enhance Customer Filter System

  1. Changes
    - Add `last_used_at` to `saved_customer_filters` to track when filters were last loaded
    - Add `excluded_customer_ids` to filter_config (stored in jsonb, so no schema change needed)
    - Add index on last_used_at for sorting

  2. Notes
    - The excluded customer IDs will be stored in the filter_config jsonb field
    - This migration just adds the last_used_at tracking field
*/

-- Add last_used_at column to track when filters are used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_customer_filters' AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE saved_customer_filters ADD COLUMN last_used_at timestamptz;
  END IF;
END $$;

-- Create index on last_used_at for sorting by recently used
CREATE INDEX IF NOT EXISTS idx_saved_customer_filters_last_used ON saved_customer_filters(last_used_at DESC NULLS LAST);

-- Create function to update last_used_at when a filter is loaded
CREATE OR REPLACE FUNCTION update_filter_last_used(filter_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE saved_customer_filters
  SET last_used_at = now()
  WHERE id = filter_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
