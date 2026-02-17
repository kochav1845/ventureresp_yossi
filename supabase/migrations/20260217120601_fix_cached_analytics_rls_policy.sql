/*
  # Fix Cached Analytics RLS Policy

  1. Changes
    - Update RLS policy to allow all authenticated users to read cached analytics
    - Previously only admins and secretaries could read, but payment analytics should be visible to all users
    - Service role can still manage (insert/update) the cached data

  2. Security
    - All authenticated users can read cached payment analytics
    - Only service role (via edge functions) can insert/update
*/

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins and secretaries can read cached analytics" ON cached_payment_analytics;

-- Create new policy allowing all authenticated users to read
CREATE POLICY "All authenticated users can read cached analytics"
  ON cached_payment_analytics
  FOR SELECT
  TO authenticated
  USING (true);
