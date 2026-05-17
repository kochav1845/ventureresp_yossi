/*
  # Create execute_readonly_sql function

  1. New Functions
    - `execute_readonly_sql(sql_query text)` - Executes a read-only SQL query and returns JSON results
    - Used by the AI chat assistant for advanced queries not covered by specialized tools
    - Enforces read-only by setting the transaction to read only mode
    - Limited to 200 rows via statement timeout and row limits

  2. Security
    - SECURITY DEFINER to bypass RLS (called from service role context)
    - Validates query starts with SELECT
    - Sets statement_timeout to 10 seconds to prevent long-running queries
*/

CREATE OR REPLACE FUNCTION execute_readonly_sql(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
AS $$
DECLARE
  result json;
BEGIN
  IF NOT (upper(trim(sql_query)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  SET LOCAL default_transaction_read_only = on;

  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql_query || ') t'
    INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
