/*
  # Create Sync Status Table

  1. New Tables
    - `sync_status`
      - `id` (uuid, primary key) - Unique identifier for each sync job
      - `entity_type` (text) - Type of entity being synced (customer, invoice, payment)
      - `last_successful_sync` (timestamptz) - Timestamp of last successful sync
      - `next_scheduled_sync` (timestamptz) - When next sync should run
      - `status` (text) - Current status (idle, running, completed, failed)
      - `records_synced` (integer) - Count of records synced in last run
      - `records_updated` (integer) - Count of records updated
      - `records_created` (integer) - Count of new records created
      - `errors` (jsonb) - Any errors encountered during sync
      - `sync_duration_ms` (integer) - Duration of last sync in milliseconds
      - `last_error` (text) - Last error message if sync failed
      - `retry_count` (integer) - Number of retry attempts
      - `sync_enabled` (boolean) - Whether auto-sync is enabled for this entity
      - `sync_interval_minutes` (integer) - Sync interval in minutes
      - `lookback_minutes` (integer) - How far back to look for changes
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

    - `sync_logs`
      - `id` (uuid, primary key) - Unique identifier for each log entry
      - `entity_type` (text) - Type of entity being synced
      - `sync_started_at` (timestamptz) - When sync started
      - `sync_completed_at` (timestamptz) - When sync completed
      - `status` (text) - Status of this sync run
      - `records_synced` (integer) - Count of records synced
      - `records_updated` (integer) - Count of records updated
      - `records_created` (integer) - Count of new records created
      - `errors` (jsonb) - Errors encountered
      - `duration_ms` (integer) - Duration in milliseconds
      - `created_at` (timestamptz) - Log entry timestamp

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated admin users to manage sync status
*/

-- Create sync_status table
CREATE TABLE IF NOT EXISTS sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text UNIQUE NOT NULL CHECK (entity_type IN ('customer', 'invoice', 'payment', 'all')),
  last_successful_sync timestamptz,
  next_scheduled_sync timestamptz,
  status text DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'completed', 'failed')),
  records_synced integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_created integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  sync_duration_ms integer DEFAULT 0,
  last_error text,
  retry_count integer DEFAULT 0,
  sync_enabled boolean DEFAULT true,
  sync_interval_minutes integer DEFAULT 1,
  lookback_minutes integer DEFAULT 2,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create sync_logs table for historical tracking
CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  sync_started_at timestamptz NOT NULL,
  sync_completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  records_synced integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_created integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sync_status_entity_type ON sync_status(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_status_status ON sync_status(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity_type ON sync_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- Enable RLS
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sync_status
CREATE POLICY "Admin users can view sync status"
  ON sync_status
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can insert sync status"
  ON sync_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can update sync status"
  ON sync_status
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- RLS Policies for sync_logs
CREATE POLICY "Admin users can view sync logs"
  ON sync_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can insert sync logs"
  ON sync_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Insert initial sync status records for each entity type
INSERT INTO sync_status (entity_type, sync_enabled, sync_interval_minutes, lookback_minutes)
VALUES
  ('customer', true, 1, 2),
  ('invoice', true, 1, 2),
  ('payment', true, 1, 2)
ON CONFLICT (entity_type) DO NOTHING;