/*
  # Add Due Date Sorting Indexes

  1. Changes
    - Add indexes for due_date sorting (both asc and desc)
    - These indexes support the separate query branches in search_invoices_paginated
*/

CREATE INDEX IF NOT EXISTS idx_invoices_due_date_sort_desc 
  ON acumatica_invoices(due_date DESC NULLS LAST, date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date_sort_asc 
  ON acumatica_invoices(due_date ASC NULLS LAST, date DESC);
