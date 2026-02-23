/*
  # Add Balanced (Draft) Invoice Filter

  1. Purpose
    - Add a 'balanced' filter to invoice query functions
    - Allows viewing draft/unposted invoices (status: Balanced, On Hold, Scheduled)
    - These are invoices that have a balance but are not yet released in Acumatica

  2. Changes
    - `get_customer_invoices_advanced` - add 'balanced' filter option
    - `get_customer_invoices_advanced_count` - add 'balanced' filter option
    - `get_customer_invoices_count` - add balanced_count to return value (requires drop + recreate)
*/

-- Fix get_customer_invoices_advanced with balanced filter
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
      WHEN i.due_date IS NOT NULL AND i.balance > 0 
      THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
      ELSE 0
    END AS days_overdue
  FROM acumatica_invoices i
  WHERE
    i.customer = p_customer_id
    AND (
      p_filter = 'all' OR
      (p_filter = 'open' AND i.balance > 0 AND i.status = 'Open') OR
      (p_filter = 'balanced' AND i.balance > 0 AND i.status != 'Open') OR
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
    CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'desc' THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'days_overdue' AND p_sort_order = 'asc' THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT) END ASC NULLS LAST,
    i.date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Fix get_customer_invoices_advanced_count with balanced filter
CREATE OR REPLACE FUNCTION get_customer_invoices_advanced_count(
  p_customer_id TEXT,
  p_filter TEXT DEFAULT 'all',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_amount_min NUMERIC DEFAULT NULL,
  p_amount_max NUMERIC DEFAULT NULL,
  p_color_status TEXT DEFAULT NULL,
  p_invoice_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  total_amount NUMERIC,
  total_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_count,
    COALESCE(SUM(i.amount), 0)::NUMERIC AS total_amount,
    COALESCE(SUM(i.balance), 0)::NUMERIC AS total_balance
  FROM acumatica_invoices i
  WHERE
    i.customer = p_customer_id
    AND (
      p_filter = 'all' OR
      (p_filter = 'open' AND i.balance > 0 AND i.status = 'Open') OR
      (p_filter = 'balanced' AND i.balance > 0 AND i.status != 'Open') OR
      (p_filter = 'paid' AND i.balance = 0 AND i.status != 'Voided')
    )
    AND (p_date_from IS NULL OR i.date >= p_date_from)
    AND (p_date_to IS NULL OR i.date <= p_date_to)
    AND (p_amount_min IS NULL OR i.amount >= p_amount_min)
    AND (p_amount_max IS NULL OR i.amount <= p_amount_max)
    AND (p_color_status IS NULL OR p_color_status = '' OR i.color_status = p_color_status)
    AND (p_invoice_status IS NULL OR p_invoice_status = '' OR i.status = p_invoice_status);
END;
$$;

-- Drop and recreate get_customer_invoices_count with balanced_count
DROP FUNCTION IF EXISTS get_customer_invoices_count(text, text);

CREATE OR REPLACE FUNCTION get_customer_invoices_count(
  p_customer_id text,
  p_filter text DEFAULT 'all'
)
RETURNS TABLE (
  total_count bigint,
  open_count bigint,
  paid_count bigint,
  balanced_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_count,
    COUNT(*) FILTER (WHERE balance > 0 AND status = 'Open')::bigint as open_count,
    COUNT(*) FILTER (WHERE balance = 0 AND status != 'Voided')::bigint as paid_count,
    COUNT(*) FILTER (WHERE balance > 0 AND status != 'Open')::bigint as balanced_count
  FROM acumatica_invoices
  WHERE customer = p_customer_id;
END;
$$;
