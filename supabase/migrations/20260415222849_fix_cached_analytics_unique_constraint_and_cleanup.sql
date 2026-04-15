/*
  # Fix cached_payment_analytics unique constraint and clean up duplicates

  1. Changes
    - Drop the old unique constraint that doesn't handle NULLs properly
    - Create a new unique index using COALESCE to treat NULLs as 0
    - Delete all duplicate rows keeping only the most recent one per period

  2. Why
    - PostgreSQL unique indexes treat NULL != NULL, so rows with day=NULL or month=NULL
      were never caught as duplicates, causing upserts to insert new rows every time
    - This caused March 2025 to have 5 different cached rows with different counts
    - The UI was picking up a stale/wrong row showing 592 instead of the correct count

  3. Security
    - No RLS changes needed (table already has RLS enabled)
*/

-- Step 1: Delete all duplicate rows, keeping only the most recent per period
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0)
      ORDER BY calculated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM cached_payment_analytics
)
DELETE FROM cached_payment_analytics
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Drop the old constraint
ALTER TABLE cached_payment_analytics DROP CONSTRAINT IF EXISTS unique_period_constraint;

-- Step 3: Create a new unique index that handles NULLs via COALESCE
CREATE UNIQUE INDEX unique_period_constraint
  ON cached_payment_analytics (period_type, COALESCE(year, 0), COALESCE(month, 0), COALESCE(day, 0));
