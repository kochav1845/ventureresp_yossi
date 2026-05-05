/*
  # Add reconcile-balanced entity type to async_sync_jobs

  1. Changes
    - Adds 'reconcile-balanced' to the allowed entity_type values
    - Required for the balanced invoice reconciliation job to track progress

  2. Important Notes
    - Drops and recreates the check constraint with the new value added
    - All existing values are preserved
*/

ALTER TABLE async_sync_jobs DROP CONSTRAINT IF EXISTS async_sync_jobs_entity_type_check;

ALTER TABLE async_sync_jobs ADD CONSTRAINT async_sync_jobs_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'customer'::text,
    'invoice'::text,
    'payment'::text,
    'backfill-doc-dates'::text,
    'reconcile-balanced'::text
  ]));
