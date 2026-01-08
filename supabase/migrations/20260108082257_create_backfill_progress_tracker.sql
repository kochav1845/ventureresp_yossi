/*
  # Create Backfill Progress Tracker

  1. New Tables
    - `backfill_progress`
      - Tracks ongoing backfill operations
      - Stores current offset, batch size, and completion status
      - Prevents multiple concurrent backfills
      - Auto-updates timestamps

  2. Changes
    - Single row constraint ensures only one active backfill at a time
    - Tracks total payments, processed count, applications, and attachments found
    - Records start/end times and error counts

  3. Security
    - Enable RLS
    - Only authenticated users with admin/developer roles can manage backfills
*/

-- Create backfill progress tracking table
CREATE TABLE IF NOT EXISTS backfill_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backfill_type text NOT NULL DEFAULT 'payment_data',
  is_running boolean NOT NULL DEFAULT false,
  batch_size integer NOT NULL DEFAULT 20,
  current_offset integer NOT NULL DEFAULT 0,
  total_items integer NOT NULL DEFAULT 0,
  items_processed integer NOT NULL DEFAULT 0,
  applications_found integer NOT NULL DEFAULT 0,
  attachments_found integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  last_batch_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique constraint to ensure only one backfill per type
CREATE UNIQUE INDEX IF NOT EXISTS backfill_progress_type_unique
  ON backfill_progress(backfill_type);

-- Enable RLS
ALTER TABLE backfill_progress ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role has full access to backfill_progress"
  ON backfill_progress
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read backfill progress
CREATE POLICY "Authenticated users can read backfill progress"
  ON backfill_progress
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users with admin or developer roles to manage backfills
CREATE POLICY "Admins can manage backfill progress"
  ON backfill_progress
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'developer')
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_backfill_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_backfill_progress_timestamp
  BEFORE UPDATE ON backfill_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_backfill_progress_timestamp();

-- Initialize the payment_data backfill record
INSERT INTO backfill_progress (backfill_type, is_running, batch_size, current_offset, total_items)
VALUES ('payment_data', false, 20, 0, 0)
ON CONFLICT (backfill_type) DO NOTHING;
