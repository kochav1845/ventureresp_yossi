/*
  # Create Sync Change Logs Table

  1. New Tables
    - `sync_change_logs`
      - `id` (uuid, primary key)
      - `sync_type` (text) - Type of entity: 'customer', 'invoice', 'payment'
      - `action_type` (text) - Action performed: 'created', 'updated', 'closed', 'deleted'
      - `entity_id` (uuid, nullable) - Reference to the entity in our database
      - `entity_reference` (text) - Reference number from Acumatica (e.g., customer ID, invoice number)
      - `entity_name` (text, nullable) - Name/description of the entity
      - `change_summary` (text) - Brief description of what changed
      - `change_details` (jsonb, nullable) - Detailed changes (old vs new values)
      - `sync_source` (text) - Source: 'webhook', 'scheduled_sync', 'manual_sync', 'bulk_fetch'
      - `created_at` (timestamptz) - When the log was created
      - `user_id` (uuid, nullable) - User who initiated manual sync (if applicable)

  2. Indexes
    - Index on sync_type for filtering
    - Index on action_type for filtering
    - Index on entity_reference for quick lookup
    - Index on created_at for time-based queries
    - Index on sync_source for filtering by source

  3. Security
    - Enable RLS
    - Allow authenticated users to read all logs
    - Only allow service role to insert logs (sync functions)
*/

CREATE TABLE IF NOT EXISTS sync_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL CHECK (sync_type IN ('customer', 'invoice', 'payment', 'payment_application')),
  action_type text NOT NULL CHECK (action_type IN ('created', 'updated', 'closed', 'reopened', 'deleted', 'status_changed', 'paid', 'partially_paid')),
  entity_id uuid,
  entity_reference text NOT NULL,
  entity_name text,
  change_summary text NOT NULL,
  change_details jsonb,
  sync_source text NOT NULL CHECK (sync_source IN ('webhook', 'scheduled_sync', 'manual_sync', 'bulk_fetch', 'batch_processing')),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_type ON sync_change_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_action_type ON sync_change_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity_reference ON sync_change_logs(entity_reference);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_change_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_sync_source ON sync_change_logs(sync_source);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity_id ON sync_change_logs(entity_id);

ALTER TABLE sync_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all sync logs"
  ON sync_change_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert sync logs"
  ON sync_change_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION log_sync_change(
  p_sync_type text,
  p_action_type text,
  p_entity_id uuid,
  p_entity_reference text,
  p_entity_name text,
  p_change_summary text,
  p_change_details jsonb,
  p_sync_source text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO sync_change_logs (
    sync_type,
    action_type,
    entity_id,
    entity_reference,
    entity_name,
    change_summary,
    change_details,
    sync_source
  ) VALUES (
    p_sync_type,
    p_action_type,
    p_entity_id,
    p_entity_reference,
    p_entity_name,
    p_change_summary,
    p_change_details,
    p_sync_source
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;
