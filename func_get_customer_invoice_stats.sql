CREATE OR REPLACE FUNCTION public.get_customer_invoice_stats(p_customer_id text)
 RETURNS TABLE(highest_invoice_amount numeric, highest_invoice_ref text, lowest_invoice_amount numeric, lowest_invoice_ref text, avg_invoice_amount numeric, oldest_unpaid_date date, oldest_unpaid_ref text, newest_unpaid_date date, newest_unpaid_ref text, most_overdue_days integer, most_overdue_ref text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
RETURN QUERY
WITH invoice_data AS (
SELECT 
i.reference_number,
i.amount,
i.date,
i.due_date,
i.balance,
i.status,
CASE 
WHEN i.due_date IS NOT NULL AND i.balance > 0 
THEN GREATEST(0, (CURRENT_DATE - i.due_date)::INT)
ELSE 0
END AS overdue_days
FROM acumatica_invoices i
WHERE i.customer = p_customer_id
),
highest AS (
SELECT reference_number, amount FROM invoice_data ORDER BY amount DESC NULLS LAST LIMIT 1
),
lowest AS (
SELECT reference_number, amount FROM invoice_data WHERE amount > 0 ORDER BY amount ASC NULLS LAST LIMIT 1
),
oldest_unpaid AS (
SELECT reference_number, date FROM invoice_data WHERE balance > 0 AND status = 'Open' ORDER BY date ASC NULLS LAST LIMIT 1
),
newest_unpaid AS (
SELECT reference_number, date FROM invoice_data WHERE balance > 0 AND status = 'Open' ORDER BY date DESC NULLS LAST LIMIT 1
),
most_overdue AS (
SELECT reference_number, overdue_days FROM invoice_data WHERE balance > 0 AND status = 'Open' ORDER BY overdue_days DESC NULLS LAST LIMIT 1
)
SELECT
(SELECT amount FROM highest) AS highest_invoice_amount,
(SELECT reference_number FROM highest) AS highest_invoice_ref,
(SELECT amount FROM lowest) AS lowest_invoice_amount,
(SELECT reference_number FROM lowest) AS lowest_invoice_ref,
(SELECT AVG(amount)::NUMERIC FROM invoice_data) AS avg_invoice_amount,
(SELECT date FROM oldest_unpaid) AS oldest_unpaid_date,
(SELECT reference_number FROM oldest_unpaid) AS oldest_unpaid_ref,
(SELECT date FROM newest_unpaid) AS newest_unpaid_date,
(SELECT reference_number FROM newest_unpaid) AS newest_unpaid_ref,
(SELECT overdue_days FROM most_overdue) AS most_overdue_days,
(SELECT reference_number FROM most_overdue) AS most_overdue_ref;
END;
$function$
