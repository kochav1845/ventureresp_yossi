CREATE OR REPLACE FUNCTION public.get_collector_collected_invoices(p_collector_id uuid)
 RETURNS TABLE(invoice_reference_number text, customer_name text, customer_id text, invoice_date date, due_date date, amount numeric, balance numeric, invoice_status text, ticket_number text, ticket_id uuid, assigned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
WITH collector_invoice_map AS (
SELECT DISTINCT invoice_ref, tk_id, tk_number, assign_at FROM (
SELECT
ti.invoice_reference_number AS invoice_ref,
ct.id AS tk_id,
ct.ticket_number AS tk_number,
ti.added_at AS assign_at
FROM collection_tickets ct
JOIN ticket_invoices ti ON ti.ticket_id = ct.id
WHERE ct.assigned_collector_id = p_collector_id

UNION

SELECT
ia.invoice_reference_number AS invoice_ref,
ia.ticket_id AS tk_id,
ct2.ticket_number AS tk_number,
ia.assigned_at AS assign_at
FROM invoice_assignments ia
LEFT JOIN collection_tickets ct2 ON ct2.id = ia.ticket_id
WHERE ia.assigned_collector_id = p_collector_id
) mapping
)
SELECT
i.reference_number AS invoice_reference_number,
COALESCE(i.customer_name, i.customer) AS customer_name,
i.customer AS customer_id,
i.date AS invoice_date,
i.due_date,
i.amount,
i.balance,
i.status AS invoice_status,
cim.tk_number AS ticket_number,
cim.tk_id AS ticket_id,
cim.assign_at AS assigned_at
FROM collector_invoice_map cim
JOIN acumatica_invoices i ON i.reference_number = cim.invoice_ref
WHERE i.balance = 0
ORDER BY i.date DESC;
END;
$function$
