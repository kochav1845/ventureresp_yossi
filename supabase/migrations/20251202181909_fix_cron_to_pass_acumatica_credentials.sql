/*
  # Fix Cron Job to Pass Acumatica Credentials
  
  1. Problem
    - Cron trigger sends empty body to master sync function
    - Master sync requires Acumatica credentials in request body
    - This causes sync to fail with "Missing Acumatica credentials" error
  
  2. Solution
    - Update trigger function to fetch Acumatica credentials from database
    - Pass credentials in the HTTP POST body to master sync function
  
  3. Changes
    - Retrieve acumatica_url, username, password, company, branch from credentials table
    - Include all credentials in the request body
*/

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
  v_request_body jsonb;
BEGIN
  -- Get all credentials from the active configuration
  SELECT 
    supabase_url, 
    supabase_service_role_key,
    acumatica_url,
    username,
    password,
    company,
    branch
  INTO 
    v_supabase_url, 
    v_service_role_key,
    v_acumatica_url,
    v_username,
    v_password,
    v_company,
    v_branch
  FROM acumatica_sync_credentials
  WHERE is_active = true
  AND supabase_url IS NOT NULL
  AND supabase_service_role_key IS NOT NULL
  AND acumatica_url IS NOT NULL
  AND username IS NOT NULL
  AND password IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no configuration found, exit
  IF v_supabase_url IS NULL OR v_service_role_key IS NULL OR v_acumatica_url IS NULL THEN
    RAISE NOTICE 'No complete configuration found in credentials table';
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

  -- Build request body with all credentials
  v_request_body := jsonb_build_object(
    'acumaticaUrl', v_acumatica_url,
    'username', v_username,
    'password', v_password,
    'company', COALESCE(v_company, ''),
    'branch', COALESCE(v_branch, '')
  );

  -- Call the master sync edge function with credentials
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/acumatica-master-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := v_request_body
  );

  RAISE NOTICE 'Sync triggered successfully';

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

COMMENT ON FUNCTION trigger_acumatica_sync() IS 'Triggers Acumatica sync every 5 minutes with full credentials from acumatica_sync_credentials table.';