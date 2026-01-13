/*
  # Optimize Invoice Search Performance with Trigram Indexes

  ## Problem
  The search_invoices_paginated function was timing out because ILIKE '%pattern%'
  searches were forcing full table scans on the acumatica_invoices table.

  ## Solution
  1. Enable pg_trgm extension for trigram matching
  2. Create GIN indexes using trigram operators on searchable text columns
  3. These indexes allow PostgreSQL to efficiently search with ILIKE wildcards

  ## Performance Impact
  - Before: 8+ seconds timeout on searches
  - After: Should complete in <100ms

  ## Technical Details
  pg_trgm breaks text into trigrams (3-character sequences) and indexes them.
  This allows efficient substring matching even with leading wildcards.
*/

-- Enable trigram extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing indexes if they exist (in case of migration reruns)
DROP INDEX IF EXISTS idx_invoices_reference_trgm;
DROP INDEX IF EXISTS idx_invoices_customer_name_trgm;
DROP INDEX IF EXISTS idx_invoices_description_trgm;
DROP INDEX IF EXISTS idx_invoices_customer_order_trgm;

-- Create trigram indexes for text search columns
-- These allow fast ILIKE searches with wildcards

CREATE INDEX idx_invoices_reference_trgm
  ON acumatica_invoices
  USING gin (reference_number gin_trgm_ops);

CREATE INDEX idx_invoices_customer_name_trgm
  ON acumatica_invoices
  USING gin (customer_name gin_trgm_ops);

CREATE INDEX idx_invoices_description_trgm
  ON acumatica_invoices
  USING gin (description gin_trgm_ops);

CREATE INDEX idx_invoices_customer_order_trgm
  ON acumatica_invoices
  USING gin (customer_order gin_trgm_ops);

-- Analyze the table to update statistics
ANALYZE acumatica_invoices;
