/*
  # Create Sync Progress Tracking System
  
  1. New Tables
    - `sync_progress` - Tracks real-time progress of sync operations
      - `id` (uuid, primary key)
      - `sync_id` (text) - Unique identifier for the sync session
      - `operation_type` (text) - Type of sync operation
      - `total_items` (integer) - Total items to process
      - `processed_items` (integer) - Items processed so far
      - `current_item` (text) - Current item being processed
      - `status` (text) - running, completed, failed
      - `error_message` (text) - Error message if failed
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `last_updated_at` (timestamptz)
      - `metadata` (jsonb) - Additional metadata

  2. Security
    - Enable RLS
    - Allow authenticated users to read progress
    - Only service role can write progress
*/

CREATE TABLE IF NOT EXISTS sync_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_id text NOT NULL,
  operation_type text NOT NULL,
  total_items integer DEFAULT 0,
  processed_items integer DEFAULT 0,
  current_item text,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  last_updated_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_progress_sync_id ON sync_progress(sync_id);
CREATE INDEX IF NOT EXISTS idx_sync_progress_status ON sync_progress(status);
CREATE INDEX IF NOT EXISTS idx_sync_progress_started_at ON sync_progress(started_at DESC);

ALTER TABLE sync_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sync progress"
  ON sync_progress
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert sync progress"
  ON sync_progress
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update sync progress"
  ON sync_progress
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);