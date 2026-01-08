/*
  # Update Sync Schedule to 5 Minutes Minimum
  
  1. Changes
    - Update default sync interval to 5 minutes
    - Update cron job to run every 5 minutes instead of every minute
    - Add check to prevent concurrent syncs
    - Add last sync timestamp validation
  
  2. Purpose
    - Prevent concurrent API login limit exhaustion
    - Reduce API load on Acumatica
    - Ensure proper session management
*/

-- Update default sync interval to 5 minutes
UPDATE sync_status
SET sync_interval_minutes = 5
WHERE sync_interval_minutes < 5;

-- Set minimum interval for any future updates
ALTER TABLE sync_status
ADD CONSTRAINT sync_interval_minimum CHECK (sync_interval_minutes >= 5);

-- Remove the old cron job
SELECT cron.unschedule('acumatica-auto-sync')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'acumatica-auto-sync'
);

-- Update the trigger function to respect minimum sync interval
CREATE OR REPLACE FUNCTION trigger_acumatica_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_acumatica_url text;
  v_username text;
  v_password text;
  v_company text;
  v_branch text;
  v_should_sync boolean := false;
  v_last_sync timestamptz;
  v_sync_interval_minutes int := 5;
BEGIN
  -- Get credentials from the secure credentials table
  SELECT acumatica_url, username, password, company, branch
  INTO v_acumatica_url, v_username, v_password, v_company, v_branch
  FROM acumatica_sync_credentials
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no credentials found, exit
  IF v_username IS NULL OR v_password IS NULL THEN
    RAISE NOTICE 'No active Acumatica credentials found';
    RETURN;
  END IF;

  -- Check if any entity is due for sync (respecting 5 minute minimum)
  SELECT EXISTS (
    SELECT 1 FROM sync_status
    WHERE sync_enabled = true
    AND status != 'running'
    AND (
      last_successful_sync IS NULL 
      OR last_successful_sync < NOW() - INTERVAL '5 minutes'
    )
  ) INTO v_should_sync;

  IF NOT v_should_sync THEN
    RAISE NOTICE 'Sync not due yet or already running';
    RETURN;
  END IF;

  -- Mark sync as running to prevent concurrent execution
  UPDATE sync_status
  SET 
    status = 'running',
    updated_at = NOW()
  WHERE sync_enabled = true
  AND status != 'running'
  AND (
    last_successful_sync IS NULL 
    OR last_successful_sync < NOW() - INTERVAL '5 minutes'
  );

  -- Call the master sync edge function
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/acumatica-master-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'acumaticaUrl', v_acumatica_url,
      'username', v_username,
      'password', v_password,
      'company', v_company,
      'branch', v_branch
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Reset status on error
    UPDATE sync_status
    SET 
      status = 'failed',
      last_error = SQLERRM,
      updated_at = NOW()
    WHERE status = 'running';
    
    RAISE NOTICE 'Sync failed: %', SQLERRM;
END;
$$;

-- Schedule the cron job to run every 5 minutes
SELECT cron.schedule(
  'acumatica-auto-sync',
  '*/5 * * * *', -- Every 5 minutes
  $$SELECT trigger_acumatica_sync();$$
);

-- Add a helpful comment
COMMENT ON FUNCTION trigger_acumatica_sync() IS 'Triggers Acumatica sync every 5 minutes, respecting concurrent login limits';
