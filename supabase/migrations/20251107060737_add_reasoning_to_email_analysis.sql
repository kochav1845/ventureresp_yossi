/*
  # Add GPT Reasoning to Email Analysis

  1. Changes
    - Add `reasoning` column to `email_analysis` table to store GPT-4's explanation
  
  2. Notes
    - This allows admins to see why GPT classified an email a certain way
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_analysis' AND column_name = 'reasoning'
  ) THEN
    ALTER TABLE email_analysis ADD COLUMN reasoning text;
  END IF;
END $$;