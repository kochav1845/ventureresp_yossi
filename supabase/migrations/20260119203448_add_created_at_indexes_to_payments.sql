/*
  # Add Created At Indexes to Payments

  1. Performance Optimization
    - Add index on `created_at` for date range queries
    - Add composite index on `status` and `created_at` for filtered queries
    - Add composite index on `type` and `created_at` for filtered queries
    
  2. Purpose
    - PaymentAnalytics page now filters by `created_at` instead of `application_date`
    - These indexes match the existing `application_date` indexes to maintain performance
*/

-- Main created_at index for date range queries (descending for newest first)
CREATE INDEX IF NOT EXISTS idx_payments_created_at 
ON acumatica_payments (created_at DESC);

-- Composite index for status + created_at queries
CREATE INDEX IF NOT EXISTS idx_payments_status_created 
ON acumatica_payments (status, created_at DESC);

-- Composite index for type + created_at queries (excludes credit memos)
CREATE INDEX IF NOT EXISTS idx_payments_type_created 
ON acumatica_payments (type, created_at DESC);
