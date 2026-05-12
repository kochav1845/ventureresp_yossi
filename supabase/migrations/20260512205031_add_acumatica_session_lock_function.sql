/*
  # Add Acumatica session acquisition with advisory lock

  1. Problem
    - Multiple edge functions hit Acumatica login simultaneously when cached session expires
    - This exceeds the concurrent API user limit in Acumatica
    - The check-then-create pattern in the session manager has a race condition

  2. Solution
    - Create a database function that uses pg_advisory_xact_lock to serialize session creation
    - Only one caller can acquire a new session at a time
    - Others wait and then get the session that was just created

  3. Function: acquire_acumatica_session
    - Takes no parameters, returns the valid session cookie or NULL
    - Uses advisory lock to prevent concurrent creation attempts
    - Callers check result: if non-null, use it; if null, they need to insert and call again
*/

CREATE OR REPLACE FUNCTION acquire_acumatica_session()
RETURNS TABLE(session_cookie text, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Advisory lock ensures only one concurrent caller proceeds past this point
  PERFORM pg_advisory_xact_lock(hashtext('acumatica_session'));

  -- Now check for valid session (only one caller at a time reaches here)
  RETURN QUERY
  SELECT sc.session_cookie, sc.id
  FROM acumatica_session_cache sc
  WHERE sc.is_valid = true
    AND sc.expires_at > now()
  ORDER BY sc.last_used_at DESC
  LIMIT 1;
END;
$$;

-- Function to register a new session after login
CREATE OR REPLACE FUNCTION register_acumatica_session(
  p_session_cookie text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Advisory lock to prevent duplicate inserts
  PERFORM pg_advisory_xact_lock(hashtext('acumatica_session'));

  -- Invalidate all old sessions first
  UPDATE acumatica_session_cache
  SET is_valid = false
  WHERE is_valid = true
    AND expires_at <= now();

  -- Check if another caller already created a valid session
  SELECT sc.id INTO v_id
  FROM acumatica_session_cache sc
  WHERE sc.is_valid = true
    AND sc.expires_at > now()
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Another session already exists, just return its id
    RETURN v_id;
  END IF;

  -- Insert the new session
  INSERT INTO acumatica_session_cache (session_cookie, expires_at, is_valid)
  VALUES (p_session_cookie, p_expires_at, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;