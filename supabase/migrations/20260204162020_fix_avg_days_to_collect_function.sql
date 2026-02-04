/*
  # Fix Average Days to Collect Function

  1. Changes
    - Fix column reference: `p.date` → `p.application_date`
    - Fix column reference: `p.doc_type` → `p.type`
    - Use correct column names from actual schema
*/

CREATE OR REPLACE FUNCTION get_customer_avg_days_to_collect(customer_id_param text)
RETURNS numeric AS $$
BEGIN
  RETURN (
    SELECT AVG(
      EXTRACT(EPOCH FROM (p.application_date::timestamp - i.date::timestamp)) / 86400
    )::numeric(10,1)
    FROM payment_invoice_applications pia
    INNER JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number
    INNER JOIN acumatica_payments p ON p.reference_number = pia.payment_reference_number
    WHERE i.customer_id = customer_id_param
      AND pia.amount_paid > 0
      AND i.type != 'Credit Memo'
      AND p.type != 'Prepayment'
      AND p.application_date IS NOT NULL
      AND i.date IS NOT NULL
      AND p.application_date >= i.date
  );
END;
$$ LANGUAGE plpgsql STABLE;
