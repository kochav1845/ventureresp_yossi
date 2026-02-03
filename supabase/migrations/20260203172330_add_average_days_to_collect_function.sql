/*
  # Add Average Days to Collect Metric

  1. New Function
    - `get_customer_avg_days_to_collect(customer_id_param text)`
      - Calculates average days from invoice date to payment date
      - Uses payment_invoice_applications to link invoices and payments
      - Returns the average collection time in days
      - Returns NULL if no payment history exists

  2. Logic
    - Joins payment applications with invoices (for invoice date)
    - Joins with payments (for payment date)
    - Excludes credit memos and prepayments
    - Calculates days between invoice date and payment date
    - Returns average across all applications
*/

CREATE OR REPLACE FUNCTION get_customer_avg_days_to_collect(customer_id_param text)
RETURNS numeric AS $$
BEGIN
  RETURN (
    SELECT AVG(
      EXTRACT(EPOCH FROM (p.date::timestamp - i.date::timestamp)) / 86400
    )::numeric(10,1)
    FROM payment_invoice_applications pia
    INNER JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number
    INNER JOIN acumatica_payments p ON p.reference_number = pia.payment_reference_number
    WHERE i.customer_id = customer_id_param
      AND pia.amount_paid > 0
      AND i.doc_type != 'Credit Memo'
      AND p.doc_type != 'Prepayment'
      AND p.date IS NOT NULL
      AND i.date IS NOT NULL
      AND p.date >= i.date
  );
END;
$$ LANGUAGE plpgsql STABLE;
