/*
  # Fix Sync Stuck Running State Recovery

  1. Modified Functions
    - `trigger_acumatica_sync` - Added automatic recovery for stuck "running" states
      - If a sync has been in "running" state for more than 30 minutes, it is automatically
        reset to "idle" so the next sync cycle can proceed
      - Prevents the sync from being permanently stuck if an edge function crashes

  2. Important Notes
    - This fixes the issue where all syncs stopped on Feb 20 because status got stuck at "running"
    - The 30-minute timeout is a safety net; normal syncs complete in under 5 minutes
*/

CREATE OR REPLACE FUNCTION trigger_acumatica_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_unstuck_count int;
BEGIN
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

  IF v_supabase_url IS NULL OR v_anon_key IS NULL OR v_acumatica_url IS NULL THEN
    RAISE NOTICE 'No complete configuration found in credentials table';
    RETURN;
  END IF;

  UPDATE sync_status
  SET 
    status = 'idle',
    last_error = 'Auto-recovered from stuck running state after 30 minutes',
    updated_at = NOW()
  WHERE status = 'running'
    AND updated_at < NOW() - INTERVAL '30 minutes';

  GET DIAGNOSTICS v_unstuck_count = ROW_COUNT;
  IF v_unstuck_count > 0 THEN
    RAISE NOTICE 'Auto-recovered % stuck sync(s)', v_unstuck_count;
  END IF;

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

  v_request_body := jsonb_build_object(
    'acumaticaUrl', v_acumatica_url,
    'username', v_username,
    'password', v_password,
    'company', COALESCE(v_company, ''),
    'branch', COALESCE(v_branch, '')
  );

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
    UPDATE sync_status
    SET 
      status = 'failed',
      last_error = SQLERRM,
      updated_at = NOW()
    WHERE status = 'running';

    RAISE NOTICE 'Sync failed: %', SQLERRM;
END;
$$;