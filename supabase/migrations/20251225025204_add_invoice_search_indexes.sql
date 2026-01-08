/*
  # Add Search Indexes for Invoice Table
  
  1. Performance Improvements
    - Add pg_trgm extension for fast text pattern matching
    - Add GIN indexes on frequently searched text columns
    - Add B-tree indexes on commonly filtered columns
    
  2. Indexed Columns
    - reference_number (GIN trigram index for ILIKE searches)
    - customer (GIN trigram index for ILIKE searches)
    - customer_name (GIN trigram index for ILIKE searches)
    - customer_order (GIN trigram index for ILIKE searches)
    - description (GIN trigram index for ILIKE searches)
    - type (GIN trigram index for ILIKE searches)
    - status (B-tree for exact matches)
    - date (B-tree for range queries and sorting)
    - color_status (B-tree for filtering)
    
  This will dramatically improve search performance and prevent timeout errors.
*/

-- Enable pg_trgm extension for trigram text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes for fast ILIKE pattern matching
CREATE INDEX IF NOT EXISTS idx_invoices_reference_number_trgm 
  ON acumatica_invoices USING gin (reference_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_trgm 
  ON acumatica_invoices USING gin (customer gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_name_trgm 
  ON acumatica_invoices USING gin (customer_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_order_trgm 
  ON acumatica_invoices USING gin (customer_order gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_description_trgm 
  ON acumatica_invoices USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_type_trgm 
  ON acumatica_invoices USING gin (type gin_trgm_ops);

-- Create B-tree indexes for exact matches and filtering
CREATE INDEX IF NOT EXISTS idx_invoices_status 
  ON acumatica_invoices (status);

CREATE INDEX IF NOT EXISTS idx_invoices_date 
  ON acumatica_invoices (date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_color_status 
  ON acumatica_invoices (color_status) 
  WHERE color_status IS NOT NULL;

-- Create composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status_date 
  ON acumatica_invoices (customer, status, date DESC);

-- Analyze table to update statistics
ANALYZE acumatica_invoices;