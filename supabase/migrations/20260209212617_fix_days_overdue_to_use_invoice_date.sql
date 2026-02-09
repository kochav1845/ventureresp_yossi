/*
  # Fix Days Overdue to Calculate from Invoice Date

  1. Issue
    - Days overdue is currently calculated from `due_date`
    - Should be calculated from invoice `date` (invoice creation date)

  2. Changes
    - Update `get_customer_invoices_advanced` to calculate days from invoice date
    - Update `get_customer_invoice_stats` to calculate days from invoice date

  3. Calculation
    - Days Overdue = Current Date - Invoice Date (not Due Date)
*/

-- Fix get_customer_invoices_advanced function
CREATE OR REPLACE FUNCTION get_customer_invoices_advanced(
  p_customer_id TEXT,
  p_filter TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_amount_min NUMERIC DEFAULT NULL,
  p_amount_max NUMERIC DEFAULT NULL,
  p_color_status TEXT DEFAULT NULL,
  p_invoice_status TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'date',
  p_sort_order TEXT DEFAULT 'desc',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  reference_number TEXT,
  date DATE,
  due_date DATE,
  status TEXT,
  amount NUMERIC,
  balance NUMERIC,
  description TEXT,
  color_status TEXT,
  days_overdue INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.reference_number,
    i.date,
    i.due_date,
    i.status,
    i.amount,
    i.balance,
    i.description,
    i.color_status,
    CASE 
      WHEN i.date IS NOT NULL AND i.balance > 0 
      THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
      ELSE 0
    END AS days_overdue
  FROM acumatica_invoices i
  WHERE
    i.customer = p_customer_id
    AND (
      p_filter = 'all' OR
      (p_filter = 'open' AND i.balance > 0) OR
      (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided')
    )
    AND (p_date_from IS NULL OR i.date >= p_date_from)
    AND (p_date_to IS NULL OR i.date <= p_date_to)
    AND (p_amount_min IS NULL OR i.amount >= p_amount_min)
    AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
    AND (p_color_status IS NULL OR p_color_status = '' OR i.color_status = p_color_status)
    AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status)
  ORDER BY
    CASE WHEN p_sort_by = 'date' AND p_sort_order = 'desc' THEN i.date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'date' AND p_sort_order = 'asc' THEN i.date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'desc' THEN i.due_date END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'due_date' AND p_sort_order = 'asc' THEN i.due_date END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'desc' THEN i.reference_number END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'reference_number' AND p_sort_order = 'asc' THEN i.reference_number END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'desc' THEN i.amount END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'amount' AND p_sort_order = 'asc' THEN i.amount END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN i.balance END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN i.balance END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'desc' THEN GREATEST(0, (CURRENT_DATE - i.date)::INT) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'asc' THEN GREATEST(0, (CURRENT_DATE - i.date)::INT) END ASC NULLS LAST,
    i.date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Fix get_customer_invoice_stats function
CREATE OR REPLACE FUNCTION get_customer_invoice_stats(
  p_customer_id TEXT
)
RETURNS TABLE (
  highest_invoice_amount NUMERIC,
  highest_invoice_ref TEXT,
  lowest_invoice_amount NUMERIC,
  lowest_invoice_ref TEXT,
  avg_invoice_amount NUMERIC,
  oldest_unpaid_date DATE,
  oldest_unpaid_ref TEXT,
  newest_unpaid_date DATE,
  newest_unpaid_ref TEXT,
  most_overdue_days INT,
  most_overdue_ref TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH invoice_data AS (
    SELECT 
      i.reference_number,
      i.amount,
      i.date,
      i.due_date,
      i.balance,
      CASE 
        WHEN i.date IS NOT NULL AND i.balance > 0 
        THEN GREATEST(0, (CURRENT_DATE - i.date)::INT)
        ELSE 0
      END AS overdue_days
    FROM acumatica_invoices i
    WHERE i.customer = p_customer_id
  ),
  highest AS (
    SELECT reference_number, amount FROM invoice_data ORDER BY amount DESC NULLS LAST LIMIT 1
  ),
  lowest AS (
    SELECT reference_number, amount FROM invoice_data WHERE amount > 0 ORDER BY amount ASC NULLS LAST LIMIT 1
  ),
  oldest_unpaid AS (
    SELECT reference_number, date FROM invoice_data WHERE balance > 0 ORDER BY date ASC NULLS LAST LIMIT 1
  ),
  newest_unpaid AS (
    SELECT reference_number, date FROM invoice_data WHERE balance > 0 ORDER BY date DESC NULLS LAST LIMIT 1
  ),
  most_overdue AS (
    SELECT reference_number, overdue_days FROM invoice_data WHERE balance > 0 ORDER BY overdue_days DESC NULLS LAST LIMIT 1
  )
  SELECT
    (SELECT amount FROM highest) AS highest_invoice_amount,
    (SELECT reference_number FROM highest) AS highest_invoice_ref,
    (SELECT amount FROM lowest) AS lowest_invoice_amount,
    (SELECT reference_number FROM lowest) AS lowest_invoice_ref,
    (SELECT AVG(amount)::NUMERIC FROM invoice_data) AS avg_invoice_amount,
    (SELECT date FROM oldest_unpaid) AS oldest_unpaid_date,
    (SELECT reference_number FROM oldest_unpaid) AS oldest_unpaid_ref,
    (SELECT date FROM newest_unpaid) AS newest_unpaid_date,
    (SELECT reference_number FROM newest_unpaid) AS newest_unpaid_ref,
    (SELECT overdue_days FROM most_overdue) AS most_overdue_days,
    (SELECT reference_number FROM most_overdue) AS most_overdue_ref;
END;
$$;
