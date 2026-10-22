/*
  # Customer Reports counted credit memos as money owed (audit finding 38)

  get_customers_unpaid_summary / _count / get_customer_unpaid_invoices selected
  every row with `balance > 0 AND status != 'On Hold'` with no predicate on
  `type`. In this database credit memos carry a POSITIVE balance, so a credit on
  a customer's account was summed as a receivable and the customer was dunned
  for the amount of their own credit.

  Live org, before this change -- the page's $23,370,327.63 footer total breaks
  down as:

      Open        debit   11,101 rows   $13,615,731.83   <- the real figure
      Open        CREDIT     265 rows    $6,647,018.94   <- counted as debt
      Balanced    debit      701 rows    $3,078,938.34
      Balanced    CREDIT      42 rows       $14,712.71   <- counted as debt
      Scheduled   debit        2 rows        $7,750.00
      Credit Hold debit        3 rows        $4,278.00
      Closed      debit        1 row         $1,897.81

  Worst single case: Ditmas Park Care Center was shown owing $12,425,254.68
  against real debits of $5,916,277.43. Three customers who owe nothing at all
  were listed with a balance and could be billed.

  ## Two changes, and why

  1. `type IN ('Invoice','Debit Memo')` -- excludes Credit Memo and Credit WO.
     This is a straight bug fix: a credit is not a receivable under any reading.

  2. `status = 'Open'` instead of `status != 'On Hold'`.

     This one is a judgement call and is called out in the commit message,
     because it is worth $3,078,938.34 of Balanced debits on the live org and is
     reversible in one line.

     The app currently disagrees with itself about what "outstanding" means.
     get_api_total_outstanding() -- which feeds the Dashboard KPI and the AI
     assistant -- uses `status = 'Open'`. This function used `!= 'On Hold'`,
     which also admits Balanced, Scheduled, Credit Hold and even one Closed
     invoice that still carries a balance. In Acumatica an AR document in
     Balanced state is entered and balanced but NOT released, so it has not been
     posted to the customer's account and the customer has not been billed for
     it; dunning on it would be wrong. Matching 'Open' also makes Customer
     Reports, the Dashboard and the AI agree on one number, which is the whole
     point -- a mismatch between two screens is what started this review.

     After this change all three report $13,615,731.83 for the live org.

  If Balanced should count, change the predicate to
  `i.status IN ('Open','Balanced')` in both functions below; the live-org total
  becomes $16,694,670.17.

  All three functions are SECURITY INVOKER, so RLS already scopes them to the
  caller's organization. Nothing here changes that.
*/

CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary(
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_search text DEFAULT NULL::text,
  p_min_balance numeric DEFAULT 0,
  p_sort_by text DEFAULT 'name'::text,
  p_sort_order text DEFAULT 'asc'::text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(customer_id text, customer_name text, email text, total_balance numeric, total_amount numeric, invoice_count bigint)
LANGUAGE sql
STABLE
AS $function$
WITH unpaid AS (
  SELECT i.customer, SUM(i.balance) as total_balance, SUM(i.amount) as total_amount, COUNT(*) as invoice_count
  FROM acumatica_invoices i
  WHERE i.balance > 0
    AND i.status = 'Open'
    AND i.type IN ('Invoice', 'Debit Memo')
    AND (p_date_from IS NULL OR i.date >= p_date_from) AND (p_date_to IS NULL OR i.date <= p_date_to)
  GROUP BY i.customer HAVING SUM(i.balance) >= p_min_balance
)
SELECT u.customer, COALESCE(c.customer_name, 'Customer ' || u.customer), COALESCE(c.billing_email, c.general_email, ''),
u.total_balance, u.total_amount, u.invoice_count
FROM unpaid u LEFT JOIN acumatica_customers c ON c.customer_id = u.customer
WHERE (p_search IS NULL OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_id ILIKE '%' || p_search || '%' OR COALESCE(c.billing_email, c.general_email, '') ILIKE '%' || p_search || '%')
ORDER BY
CASE WHEN p_sort_by = 'name' AND p_sort_order = 'asc' THEN c.customer_name END ASC NULLS LAST,
CASE WHEN p_sort_by = 'name' AND p_sort_order = 'desc' THEN c.customer_name END DESC NULLS LAST,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'asc' THEN u.total_balance END ASC,
CASE WHEN p_sort_by = 'balance' AND p_sort_order = 'desc' THEN u.total_balance END DESC,
CASE WHEN p_sort_by = 'invoices' AND p_sort_order = 'asc' THEN u.invoice_count END ASC,
CASE WHEN p_sort_by = 'invoices' AND p_sort_order = 'desc' THEN u.invoice_count END DESC
LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_customers_unpaid_summary_count(
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_search text DEFAULT NULL::text,
  p_min_balance numeric DEFAULT 0
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $function$
WITH unpaid AS (
  SELECT i.customer, SUM(i.balance) as total_balance
  FROM acumatica_invoices i
  WHERE i.balance > 0
    AND i.status = 'Open'
    AND i.type IN ('Invoice', 'Debit Memo')
    AND (p_date_from IS NULL OR i.date >= p_date_from) AND (p_date_to IS NULL OR i.date <= p_date_to)
  GROUP BY i.customer HAVING SUM(i.balance) >= p_min_balance
)
SELECT COUNT(*)::bigint FROM unpaid u LEFT JOIN acumatica_customers c ON c.customer_id = u.customer
WHERE (p_search IS NULL OR c.customer_name ILIKE '%' || p_search || '%' OR c.customer_id ILIKE '%' || p_search || '%' OR COALESCE(c.billing_email, c.general_email, '') ILIKE '%' || p_search || '%');
$function$;

-- The expanded row on /customer-reports. It returned every balance > 0 row and
-- did not even select `type`, so a credit memo appeared as an ordinary unpaid
-- invoice line. Same predicate as the summary above, so the lines now add up to
-- the figure beside them.
CREATE OR REPLACE FUNCTION public.get_customer_unpaid_invoices(
  p_customer_id text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(id uuid, reference_number text, invoice_date date, due_date date, amount numeric, balance numeric, status text, description text)
LANGUAGE sql
STABLE
AS $function$
SELECT
i.id,
i.reference_number,
i.date as invoice_date,
i.due_date,
COALESCE(i.amount, 0) as amount,
COALESCE(i.balance, 0) as balance,
i.status,
COALESCE(i.description, '') as description
FROM acumatica_invoices i
WHERE i.customer = p_customer_id
AND i.balance > 0
AND i.status = 'Open'
AND i.type IN ('Invoice', 'Debit Memo')
AND (p_date_from IS NULL OR i.date >= p_date_from)
AND (p_date_to IS NULL OR i.date <= p_date_to)
ORDER BY i.date DESC, i.reference_number;
$function$;
