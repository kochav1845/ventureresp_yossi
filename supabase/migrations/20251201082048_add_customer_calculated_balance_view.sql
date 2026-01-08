/*
  # Add Customer Calculated Balance View
  
  1. Overview
    - Create a view that calculates real-time customer balances from invoices
    - Provides accurate balance, open invoices count, and oldest invoice information
    - Replaces the static balance field with dynamic calculations
  
  2. Calculations
    - `calculated_balance`: Sum of all open invoice balances for the customer
    - `total_paid`: Sum of all payment amounts (from payment applications)
    - `open_invoices_count`: Count of invoices with status 'Open' or 'Balanced'
    - `oldest_open_invoice_date`: Date of the oldest unpaid invoice
    - `oldest_open_invoice_ref`: Reference number of oldest unpaid invoice
  
  3. Usage
    - Query this view instead of `acumatica_customers` for accurate balance info
    - Joins customer data with aggregated invoice and payment data
*/

-- Create a view that calculates customer balances from invoices
CREATE OR REPLACE VIEW customer_balances AS
SELECT 
  c.id,
  c.customer_id,
  c.customer_name,
  c.customer_class,
  c.customer_status,
  c.country,
  c.city,
  c.email_address,
  c.terms,
  c.credit_limit,
  c.balance as stored_balance,
  
  -- Calculated balance from open invoices
  COALESCE(SUM(CASE 
    WHEN i.status IN ('Open', 'Balanced') THEN i.balance 
    ELSE 0 
  END), 0) as calculated_balance,
  
  -- Total amount paid (sum of all payments for this customer)
  COALESCE((
    SELECT SUM(p.payment_amount)
    FROM acumatica_payments p
    WHERE p.customer_id = c.customer_id
    AND p.status NOT IN ('Voided', 'Cancelled')
  ), 0) as total_paid,
  
  -- Count of open/balanced invoices
  COUNT(CASE 
    WHEN i.status IN ('Open', 'Balanced') THEN 1 
  END) as open_invoices_count,
  
  -- Count of unpaid invoices (balance > 0)
  COUNT(CASE 
    WHEN i.balance > 0 THEN 1 
  END) as unpaid_invoices_count,
  
  -- Oldest open invoice
  MIN(CASE 
    WHEN i.status IN ('Open', 'Balanced') AND i.balance > 0 THEN i.date 
  END) as oldest_open_invoice_date,
  
  -- Get the reference number of the oldest invoice
  (
    SELECT i2.reference_number
    FROM acumatica_invoices i2
    WHERE i2.customer = c.customer_id
    AND i2.status IN ('Open', 'Balanced')
    AND i2.balance > 0
    ORDER BY i2.date ASC
    LIMIT 1
  ) as oldest_open_invoice_ref,
  
  c.synced_at,
  c.created_at,
  c.updated_at,
  c.last_sync_timestamp
  
FROM acumatica_customers c
LEFT JOIN acumatica_invoices i ON i.customer = c.customer_id
GROUP BY 
  c.id,
  c.customer_id,
  c.customer_name,
  c.customer_class,
  c.customer_status,
  c.country,
  c.city,
  c.email_address,
  c.terms,
  c.credit_limit,
  c.balance,
  c.synced_at,
  c.created_at,
  c.updated_at,
  c.last_sync_timestamp;

-- Grant access to authenticated users
GRANT SELECT ON customer_balances TO authenticated;

-- Add comment
COMMENT ON VIEW customer_balances IS 'Provides real-time customer balance calculations from invoice and payment data';
