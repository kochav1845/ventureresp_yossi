/*
  # Add covering index for fast customer balance aggregation

  1. Problem
    - The fast customer balance query filters on `status IN ('Open','Balanced') AND balance > 0`
    - Existing indexes only cover `status = 'Open'` (not Balanced)
    - This forces a BitmapAnd of two separate indexes, causing 3+ second scan times

  2. New Index
    - `idx_invoices_open_balanced_agg` covers the exact WHERE clause
    - Includes customer, type, balance, color_status, date as columns
    - This allows an index-only scan for the aggregation query

  3. Expected Impact
    - Should reduce the invoice scan from ~3.3s to well under 1s
    - Makes the fast customer load function return all customers in ~1s total
*/

CREATE INDEX IF NOT EXISTS idx_invoices_open_balanced_agg
  ON acumatica_invoices (customer, type, balance, color_status, date)
  WHERE status IN ('Open', 'Balanced') AND balance > 0;
