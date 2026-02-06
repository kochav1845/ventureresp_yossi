/*
  # Global Search System

  1. New Indexes
    - GIN trigram indexes on key searchable columns across all major tables
    - Enables fast fuzzy matching and ILIKE prefix searches
  
  2. New Function
    - `global_search(search_query text, max_per_category int)` - Ultra-fast unified search
    - Searches across: invoices, customers, payments, tickets, collectors
    - Returns categorized results with relevance scoring
    - Uses trigram similarity + ILIKE for speed
    - Limited results per category to keep response times under 100ms
  
  3. Performance Notes
    - pg_trgm GIN indexes enable index-backed ILIKE and similarity searches
    - UNION ALL avoids deduplication overhead
    - Early LIMIT per subquery prevents scanning large result sets
*/

-- Trigram indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm 
  ON acumatica_customers USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_id_trgm 
  ON acumatica_customers USING gin (customer_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm 
  ON acumatica_customers USING gin (general_email gin_trgm_ops);

-- Trigram indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_ref_trgm 
  ON acumatica_invoices USING gin (reference_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_name_trgm 
  ON acumatica_invoices USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_order_trgm 
  ON acumatica_invoices USING gin (customer_order_number gin_trgm_ops);

-- Trigram indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_ref_trgm 
  ON acumatica_payments USING gin (reference_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_payments_customer_name_trgm 
  ON acumatica_payments USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_payments_payment_ref_trgm 
  ON acumatica_payments USING gin (payment_ref gin_trgm_ops);

-- Trigram indexes for tickets
CREATE INDEX IF NOT EXISTS idx_tickets_number_trgm 
  ON collection_tickets USING gin (ticket_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_name_trgm 
  ON collection_tickets USING gin (customer_name gin_trgm_ops);

-- Trigram index for user profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_name_trgm 
  ON user_profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_trgm 
  ON user_profiles USING gin (email gin_trgm_ops);

-- Drop existing function if it exists
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
AS $$
DECLARE
  clean_query text;
  like_pattern text;
BEGIN
  clean_query := trim(search_query);
  
  IF length(clean_query) < 2 THEN
    RETURN;
  END IF;
  
  like_pattern := '%' || clean_query || '%';
  
  RETURN QUERY
  
  -- INVOICES
  SELECT * FROM (
    SELECT
      'invoice'::text AS category,
      i.id::text AS item_id,
      i.reference_number AS title,
      i.customer_name AS subtitle,
      COALESCE(i.type, '') || ' | $' || COALESCE(i.amount::text, '0') || ' | Bal: $' || COALESCE(i.balance::text, '0') || ' | ' || COALESCE(i.status, '') AS meta_line,
      '/invoices' AS route,
      GREATEST(
        similarity(COALESCE(i.reference_number, ''), clean_query),
        similarity(COALESCE(i.customer_name, ''), clean_query),
        similarity(COALESCE(i.customer_order_number, ''), clean_query)
      ) AS relevance
    FROM acumatica_invoices i
    WHERE 
      i.reference_number ILIKE like_pattern
      OR i.customer_name ILIKE like_pattern
      OR i.customer ILIKE like_pattern
      OR i.customer_order_number ILIKE like_pattern
      OR i.description ILIKE like_pattern
    ORDER BY 
      CASE WHEN i.reference_number ILIKE clean_query THEN 0
           WHEN i.reference_number ILIKE clean_query || '%' THEN 1
           WHEN i.customer_name ILIKE clean_query || '%' THEN 2
           ELSE 3 END,
      relevance DESC
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
      '/customers' AS route,
      GREATEST(
        similarity(COALESCE(c.customer_name, ''), clean_query),
        similarity(COALESCE(c.customer_id, ''), clean_query),
        similarity(COALESCE(c.general_email, ''), clean_query)
      ) AS relevance
    FROM acumatica_customers c
    WHERE 
      c.customer_name ILIKE like_pattern
      OR c.customer_id ILIKE like_pattern
      OR c.general_email ILIKE like_pattern
      OR c.billing_email ILIKE like_pattern
      OR c.account_name ILIKE like_pattern
    ORDER BY
      CASE WHEN c.customer_name ILIKE clean_query THEN 0
           WHEN c.customer_name ILIKE clean_query || '%' THEN 1
           WHEN c.customer_id ILIKE clean_query || '%' THEN 2
           ELSE 3 END,
      relevance DESC
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
      '/payments' AS route,
      GREATEST(
        similarity(COALESCE(p.reference_number, ''), clean_query),
        similarity(COALESCE(p.customer_name, ''), clean_query),
        similarity(COALESCE(p.payment_ref, ''), clean_query)
      ) AS relevance
    FROM acumatica_payments p
    WHERE 
      p.reference_number ILIKE like_pattern
      OR p.customer_name ILIKE like_pattern
      OR p.customer_id ILIKE like_pattern
      OR p.payment_ref ILIKE like_pattern
      OR p.description ILIKE like_pattern
    ORDER BY
      CASE WHEN p.reference_number ILIKE clean_query THEN 0
           WHEN p.reference_number ILIKE clean_query || '%' THEN 1
           WHEN p.customer_name ILIKE clean_query || '%' THEN 2
           ELSE 3 END,
      relevance DESC
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
      '/tickets' AS route,
      GREATEST(
        similarity(COALESCE(t.ticket_number, ''), clean_query),
        similarity(COALESCE(t.customer_name, ''), clean_query)
      ) AS relevance
    FROM collection_tickets t
    WHERE 
      t.ticket_number ILIKE like_pattern
      OR t.customer_name ILIKE like_pattern
      OR t.customer_id ILIKE like_pattern
      OR t.notes ILIKE like_pattern
    ORDER BY
      CASE WHEN t.ticket_number ILIKE clean_query THEN 0
           WHEN t.ticket_number ILIKE clean_query || '%' THEN 1
           WHEN t.customer_name ILIKE clean_query || '%' THEN 2
           ELSE 3 END,
      relevance DESC
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
      '/admin' AS route,
      GREATEST(
        similarity(COALESCE(u.full_name, ''), clean_query),
        similarity(COALESCE(u.email, ''), clean_query)
      ) AS relevance
    FROM user_profiles u
    WHERE 
      u.full_name ILIKE like_pattern
      OR u.email ILIKE like_pattern
    ORDER BY
      CASE WHEN u.full_name ILIKE clean_query THEN 0
           WHEN u.full_name ILIKE clean_query || '%' THEN 1
           ELSE 2 END,
      relevance DESC
    LIMIT max_per_category
  ) usr;

END;
$$;
