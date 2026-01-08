/*
  # Optimize Status Distribution Function

  1. Performance Issues Fixed
    - Removed slow `created_at::date` conversion that prevents index usage
    - Added index on created_at for date filtering
    - Simplified query to use timestamp comparison
    - For "current" distribution, removed date filter entirely (uses current state)

  2. Changes
    - Add index on `created_at` column
    - Rewrite function to use efficient timestamp comparison
    - Make default behavior return current distribution without date filtering
*/

-- Add index on created_at if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'acumatica_invoices' 
    AND indexname = 'idx_acumatica_invoices_created_at'
  ) THEN
    CREATE INDEX idx_acumatica_invoices_created_at 
    ON acumatica_invoices(created_at);
  END IF;
END $$;

-- Optimized function - much faster for current distribution
CREATE OR REPLACE FUNCTION get_status_distribution(target_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  color text,
  count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If checking for "today" or future date, just return current distribution
  -- This is the most common use case and avoids the expensive date filter
  IF target_date >= CURRENT_DATE THEN
    RETURN QUERY
    SELECT 
      COALESCE(color_status, 'none') as color,
      COUNT(*) as count
    FROM acumatica_invoices
    GROUP BY COALESCE(color_status, 'none')
    ORDER BY 
      CASE COALESCE(color_status, 'none')
        WHEN 'red' THEN 1
        WHEN 'orange' THEN 2
        WHEN 'yellow' THEN 3
        WHEN 'green' THEN 4
        ELSE 5
      END;
  ELSE
    -- For historical dates, use timestamp comparison (more efficient than date cast)
    RETURN QUERY
    SELECT 
      COALESCE(color_status, 'none') as color,
      COUNT(*) as count
    FROM acumatica_invoices
    WHERE created_at < (target_date + 1)::timestamp
    GROUP BY COALESCE(color_status, 'none')
    ORDER BY 
      CASE COALESCE(color_status, 'none')
        WHEN 'red' THEN 1
        WHEN 'orange' THEN 2
        WHEN 'yellow' THEN 3
        WHEN 'green' THEN 4
        ELSE 5
      END;
  END IF;
END;
$$;

-- Verify the function works
COMMENT ON FUNCTION get_status_distribution IS 'Returns invoice count by color status. Optimized for current date queries by skipping date filter entirely.';
