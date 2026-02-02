/*
  # Refresh Schema Cache for Ticket Merge History Function

  1. Purpose
    - Ensure get_ticket_merge_history function is available in PostgREST schema cache
    - This resolves 404 errors when calling the function from the frontend

  2. Changes
    - Send notification to PostgREST to reload schema cache
    - Grant necessary permissions to authenticated users
*/

-- Ensure the function has proper permissions
GRANT EXECUTE ON FUNCTION get_ticket_merge_history(uuid) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
