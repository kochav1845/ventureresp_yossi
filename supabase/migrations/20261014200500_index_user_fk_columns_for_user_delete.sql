/*
  # Deleting a user no longer scans the invoice tables

  DELETE /rest/v1/user_profiles?id=eq.<id> (force-delete-user) failed with 500
  "canceling statement due to statement timeout" on 2026-10-13 19:17 UTC, inside
  the FK action
    UPDATE ONLY acumatica_invoices SET manual_created_by = NULL WHERE manual_created_by = $1

  Deleting a profile (and then its auth user) makes Postgres look up every FK
  column that points at it. These had no index, so each lookup was a sequential
  scan of the whole table -- 3.8 s together on a warm cache, past the 8 s
  PostgREST timeout once the 276 MB invoices heap is not in memory:

    acumatica_invoices.manual_created_by    -> user_profiles  ON DELETE SET NULL
    acumatica_invoices.promise_by_user_id   -> auth.users     (NO ACTION check)
    acumatica_payments.manual_created_by    -> user_profiles  ON DELETE SET NULL
    acumatica_customers.manual_created_by   -> user_profiles  ON DELETE SET NULL
    payment_attachments.uploaded_by         -> user_profiles  ON DELETE SET NULL

  Almost every value is NULL (synced rows have no creator), so partial indexes on
  the non-NULL values are tiny and cost nothing on the sync's writes; the FK
  lookup (col = $1) can use them. The remaining unindexed user FK columns are on
  tables under 250 kB.

  Applied on prod with CREATE INDEX CONCURRENTLY (no write lock on the synced
  tables); IF NOT EXISTS keeps this file safe to replay.
*/

CREATE INDEX IF NOT EXISTS idx_invoices_manual_created_by
  ON public.acumatica_invoices (manual_created_by) WHERE manual_created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_promise_by_user_id
  ON public.acumatica_invoices (promise_by_user_id) WHERE promise_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_manual_created_by
  ON public.acumatica_payments (manual_created_by) WHERE manual_created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_manual_created_by
  ON public.acumatica_customers (manual_created_by) WHERE manual_created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_attachments_uploaded_by
  ON public.payment_attachments (uploaded_by) WHERE uploaded_by IS NOT NULL;
