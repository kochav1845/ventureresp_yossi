/*
  # Add covering index for customer statement aggregation

  1. New Indexes
    - Partial index on invoices for balance > 0 and status != 'Voided' covering all columns needed
    - This avoids expensive heap lookups during the aggregation query

  2. Performance Impact
    - Reduces index scan time by including all needed columns in the index
*/

CREATE INDEX IF NOT EXISTS idx_invoices_statement_agg
  ON acumatica_invoices (customer, type, balance, due_date)
  WHERE balance > 0 AND status != 'Voided';
