/*
  # Add Payment Search Indexes

  1. Performance Improvements
    - Add GIN indexes with trigram support for fast text searches
    - Add standard B-tree indexes for filtering and sorting
    - Optimize common query patterns for payment lookups

  2. Indexes Created
    - Trigram indexes for ILIKE searches (reference_number, customer_id, description, payment_ref)
    - Standard indexes for filtering (status, type, application_date, payment_method)
    - Combined index for common filtering patterns
*/

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop existing indexes if they exist to recreate them
DROP INDEX IF EXISTS idx_payments_reference_number_trgm;
DROP INDEX IF EXISTS idx_payments_customer_id_trgm;
DROP INDEX IF EXISTS idx_payments_description_trgm;
DROP INDEX IF EXISTS idx_payments_payment_ref_trgm;
DROP INDEX IF EXISTS idx_payments_status;
DROP INDEX IF EXISTS idx_payments_type;
DROP INDEX IF EXISTS idx_payments_application_date;
DROP INDEX IF EXISTS idx_payments_payment_method;
DROP INDEX IF EXISTS idx_payments_status_date;

-- Create trigram indexes for fast text search
CREATE INDEX idx_payments_reference_number_trgm ON acumatica_payments USING gin (reference_number gin_trgm_ops);
CREATE INDEX idx_payments_customer_id_trgm ON acumatica_payments USING gin (customer_id gin_trgm_ops);
CREATE INDEX idx_payments_description_trgm ON acumatica_payments USING gin (description gin_trgm_ops);
CREATE INDEX idx_payments_payment_ref_trgm ON acumatica_payments USING gin (payment_ref gin_trgm_ops);

-- Create standard indexes for filtering and sorting
CREATE INDEX idx_payments_status ON acumatica_payments (status);
CREATE INDEX idx_payments_type ON acumatica_payments (type);
CREATE INDEX idx_payments_application_date ON acumatica_payments (application_date DESC);
CREATE INDEX idx_payments_payment_method ON acumatica_payments (payment_method);

-- Combined index for common filtering patterns
CREATE INDEX idx_payments_status_date ON acumatica_payments (status, application_date DESC);
