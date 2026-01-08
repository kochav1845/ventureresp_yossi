/*
  # Fix Type Mismatch in get_status_changes_over_time Function
  
  1. Problem
    - The function returns SUM() results which are `numeric` type
    - But the return type declaration expects `bigint`
    - This causes error: "structure of query does not match function result type"
  
  2. Solution
    - Cast all SUM() results to `bigint` to match the declared return type
    - This ensures type consistency between the query results and function signature
*/

CREATE OR REPLACE FUNCTION get_status_changes_over_time(
  start_date date,
  end_date date,
  time_interval text DEFAULT 'day'
)
RETURNS TABLE (
  period text,
  red_count bigint,
  orange_count bigint,
  yellow_count bigint,
  green_count bigint,
  total_changes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  interval_format text;
BEGIN
  interval_format := CASE time_interval
    WHEN 'day' THEN 'YYYY-MM-DD'
    WHEN 'week' THEN 'IYYY-"W"IW'
    WHEN 'month' THEN 'YYYY-MM'
    ELSE 'YYYY-MM-DD'
  END;

  RETURN QUERY
  WITH status_by_period AS (
    SELECT 
      TO_CHAR(changed_at, interval_format) as period_key,
      new_status,
      COUNT(*) as change_count
    FROM invoice_status_changes
    WHERE changed_at::date BETWEEN start_date AND end_date
      AND new_status IS NOT NULL
    GROUP BY TO_CHAR(changed_at, interval_format), new_status
  )
  SELECT 
    period_key as period,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'red'), 0)::bigint as red_count,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'orange'), 0)::bigint as orange_count,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'yellow'), 0)::bigint as yellow_count,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'green'), 0)::bigint as green_count,
    SUM(change_count)::bigint as total_changes
  FROM status_by_period
  GROUP BY period_key
  ORDER BY period_key;
END;
$$;

GRANT EXECUTE ON FUNCTION get_status_changes_over_time(date, date, text) TO authenticated;