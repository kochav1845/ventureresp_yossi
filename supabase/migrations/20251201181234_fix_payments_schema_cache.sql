/*
  # Refresh Schema Cache for Payments Table
  
  1. Changes
    - Force refresh of schema cache by notifying PostgreSQL of table changes
    - Ensure all columns are recognized by PostgREST
*/

NOTIFY pgrst, 'reload schema';
