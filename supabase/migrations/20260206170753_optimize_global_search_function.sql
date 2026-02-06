/*
  # Optimize Global Search Function

  1. Changes
    - Rewrites `global_search` to eliminate expensive `similarity()` calls
    - Removes slow `description ILIKE` searches on large text columns
    - Uses simple CASE-based relevance scoring instead of trigram similarity
    - Adds 5-second statement timeout to prevent runaway queries
    - Keeps indexed column searches (reference_number, customer_name, etc.)

  2. Performance Notes
    - similarity() was being computed for every matching row across 5 tables - very expensive
    - Leading wildcard ILIKE on description columns bypasses indexes
    - New approach uses only indexed columns with CASE-based relevance (no function calls)
    - Statement timeout prevents blocking if data volume grows
*/

DROP FUNCTION IF EXISTS global_search(text, integer);

CREATE OR REPLACE FUNCTION global_search(
  search_query text,
  max_per_category integer DEFAULT 6
)
RETURNS TABLE (
  category text,
  item_id text,
  title text,
  subtitle text,
  meta_line text,
  route text,
  relevance real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  clean_query text;
  like_pattern text;
  prefix_pattern text;
BEGIN
  clean_query := trim(search_query);

  IF length(clean_query) < 2 THEN
    RETURN;
  END IF;

  like_pattern := '%' || clean_query || '%';
  prefix_pattern := clean_query || '%';

  RETURN QUERY

  -- INVOICES
  SELECT * FROM (
    SELECT
      'invoice'::text AS category,
      i.id::text AS item_id,
      i.reference_number AS title,
      i.customer_name AS subtitle,
      COALESCE(i.type, '') || ' | $' || COALESCE(i.amount::text, '0') || ' | Bal: $' || COALESCE(i.balance::text, '0') || ' | ' || COALESCE(i.status, '') AS meta_line,
      '/invoices'::text AS route,
      CASE
        WHEN i.reference_number ILIKE clean_query THEN 1.0
        WHEN i.reference_number ILIKE prefix_pattern THEN 0.9
        WHEN i.customer_name ILIKE prefix_pattern THEN 0.8
        WHEN i.customer_order_number ILIKE prefix_pattern THEN 0.7
        ELSE 0.5
      END::real AS relevance
    FROM acumatica_invoices i
    WHERE
      i.reference_number ILIKE like_pattern
      OR i.customer_name ILIKE like_pattern
      OR i.customer ILIKE like_pattern
      OR i.customer_order_number ILIKE like_pattern
    ORDER BY relevance DESC
    LIMIT max_per_category
  ) inv

  UNION ALL

  -- CUSTOMERS
  SELECT * FROM (
    SELECT
      'customer'::text AS category,
      c.id::text AS item_id,
      c.customer_name AS title,
      c.customer_id AS subtitle,
      COALESCE(c.customer_class, '') || ' | ' || COALESCE(c.general_email, '') || ' | Bal: $' || COALESCE(c.balance::text, '0') AS meta_line,
      '/customers'::text AS route,
      CASE
        WHEN c.customer_name ILIKE clean_query THEN 1.0
        WHEN c.customer_name ILIKE prefix_pattern THEN 0.9
        WHEN c.customer_id ILIKE prefix_pattern THEN 0.85
        WHEN c.general_email ILIKE prefix_pattern THEN 0.7
        ELSE 0.5
      END::real AS relevance
    FROM acumatica_customers c
    WHERE
      c.customer_name ILIKE like_pattern
      OR c.customer_id ILIKE like_pattern
      OR c.general_email ILIKE like_pattern
      OR c.billing_email ILIKE like_pattern
    ORDER BY relevance DESC
    LIMIT max_per_category
  ) cust

  UNION ALL

  -- PAYMENTS
  SELECT * FROM (
    SELECT
      'payment'::text AS category,
      p.id::text AS item_id,
      p.reference_number AS title,
      COALESCE(p.customer_name, p.customer_id) AS subtitle,
      COALESCE(p.type, '') || ' | $' || COALESCE(p.payment_amount::text, '0') || ' | ' || COALESCE(p.payment_method, '') || ' | ' || COALESCE(p.status, '') AS meta_line,
      '/payments'::text AS route,
      CASE
        WHEN p.reference_number ILIKE clean_query THEN 1.0
        WHEN p.reference_number ILIKE prefix_pattern THEN 0.9
        WHEN p.customer_name ILIKE prefix_pattern THEN 0.8
        WHEN p.payment_ref ILIKE prefix_pattern THEN 0.7
        ELSE 0.5
      END::real AS relevance
    FROM acumatica_payments p
    WHERE
      p.reference_number ILIKE like_pattern
      OR p.customer_name ILIKE like_pattern
      OR p.customer_id ILIKE like_pattern
      OR p.payment_ref ILIKE like_pattern
    ORDER BY relevance DESC
    LIMIT max_per_category
  ) pay

  UNION ALL

  -- TICKETS
  SELECT * FROM (
    SELECT
      'ticket'::text AS category,
      t.id::text AS item_id,
      t.ticket_number AS title,
      t.customer_name AS subtitle,
      COALESCE(t.ticket_type, '') || ' | ' || COALESCE(t.priority, '') || ' | ' || COALESCE(t.status, '') AS meta_line,
      '/tickets'::text AS route,
      CASE
        WHEN t.ticket_number ILIKE clean_query THEN 1.0
        WHEN t.ticket_number ILIKE prefix_pattern THEN 0.9
        WHEN t.customer_name ILIKE prefix_pattern THEN 0.8
        ELSE 0.5
      END::real AS relevance
    FROM collection_tickets t
    WHERE
      t.ticket_number ILIKE like_pattern
      OR t.customer_name ILIKE like_pattern
      OR t.customer_id ILIKE like_pattern
    ORDER BY relevance DESC
    LIMIT max_per_category
  ) tix

  UNION ALL

  -- COLLECTORS / USERS
  SELECT * FROM (
    SELECT
      'collector'::text AS category,
      u.id::text AS item_id,
      u.full_name AS title,
      u.email AS subtitle,
      COALESCE(u.role, '') || ' | ' || COALESCE(u.account_status, '') AS meta_line,
      '/admin'::text AS route,
      CASE
        WHEN u.full_name ILIKE clean_query THEN 1.0
        WHEN u.full_name ILIKE prefix_pattern THEN 0.9
        WHEN u.email ILIKE prefix_pattern THEN 0.8
        ELSE 0.5
      END::real AS relevance
    FROM user_profiles u
    WHERE
      u.full_name ILIKE like_pattern
      OR u.email ILIKE like_pattern
    ORDER BY relevance DESC
    LIMIT max_per_category
  ) usr;

END;
$$;
