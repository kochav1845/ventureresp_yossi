/*
  # Remove duplicate get_customer_invoices_count overload

  Two overloads exist:
    - (p_customer_id text)
    - (p_customer_id text, p_filter text DEFAULT 'all')
  
  PostgREST cannot disambiguate when called with only p_customer_id.
  Drop the simpler one since the second covers it with the default param.
*/

DROP FUNCTION IF EXISTS get_customer_invoices_count(text);
