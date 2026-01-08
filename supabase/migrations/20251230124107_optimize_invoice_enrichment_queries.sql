/*
  # Optimize Invoice Enrichment Queries
  
  1. Purpose
    - Add indexes to speed up invoice memo and status history lookups
    - These queries are used when enriching invoices with user color assignments
    
  2. Changes
    - Add index on invoice_memos(invoice_reference, created_at DESC)
    - Add index on invoice_status_history(invoice_reference, changed_at DESC)
    - Both indexes support efficient IN queries with ORDER BY
    
  3. Performance Impact
    - Reduces query time from seconds to milliseconds
    - Enables fast lookups for up to 1000 invoice references at once
*/

-- Index for fast invoice memo lookups
CREATE INDEX IF NOT EXISTS idx_invoice_memos_reference_created 
  ON invoice_memos (invoice_reference, created_at DESC);

-- Index for fast status history lookups
CREATE INDEX IF NOT EXISTS idx_invoice_status_history_reference_changed 
  ON invoice_status_history (invoice_reference, changed_at DESC);

-- Analyze tables to update query planner statistics
ANALYZE invoice_memos;
ANALYZE invoice_status_history;
