/*
  # Add dedup key to email_logs to prevent duplicate sends

  1. Changes
    - Add `dedup_key` column to `email_logs` table
    - Add unique index on `dedup_key` to atomically prevent duplicate email sends
    - The dedup_key is formatted as `{assignment_id}_{YYYY-MM-DD}_{HH:MM}` to prevent
      the same assignment from sending at the same scheduled time twice

  2. Purpose
    - Prevents race condition where two cron invocations both check for recent logs,
      find none, and both proceed to send the same email
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_logs' AND column_name = 'dedup_key'
  ) THEN
    ALTER TABLE email_logs ADD COLUMN dedup_key text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_dedup_key
  ON email_logs (dedup_key)
  WHERE dedup_key IS NOT NULL;
