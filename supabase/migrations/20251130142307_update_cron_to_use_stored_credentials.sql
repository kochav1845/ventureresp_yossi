/*
  # Update Cron Job to Use Stored Credentials

  1. Changes
    - Update trigger_acumatica_sync() function to fetch credentials from database
    - Enable actual HTTP calls to master sync function using pg_net
    - Add proper error handling and logging

  2. Security
    - Function runs as SECURITY DEFINER with elevated privileges
    - Credentials fetched from secure table with RLS
    - Only active credentials are used
*/

-- Drop and recreate the trigger function with credential fetching
CREATE OR REPLACE FUNCTION trigger_acumatica_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_acumatica_url text;
  v_username text;
  v_password text;
  v_company text;
  v_branch text;
  v_should_sync boolean := false;
  v_request_id bigint;
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

  -- Get credentials from database
  SELECT 
    acumatica_url,
    username,
    password,
    company,
    branch
  INTO 
    v_acumatica_url,
    v_username,
    v_password,
    v_company,
    v_branch
  FROM acumatica_sync_credentials
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- Check if credentials exist
  IF v_username IS NULL OR v_password IS NULL THEN
    RAISE NOTICE 'No active credentials found, skipping sync';
    RETURN;
  END IF;

  -- Get Supabase configuration
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, try to construct from known values
  IF v_supabase_url IS NULL THEN
    -- This will be set by Supabase automatically in production
    v_supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
  END IF;

  -- Call the master sync function via HTTP
  BEGIN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/acumatica-master-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(v_service_role_key, ''),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'acumaticaUrl', v_acumatica_url,
        'username', v_username,
        'password', v_password,
        'company', v_company,
        'branch', v_branch
      )
    ) INTO v_request_id;

    RAISE NOTICE 'Sync triggered successfully, request_id: %', v_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error triggering sync: %', SQLERRM;
  END;
END;
$$;
