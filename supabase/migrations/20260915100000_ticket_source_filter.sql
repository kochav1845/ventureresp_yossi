/*
  # Remember the invoice filter a ticket was built from

  Tickets can now be created straight off the Customer page's Advanced Filters
  ("everything 90+ days overdue", "everything over $5k", …). The ticket still
  owns a FIXED list of invoices in `invoice_assignments` — nothing joins or
  leaves on its own — but we keep the criteria that produced that list so the
  ticket can offer a "re-run this filter" catch-up: it shows which invoices
  would now be added and which are already paid, and applies only on click.

  Shape (mirrors the InvoiceFilters type in src/lib/invoiceFilters.ts):
    {
      "tab": "open-invoices",
      "excludeCreditMemos": false,
      "capturedAt": "2026-09-15T14:02:11.000Z",
      "filters": {
        "dateFrom": "", "dateTo": "",
        "amountMin": "", "amountMax": "",
        "daysOverdueMin": "90", "daysOverdueMax": "",
        "colorStatus": "", "invoiceStatus": "",
        "sortBy": "date", "sortOrder": "desc"
      }
    }

  NULL means the ticket was assembled by hand — no catch-up button is offered.
*/

ALTER TABLE collection_tickets
  ADD COLUMN IF NOT EXISTS source_filter jsonb;

COMMENT ON COLUMN collection_tickets.source_filter IS
  'Invoice filter criteria this ticket was built from (see src/lib/invoiceFilters.ts). Advisory only - the ticket''s invoice list lives in invoice_assignments and never changes without a user action. NULL = assembled by hand.';

-- PostgREST caches the schema; make the new column visible immediately.
NOTIFY pgrst, 'reload schema';
