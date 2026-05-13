/*
  # Refresh schema cache for user_component_locks table

  Forces PostgREST to reload schema so the new table is accessible via the Supabase JS client.
*/

NOTIFY pgrst, 'reload schema';
