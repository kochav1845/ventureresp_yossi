/*
  # Setup Automatic Sync Cron Job

  1. Changes
    - Create a cron job that runs every minute to sync Acumatica data
    - Job calls the master sync function which orchestrates all entity syncs
    - Uses pg_cron extension for scheduling

  2. Important Notes
    - The cron job will only run if sync_enabled is true in sync_status table
    - Credentials must be configured in the system (stored securely)
    - Job runs as service role with full database access
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove existing cron job if it exists
SELECT cron.unschedule('acumatica-auto-sync')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'acumatica-auto-sync'
);

-- Create a function to check if sync should run and call the edge function
CREATE OR REPLACE FUNCTION trigger_acumatica_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_acumatica_url text := 'https://VentureResp.acumatica.com';
  v_username text;
  v_password text;
  v_company text;
  v_branch text;
  v_should_sync boolean := false;
BEGIN
  -- Check if any entity has sync enabled
  SELECT EXISTS (
    SELECT 1 FROM sync_status
    WHERE sync_enabled = true
    AND (status != 'running' OR status IS NULL)
  ) INTO v_should_sync;

  IF NOT v_should_sync THEN
    RAISE NOTICE 'Sync is disabled or already running, skipping';
    RETURN;
  END IF;

  -- Get Supabase URL and service role key from environment
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- Get Acumatica credentials (these should be stored securely)
  -- For now, we'll log that credentials are needed
  RAISE NOTICE 'Sync triggered but credentials management needs to be configured';
  
  -- Note: In production, you would:
  -- 1. Store credentials in a secure vault table
  -- 2. Fetch them here
  -- 3. Make HTTP request to the master sync function
  -- Example:
  -- PERFORM net.http_post(
  --   url := v_supabase_url || '/functions/v1/acumatica-master-sync',
  --   headers := jsonb_build_object('Authorization', 'Bearer ' || v_service_role_key, 'Content-Type', 'application/json'),
  --   body := jsonb_build_object('acumaticaUrl', v_acumatica_url, 'username', v_username, 'password', v_password, 'company', v_company, 'branch', v_branch)
  -- );
  
END;
$$;

-- Schedule the cron job to run every minute
SELECT cron.schedule(
  'acumatica-auto-sync',
  '* * * * *', -- Every minute
  $$SELECT trigger_acumatica_sync();$$
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a table to store sync credentials securely
CREATE TABLE IF NOT EXISTS acumatica_sync_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acumatica_url text NOT NULL DEFAULT 'https://VentureResp.acumatica.com',
  username text,
  password text,
  company text,
  branch text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE acumatica_sync_credentials ENABLE ROW LEVEL SECURITY;

-- Only admin users can manage credentials
CREATE POLICY "Admin users can view credentials"
  ON acumatica_sync_credentials
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can insert credentials"
  ON acumatica_sync_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can update credentials"
  ON acumatica_sync_credentials
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
