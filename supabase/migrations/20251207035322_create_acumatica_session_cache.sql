/*
  # Create Acumatica Session Cache

  1. New Table
    - `acumatica_session_cache`
      - `id` (uuid, primary key)
      - `session_cookie` (text) - The session cookie from Acumatica
      - `expires_at` (timestamptz) - When the session expires
      - `created_at` (timestamptz) - When the session was created
      - `last_used_at` (timestamptz) - Last time this session was used
      - `is_valid` (boolean) - Whether the session is still valid

  2. Security
    - Enable RLS
    - Service role can read/write (edge functions use service role key)

  3. Purpose
    - Store Acumatica login session cookies to reuse across multiple API calls
    - Prevents rate limiting by avoiding login on every request
    - Sessions expire after 30 minutes of inactivity or explicit expiration
*/

CREATE TABLE IF NOT EXISTS acumatica_session_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_cookie text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  is_valid boolean DEFAULT true
);

ALTER TABLE acumatica_session_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage sessions"
  ON acumatica_session_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_session_valid_expires 
  ON acumatica_session_cache(is_valid, expires_at DESC) 
  WHERE is_valid = true;
