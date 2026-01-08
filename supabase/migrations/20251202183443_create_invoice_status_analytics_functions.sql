/*
  # Invoice Status Analytics Functions
  
  1. New Functions
    - `get_status_distribution(date)` - Returns count of invoices by color for a specific date
    - `get_status_changes_over_time(start_date, end_date, interval)` - Returns time series of status changes
    - `get_user_status_change_stats(start_date, end_date)` - Returns user activity rankings
  
  2. Purpose
    - Enable pie chart showing current status distribution
    - Enable line chart showing status trends over time
    - Enable user activity leaderboard
*/

-- Function to get current status distribution (for pie chart)
CREATE OR REPLACE FUNCTION get_status_distribution(target_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  color text,
  count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(color_status, 'none') as color,
    COUNT(*) as count
  FROM acumatica_invoices
  WHERE created_at::date <= target_date
  GROUP BY COALESCE(color_status, 'none')
  ORDER BY 
    CASE COALESCE(color_status, 'none')
      WHEN 'red' THEN 1
      WHEN 'orange' THEN 2
      WHEN 'yellow' THEN 3
      WHEN 'green' THEN 4
      ELSE 5
    END;
END;
$$;

-- Function to get status changes over time (for line chart)
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
  -- Set the date format based on interval
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
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'red'), 0) as red_count,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'orange'), 0) as orange_count,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'yellow'), 0) as yellow_count,
    COALESCE(SUM(change_count) FILTER (WHERE new_status = 'green'), 0) as green_count,
    SUM(change_count) as total_changes
  FROM status_by_period
  GROUP BY period_key
  ORDER BY period_key;
END;
$$;

-- Function to get user status change statistics (for user leaderboard)
CREATE OR REPLACE FUNCTION get_user_status_change_stats(
  start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  user_id uuid,
  user_email text,
  total_changes bigint,
  red_changes bigint,
  orange_changes bigint,
  yellow_changes bigint,
  green_changes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    isc.changed_by as user_id,
    isc.changed_by_email as user_email,
    COUNT(*) as total_changes,
    COUNT(*) FILTER (WHERE isc.new_status = 'red') as red_changes,
    COUNT(*) FILTER (WHERE isc.new_status = 'orange') as orange_changes,
    COUNT(*) FILTER (WHERE isc.new_status = 'yellow') as yellow_changes,
    COUNT(*) FILTER (WHERE isc.new_status = 'green') as green_changes
  FROM invoice_status_changes isc
  WHERE isc.changed_at::date BETWEEN start_date AND end_date
    AND isc.new_status IS NOT NULL
  GROUP BY isc.changed_by, isc.changed_by_email
  ORDER BY total_changes DESC;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_status_distribution(date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_status_changes_over_time(date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_status_change_stats(date, date) TO authenticated;