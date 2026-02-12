/*
  # Add Sync Logs Cleanup Function

  1. Problem
    - sync_change_logs table has 3.6 million rows (1.6GB)
    - Need gradual cleanup that won't timeout
    
  2. Solution
    - Create function to delete old logs in small batches
    - Schedule daily cleanup cron job
    - Keep last 30 days of logs only
    
  3. Performance
    - Processes in small 10,000 row batches
    - Stops after 5 batches to avoid long-running transactions
    - Runs daily to gradually reduce table size
*/

-- Create function to clean up old logs in batches
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS TABLE(deleted_count bigint, batches_processed int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted bigint := 0;
  v_total bigint := 0;
  v_batch_size int := 10000;
  v_batches int := 0;
  v_max_batches int := 5; -- Process max 5 batches per run (50k rows)
BEGIN
  -- Delete in small batches to avoid timeouts
  LOOP
    DELETE FROM sync_change_logs
    WHERE id IN (
      SELECT id 
      FROM sync_change_logs 
      WHERE created_at < now() - interval '30 days'
      LIMIT v_batch_size
    );
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
    v_batches := v_batches + 1;
    
    -- Exit if no more rows to delete or hit batch limit
    EXIT WHEN v_deleted = 0 OR v_batches >= v_max_batches;
    
    -- Small delay between batches
    PERFORM pg_sleep(0.1);
  END LOOP;
  
  RETURN QUERY SELECT v_total, v_batches;
END;
$$;

-- Schedule daily cleanup at 2 AM
DO $$
BEGIN
  -- Try to unschedule if it exists
  PERFORM cron.unschedule('cleanup-old-sync-logs');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-old-sync-logs',
  '0 2 * * *', -- Every day at 2 AM
  $$SELECT cleanup_old_sync_logs()$$
);
