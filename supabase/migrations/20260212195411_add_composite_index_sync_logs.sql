/*
  # Add Composite Index to Sync Change Logs

  1. Performance Optimization
    - Add composite index on (sync_type, created_at DESC)
    - This optimizes the common query pattern: filter by sync_type + order by created_at
    - Prevents timeout on queries like: `?sync_type=eq.payment&order=created_at.desc&limit=5`

  2. Why This Helps
    - Single column indexes on sync_type and created_at separately require multiple lookups
    - Composite index allows PostgreSQL to efficiently filter and sort in one pass
    - Dramatically improves performance for filtered, time-ordered queries
*/

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_sync_logs_type_created ON sync_change_logs(sync_type, created_at DESC);

-- Add composite index for sync_source filtering with time ordering
CREATE INDEX IF NOT EXISTS idx_sync_logs_source_created ON sync_change_logs(sync_source, created_at DESC);
