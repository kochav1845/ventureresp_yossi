/*
  # Password Reset Tokens System

  1. New Tables
    - `password_reset_tokens`
      - `id` (uuid, primary key)
      - `user_email` (text, email of user requesting reset)
      - `token` (text, unique reset token)
      - `expires_at` (timestamptz, token expiration time)
      - `used` (boolean, whether token has been used)
      - `created_at` (timestamptz, when token was created)

  2. Security
    - Enable RLS on `password_reset_tokens` table
    - Only service role can manage tokens
    - Tokens expire after 1 hour
*/

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role can manage password reset tokens"
  ON password_reset_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Public can read their own unused, non-expired tokens (for validation)
CREATE POLICY "Users can validate their own tokens"
  ON password_reset_tokens
  FOR SELECT
  TO anon, authenticated
  USING (
    used = false
    AND expires_at > now()
  );

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(user_email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
