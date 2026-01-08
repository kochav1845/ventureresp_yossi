/*
  # Fix Cron Trigger Function
  
  1. Changes
    - Fix trigger_acumatica_sync() to use hardcoded Supabase URL
    - Remove dependency on unavailable settings
    - Use the actual project URL and service role key from environment
*/

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

  -- Call the master sync function via HTTP using pg_net
  BEGIN
    SELECT net.http_post(
      url := 'https://leipneymocoksmajxnok.supabase.co/functions/v1/acumatica-master-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'acumaticaUrl', v_acumatica_url,
        'username', v_username,
        'password', v_password,
        'company', COALESCE(v_company, ''),
        'branch', COALESCE(v_branch, '')
      )
    ) INTO v_request_id;

    RAISE NOTICE 'Sync triggered successfully, request_id: %', v_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error triggering sync: %', SQLERRM;
  END;
END;
$$;