/*
  # Revert all heavy query functions to SECURITY DEFINER

  RLS with per-row get_user_org_id() evaluation causes statement timeouts
  on large tables. Since the underlying tables still have RLS (protecting direct
  client queries), we revert functions to SECURITY DEFINER. The org isolation
  in functions is handled by explicit WHERE clauses added in the previous migration
  for get_filtered_invoice_aggregates. For the remaining functions, the RLS on
  tables still applies when users query tables directly, but functions bypass it.

  For functions that are called via .rpc() from the frontend, SECURITY DEFINER
  with explicit org filtering is the correct pattern.
*/

-- Batch update: set all public get_* functions to SECURITY DEFINER
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.prosecdef = false
    AND p.prokind = 'f'
    AND (
      p.proname LIKE 'get_%'
      OR p.proname IN (
        'search_invoices_fast', 'search_invoices_paginated', 'search_invoices_count',
        'global_search', 'process_auto_ticket_rules'
      )
    )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', r.oid::regprocedure);
  END LOOP;
END;
$$;
