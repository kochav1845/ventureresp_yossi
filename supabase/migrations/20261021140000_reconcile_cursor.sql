/*
  # Let the invoice reconcile resume where it left off

  reconcile-invoice-statuses has never once finished a run. It walks ~11,700
  open invoices plus ~2,500 credit memos at 50 per Acumatica round-trip -- a few
  hundred sequential REST calls against a 150s gateway limit -- so it is killed
  partway through every night. Because it always restarted from the lowest
  reference number, the same first slice was re-checked daily and the tail was
  never reached at all.

  That is how 192 invoices worth $120,425.84 sat marked Open for months after
  Acumatica had closed them (snapshot in invoice_status_fix_20261021).

  It looked healthy from the outside: cron.job_run_details said "succeeded"
  because net.http_post only reports that the request was dispatched, and
  sync_change_logs had zero invoice_reconciliation rows ever -- the function
  died before reaching its logging step, so nothing recorded the failure.

  This table holds the position of the last document checked. Each run takes a
  bounded slice from there, saves where it stopped, and wraps around at the end,
  so the whole book is covered across successive runs.
*/

CREATE TABLE IF NOT EXISTS public.reconcile_cursor (
  key          text PRIMARY KEY,
  last_key     text NOT NULL DEFAULT '',
  passes       integer NOT NULL DEFAULT 0,
  last_run_at  timestamptz,
  last_summary text
);

COMMENT ON TABLE public.reconcile_cursor IS
  'Resume position for reconcile-invoice-statuses. last_key is "<reference_number>|<type>" of the last document checked; empty string means start from the beginning.';

INSERT INTO public.reconcile_cursor (key) VALUES ('invoice_statuses')
ON CONFLICT (key) DO NOTHING;

-- Service-role only: the edge function is the sole writer.
ALTER TABLE public.reconcile_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reconcile_cursor FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
