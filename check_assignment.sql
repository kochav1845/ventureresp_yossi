-- Check invoice details
SELECT id, reference_number, customer, customer_name, status, balance
FROM acumatica_invoices
WHERE reference_number = '098742';

-- Check if there's an assignment
SELECT ia.*, up.email, up.full_name, up.assigned_color
FROM invoice_assignments ia
LEFT JOIN user_profiles up ON ia.assigned_collector_id = up.id
WHERE ia.invoice_reference_number = '098742';
