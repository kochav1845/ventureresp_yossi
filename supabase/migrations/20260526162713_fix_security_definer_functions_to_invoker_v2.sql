/*
  # Fix SECURITY DEFINER functions to respect RLS

  Changes the key functions that bypass RLS to use SECURITY INVOKER instead,
  so they respect the new org-based RLS policies.
*/

ALTER FUNCTION get_customer_analytics SECURITY INVOKER;
ALTER FUNCTION get_customer_invoices_paginated SECURITY INVOKER;
