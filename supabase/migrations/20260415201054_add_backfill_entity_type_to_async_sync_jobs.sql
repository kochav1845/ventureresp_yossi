/*
  # Add backfill-doc-dates entity type to async_sync_jobs

  1. Modified Tables
    - `async_sync_jobs`: Expanded entity_type check constraint to allow 'backfill-doc-dates'

  2. Important Notes
    - This allows the backfill doc dates job to track progress in the same async_sync_jobs table
*/

ALTER TABLE async_sync_jobs DROP CONSTRAINT IF EXISTS async_sync_jobs_entity_type_check;

ALTER TABLE async_sync_jobs ADD CONSTRAINT async_sync_jobs_entity_type_check
  CHECK (entity_type = ANY (ARRAY['customer'::text, 'invoice'::text, 'payment'::text, 'backfill-doc-dates'::text]));
