/*
  # Create Async Sync Jobs Table

  1. New Tables
    - `async_sync_jobs`
      - `id` (uuid, primary key)
      - `entity_type` (text) - customer, invoice, or payment
      - `start_date` (timestamptz) - date range start
      - `end_date` (timestamptz) - date range end
      - `status` (text) - pending, running, completed, failed
      - `progress` (jsonb) - tracks created, updated, total, errors
      - `error_message` (text) - error details if failed
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `created_at` (timestamptz)
      - `created_by` (uuid) - user who triggered the job

  2. Security
    - Enable RLS
    - Allow authenticated users to read their own jobs
    - Allow authenticated users to create new jobs
    - Only service role can update job status
*/

-- Create async_sync_jobs table
CREATE TABLE IF NOT EXISTS async_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'invoice', 'payment')),
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress jsonb DEFAULT '{"created": 0, "updated": 0, "total": 0, "errors": []}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE async_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own sync jobs"
  ON async_sync_jobs
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() OR auth.jwt()->>'role' = 'admin');

CREATE POLICY "Users can create sync jobs"
  ON async_sync_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Service role can update sync jobs"
  ON async_sync_jobs
  FOR UPDATE
  TO service_role
  USING (true);

-- Create index for efficient lookups
CREATE INDEX idx_async_sync_jobs_status ON async_sync_jobs(status);
CREATE INDEX idx_async_sync_jobs_created_by ON async_sync_jobs(created_by);
CREATE INDEX idx_async_sync_jobs_created_at ON async_sync_jobs(created_at DESC);
