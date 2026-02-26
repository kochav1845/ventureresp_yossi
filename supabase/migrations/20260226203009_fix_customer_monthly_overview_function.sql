/*
  # Fix get_customer_monthly_overview function

  Replaces the existing function that incorrectly uses p_customer_email
  with one that uses p_customer_id (acumatica_customer_id) and returns
  columns matching the frontend interface.

  The function generates a 12-month grid for a given year, left-joining
  with the customer_monthly_tracking table to show status, counts, and notes.
*/

DROP FUNCTION IF EXISTS get_customer_monthly_overview(text, integer);

CREATE OR REPLACE FUNCTION get_customer_monthly_overview(
  p_customer_id text,
  p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
  month integer,
  year integer,
  status text,
  emails_sent_count integer,
  emails_received_count integer,
  attachments_count integer,
  last_email_sent_at timestamptz,
  last_response_at timestamptz,
  postponed_until timestamptz,
  notes text,
  tracking_id uuid
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  )
  SELECT
    m.m::integer AS month,
    p_year AS year,
    COALESCE(t.status, 'pending')::text AS status,
    COALESCE(t.emails_sent_count, 0)::integer AS emails_sent_count,
    COALESCE(t.emails_received_count, 0)::integer AS emails_received_count,
    COALESCE(t.attachments_count, 0)::integer AS attachments_count,
    t.last_email_sent_at,
    t.last_response_at,
    t.postponed_until,
    t.notes,
    t.id AS tracking_id
  FROM months m
  LEFT JOIN customer_monthly_tracking t
    ON t.acumatica_customer_id = p_customer_id
    AND t.month = m.m
    AND t.year = p_year
  ORDER BY m.m;
END;
$$ LANGUAGE plpgsql;
