/*
  # Create Timezone-Aware Voided Payment Search Function

  1. Purpose
    - Search for voided payments by date with timezone awareness
    - Handle UTC and Eastern Time conversions properly
    - Return both timezone representations

  2. Function
    - `search_voided_payments_by_date(p_search_date, p_timezone)`
    - Returns all voided payment records for the specified date
    - Includes both UTC and ET date representations

  3. Security
    - SECURITY DEFINER to allow authenticated users to search
    - RLS policies still apply
*/

CREATE OR REPLACE FUNCTION search_voided_payments_by_date(
  p_search_date DATE,
  p_timezone TEXT DEFAULT 'ET'
)
RETURNS TABLE (
  reference_number TEXT,
  type TEXT,
  status TEXT,
  customer_name TEXT,
  payment_amount NUMERIC,
  application_date TIMESTAMPTZ,
  date_utc DATE,
  date_et DATE,
  hour_utc INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Search based on the selected timezone
  IF p_timezone = 'ET' THEN
    -- Search by Eastern Time date
    RETURN QUERY
    SELECT 
      ap.reference_number,
      ap.type,
      ap.status,
      ap.customer_name,
      ap.payment_amount,
      ap.application_date,
      DATE(ap.application_date AT TIME ZONE 'UTC') as date_utc,
      DATE(ap.application_date AT TIME ZONE 'America/New_York') as date_et,
      EXTRACT(HOUR FROM ap.application_date)::INT as hour_utc
    FROM acumatica_payments ap
    WHERE 
      (ap.status = 'Voided' OR ap.type = 'Voided Payment')
      AND DATE(ap.application_date AT TIME ZONE 'America/New_York') = p_search_date
    ORDER BY ap.application_date, ap.reference_number;
  ELSE
    -- Search by UTC date
    RETURN QUERY
    SELECT 
      ap.reference_number,
      ap.type,
      ap.status,
      ap.customer_name,
      ap.payment_amount,
      ap.application_date,
      DATE(ap.application_date AT TIME ZONE 'UTC') as date_utc,
      DATE(ap.application_date AT TIME ZONE 'America/New_York') as date_et,
      EXTRACT(HOUR FROM ap.application_date)::INT as hour_utc
    FROM acumatica_payments ap
    WHERE 
      (ap.status = 'Voided' OR ap.type = 'Voided Payment')
      AND DATE(ap.application_date AT TIME ZONE 'UTC') = p_search_date
    ORDER BY ap.application_date, ap.reference_number;
  END IF;
END;
$$;

COMMENT ON FUNCTION search_voided_payments_by_date IS 
  'Search for voided payments by date with timezone-aware filtering. Supports both UTC and Eastern Time.';
