/*
  # Create interest_requests table

  1. New Tables
    - `interest_requests`
      - `id` (uuid, primary key)
      - `name` (text) - requester's full name
      - `email` (text) - requester's email
      - `company` (text) - company name
      - `message` (text, nullable) - optional message
      - `status` (text) - pending/approved/declined
      - `reviewed_by` (uuid, nullable) - who reviewed it
      - `reviewed_at` (timestamptz, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Anyone (anon) can insert a request
    - Only super admins can read/update requests
*/

CREATE TABLE IF NOT EXISTS interest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES user_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE interest_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit interest requests"
  ON interest_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Super admins can view interest requests"
  ON interest_requests FOR SELECT
  TO authenticated
  USING (
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Super admins can update interest requests"
  ON interest_requests FOR UPDATE
  TO authenticated
  USING (
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid())
  );
