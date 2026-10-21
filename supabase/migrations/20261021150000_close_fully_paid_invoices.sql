/*
  # Close invoices our own payment records already show as fully paid

  The Acumatica walk in reconcile-invoice-statuses is slow (hundreds of
  sequential REST calls) and only covers a slice of the book per run. But for
  the commonest kind of drift we do not need Acumatica at all: if the payments
  we have already recorded against an invoice cover its amount, it is paid.

  That is precisely the drift that went unnoticed for months -- 192 invoices
  worth $120,425.84 sat Open while payment_invoice_applications already showed
  every one of them settled in full.

  Safety: a voided payment is stored with a NEGATIVE amount_paid (1,749 such
  rows totalling -$5.1M), so SUM(amount_paid) nets voids out on its own. A void
  therefore lowers the total and can only ever leave an invoice open -- it can
  never push one over the line into being closed. The comparison is also
  deliberately one-directional: this only ever closes an invoice that is fully
  covered, it never reopens one.

  Credit memos and anything only partly paid are left alone for the Acumatica
  pass to judge.
*/

CREATE OR REPLACE FUNCTION public.close_fully_paid_invoices()
RETURNS TABLE(closed_count integer, balance_cleared numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer := 0;
  v_sum numeric := 0;
BEGIN
  WITH paid AS (
    SELECT i.id, i.balance
      FROM acumatica_invoices i
      JOIN payment_invoice_applications pa
        ON pa.invoice_reference_number = i.reference_number
     WHERE i.status IN ('Open', 'Balanced', 'Credit Hold')
       AND i.balance > 0
       AND i.type IN ('Invoice', 'Debit Memo')
     GROUP BY i.id, i.balance, i.amount
    HAVING SUM(pa.amount_paid) >= i.amount - 0.005
  ),
  upd AS (
    UPDATE acumatica_invoices i
       SET status = 'Closed',
           balance = 0,
           last_sync_timestamp = now()
      FROM paid
     WHERE i.id = paid.id
    RETURNING paid.balance AS cleared
  )
  SELECT count(*)::integer, COALESCE(sum(cleared), 0)
    INTO v_count, v_sum
    FROM upd;

  -- Keep the customer list views honest about what just changed.
  IF v_count > 0 THEN
    PERFORM refresh_cached_customer_balance_for(c.customer)
       FROM (
         SELECT DISTINCT i.customer
           FROM acumatica_invoices i
          WHERE i.last_sync_timestamp > now() - interval '1 minute'
            AND i.status = 'Closed'
            AND i.customer IS NOT NULL
       ) c;
  END IF;

  RETURN QUERY SELECT v_count, v_sum;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_fully_paid_invoices() FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
