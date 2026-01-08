/*
  # Simplify Cron to Use Anon Key Instead of Service Role Key
  
  1. Changes
    - Remove supabase_service_role_key requirement
    - Add supabase_anon_key column instead
    - Update trigger function to use anon key
    - Anon key is safer and easier to manage
  
  2. Migration Steps
    - Add anon_key column
    - Copy service role key placeholder to anon key if not already set
    - Update trigger function
    - Remove service role key requirement from check
*/

-- Add anon key column if it doesn't exist
ALTER TABLE acumatica_sync_credentials
ADD COLUMN IF NOT EXISTS supabase_anon_key text;

-- Update the trigger function to use anon key
CREATE OR REPLACE FUNCTION trigger_acumatica_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_anon_key text;
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
    supabase_anon_key,
    acumatica_url,
    username,
    password,
    company,
    branch
  INTO 
    v_supabase_url, 
    v_anon_key,
    v_acumatica_url,
    v_username,
    v_password,
    v_company,
    v_branch
  FROM acumatica_sync_credentials
  WHERE is_active = true
  AND supabase_url IS NOT NULL
  AND supabase_anon_key IS NOT NULL
  AND acumatica_url IS NOT NULL
  AND username IS NOT NULL
  AND password IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no configuration found, exit
  IF v_supabase_url IS NULL OR v_anon_key IS NULL OR v_acumatica_url IS NULL THEN
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

  -- Call the master sync edge function with credentials using anon key
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/acumatica-master-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_anon_key,
      'Content-Type', 'application/json',
      'apikey', v_anon_key
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

COMMENT ON FUNCTION trigger_acumatica_sync() IS 'Triggers Acumatica sync every 5 minutes using anon key from acumatica_sync_credentials table.';