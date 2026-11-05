/*
  # Customer detail showed a truncated, non-deterministic balance (audit 37)

  CustomerDetailView pulled every outstanding invoice row and added them up in
  the browser, with no .range() and -- worse -- no .order(). PostgREST returns
  at most 1,000 rows, so for Pinnacle Home Care (3,625 open invoices) the
  balance card read about $305K against a real $1.56M, while the invoice-count
  block on the same screen, which uses a server-side RPC, correctly said 3,625.
  Two contradictory numbers side by side.

  Because nothing ordered the rows, which 1,000 came back was unspecified, so
  the headline balance could change between two refreshes with no data change
  at all. The colour tallies were the same shape of bug.

  One aggregate, computed in the database, returns everything that card needs.
  No rows cross the wire, so there is no cap to hit and nothing to page.

  SECURITY INVOKER, so RLS scopes it to the caller's organization exactly as the
  direct query did.
*/

CREATE OR REPLACE FUNCTION public.get_customer_balance_breakdown(p_customer_id text)
RETURNS TABLE (
  gross_balance            numeric,
  credit_memo_balance      numeric,
  open_invoice_count       bigint,
  balanced_invoice_count   bigint,
  balanced_invoice_balance numeric,
  red_count                bigint,
  yellow_count             bigint,
  green_count              bigint,
  max_days_overdue         integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  WITH outstanding AS (
    SELECT i.balance, i.type, i.status, i.color_status, i.due_date, i.date
    FROM acumatica_invoices i
    WHERE i.customer = p_customer_id
      AND i.balance > 0
      AND i.status IN ('Open', 'Balanced')
  ),
  -- The colour tallies used a different predicate (status <> 'On Hold'), so
  -- they are counted over their own set rather than folded into the one above.
  coloured AS (
    SELECT i.color_status
    FROM acumatica_invoices i
    WHERE i.customer = p_customer_id
      AND i.balance > 0
      AND i.status <> 'On Hold'
  )
  SELECT
    COALESCE(SUM(o.balance) FILTER (WHERE o.type <> 'Credit Memo'), 0)                              AS gross_balance,
    COALESCE(SUM(o.balance) FILTER (WHERE o.type = 'Credit Memo'), 0)                               AS credit_memo_balance,
    COUNT(*) FILTER (WHERE o.type <> 'Credit Memo' AND o.status <> 'Balanced')                      AS open_invoice_count,
    COUNT(*) FILTER (WHERE o.type <> 'Credit Memo' AND o.status = 'Balanced')                       AS balanced_invoice_count,
    COALESCE(SUM(o.balance) FILTER (WHERE o.type <> 'Credit Memo' AND o.status = 'Balanced'), 0)    AS balanced_invoice_balance,
    (SELECT COUNT(*) FROM coloured WHERE color_status = 'red')                                      AS red_count,
    (SELECT COUNT(*) FROM coloured WHERE color_status = 'yellow')                                   AS yellow_count,
    (SELECT COUNT(*) FROM coloured WHERE color_status = 'green')                                    AS green_count,
    COALESCE(MAX(GREATEST(0, (CURRENT_DATE - COALESCE(o.due_date, o.date))::int))
             FILTER (WHERE o.type <> 'Credit Memo'), 0)                                             AS max_days_overdue
  FROM outstanding o;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_customer_balance_breakdown(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_balance_breakdown(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_balance_breakdown(text) TO authenticated, service_role;
