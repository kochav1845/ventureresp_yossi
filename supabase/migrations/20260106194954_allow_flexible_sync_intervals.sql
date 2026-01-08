/*
  # Allow Flexible Sync Intervals

  1. Changes
    - Remove the 5-minute minimum constraint on sync_interval_minutes
    - Add a new constraint allowing intervals of 1 minute or more
    - This gives admins flexibility while still preventing sub-minute syncs

  2. Purpose
    - Allow administrators to adjust sync frequency based on their needs
    - Maintain a reasonable minimum to prevent API overload
    - Balance between data freshness and API rate limits

  3. Important Notes
    - Setting very low sync intervals may hit Acumatica concurrent login limits
    - Recommended minimum: 2-5 minutes for production use
    - Use 1 minute intervals only for testing or low-traffic scenarios
*/

-- Drop the existing constraint requiring 5 minutes minimum
ALTER TABLE sync_status
DROP CONSTRAINT IF EXISTS sync_interval_minimum;

-- Add a new constraint allowing 1 minute or more
ALTER TABLE sync_status
ADD CONSTRAINT sync_interval_minimum CHECK (sync_interval_minutes >= 1);

-- Add a helpful comment
COMMENT ON COLUMN sync_status.sync_interval_minutes IS 
  'Sync interval in minutes (minimum: 1). Recommended: 2-5 minutes for production to avoid API rate limits.';
