/*
  # Add Missing Customer Tracking Features
  
  1. Customer Types & Data Integrity
    - Add `customer_type` field (live, test, internal)
    - Test customers excluded from financial reports
  
  2. Contact & Order Tracking
    - Add `last_contact_date` to track when customer was last contacted
    - Add `last_order_date` to track when customer last placed an order
    - Add `contact_status` (untouched, touched)
  
  3. Customer-Level Notes
    - Create `customer_notes` table for customer-level memos
    - Separate from invoice-specific memos
  
  4. Enhanced Color Status Logic
    - Track when invoice was last touched
    - Auto-red if untouched for 30 days (configurable per customer)
*/

-- Add customer type and tracking fields to acumatica_customers
ALTER TABLE acumatica_customers 
ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'live' 
  CHECK (customer_type IN ('live', 'test', 'internal'));

ALTER TABLE acumatica_customers 
ADD COLUMN IF NOT EXISTS last_contact_date timestamptz;

ALTER TABLE acumatica_customers 
ADD COLUMN IF NOT EXISTS last_order_date timestamptz;

ALTER TABLE acumatica_customers 
ADD COLUMN IF NOT EXISTS contact_status text DEFAULT 'untouched'
  CHECK (contact_status IN ('untouched', 'touched'));

-- Add indexes for filtering
CREATE INDEX IF NOT EXISTS idx_customers_type ON acumatica_customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_contact_status ON acumatica_customers(contact_status);
CREATE INDEX IF NOT EXISTS idx_customers_last_contact ON acumatica_customers(last_contact_date);

-- Create customer notes table (customer-level, not invoice-level)
CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  customer_name text,
  created_by_user_id uuid REFERENCES user_profiles(id),
  created_by_user_email text,
  created_by_user_name text,
  note_text text NOT NULL,
  note_type text DEFAULT 'general' 
    CHECK (note_type IN ('general', 'outreach', 'payment_discussion', 'promise_to_pay', 'dispute', 'other')),
  attachment_type text,
  has_voice_note boolean DEFAULT false,
  has_image boolean DEFAULT false,
  voice_note_url text,
  voice_note_duration integer,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on customer_notes
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view customer notes
CREATE POLICY "Authenticated users can view customer notes"
  ON customer_notes FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert customer notes
CREATE POLICY "Authenticated users can create customer notes"
  ON customer_notes FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

-- Allow users to update their own notes
CREATE POLICY "Users can update own customer notes"
  ON customer_notes FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_created_at ON customer_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notes_user ON customer_notes(created_by_user_id);

-- Add last_touched_date to invoices for 30-day auto-red logic
ALTER TABLE acumatica_invoices 
ADD COLUMN IF NOT EXISTS last_touched_date timestamptz;

-- Create index for untouched invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_last_touched ON acumatica_invoices(last_touched_date) 
WHERE color_status IS NOT NULL;

-- Function to update last_contact_date when notes are added
CREATE OR REPLACE FUNCTION update_customer_last_contact()
RETURNS TRIGGER AS $$
BEGIN
  -- Update customer's last contact date
  UPDATE acumatica_customers
  SET 
    last_contact_date = now(),
    contact_status = 'touched'
  WHERE customer_id = NEW.customer_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last contact when customer note is created
DROP TRIGGER IF EXISTS on_customer_note_update_contact ON customer_notes;
CREATE TRIGGER on_customer_note_update_contact
  AFTER INSERT ON customer_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_last_contact();

-- Function to update invoice last_touched_date when memo is added
CREATE OR REPLACE FUNCTION update_invoice_last_touched()
RETURNS TRIGGER AS $$
BEGIN
  -- Update invoice's last touched date and remove red status if applicable
  UPDATE acumatica_invoices
  SET 
    last_touched_date = now(),
    color_status = CASE 
      WHEN color_status = 'red' AND balance > 0 THEN 'yellow'
      ELSE color_status
    END
  WHERE reference_number = NEW.invoice_reference;
  
  -- Also update customer's last contact
  UPDATE acumatica_customers
  SET 
    last_contact_date = now(),
    contact_status = 'touched'
  WHERE customer_id = NEW.customer_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update when invoice memo is created
DROP TRIGGER IF EXISTS on_invoice_memo_update_touched ON invoice_memos;
CREATE TRIGGER on_invoice_memo_update_touched
  AFTER INSERT ON invoice_memos
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_last_touched();

-- Function to auto-return invoices to red after 30 days of no contact
CREATE OR REPLACE FUNCTION auto_red_untouched_invoices()
RETURNS void AS $$
BEGIN
  UPDATE acumatica_invoices inv
  SET 
    color_status = 'red',
    last_modified_by_color = 'system_auto_red'
  FROM acumatica_customers cust
  WHERE 
    inv.customer = cust.customer_id
    AND inv.balance > 0
    AND inv.color_status != 'red'
    AND cust.customer_type = 'live'  -- Only for live customers
    AND (
      -- No touch recorded and invoice is old
      (inv.last_touched_date IS NULL AND inv.date < (now() - interval '1 day' * COALESCE(cust.days_past_due_threshold, 30)))
      OR
      -- Last touch was more than threshold days ago
      (inv.last_touched_date < (now() - interval '1 day' * COALESCE(cust.days_past_due_threshold, 30)))
    );
END;
$$ LANGUAGE plpgsql;

-- Create view to show revenue statistics (generated vs collected)
CREATE OR REPLACE VIEW monthly_revenue_stats AS
SELECT 
  TO_CHAR(date_trunc('month', inv.date), 'YYYY-MM') as month,
  -- Revenue Generated (invoices created)
  SUM(CASE WHEN COALESCE(cust.customer_type, 'live') = 'live' THEN inv.amount ELSE 0 END) as revenue_generated,
  COUNT(CASE WHEN COALESCE(cust.customer_type, 'live') = 'live' THEN 1 END) as invoices_created,
  -- Revenue Collected (payments received) - calculated from applications
  COALESCE(payments.revenue_collected, 0) as revenue_collected,
  COALESCE(payments.payments_count, 0) as payments_received
FROM acumatica_invoices inv
LEFT JOIN acumatica_customers cust ON inv.customer = cust.customer_id
LEFT JOIN (
  SELECT 
    TO_CHAR(date_trunc('month', application_date), 'YYYY-MM') as payment_month,
    SUM(amount_paid) as revenue_collected,
    COUNT(DISTINCT payment_id) as payments_count
  FROM payment_invoice_applications app
  JOIN acumatica_customers cust ON app.customer_id = cust.customer_id
  WHERE COALESCE(cust.customer_type, 'live') = 'live'
  GROUP BY date_trunc('month', application_date)
) payments ON TO_CHAR(date_trunc('month', inv.date), 'YYYY-MM') = payments.payment_month
WHERE inv.type = 'Invoice'
GROUP BY TO_CHAR(date_trunc('month', inv.date), 'YYYY-MM'), payments.revenue_collected, payments.payments_count
ORDER BY month DESC;

-- Grant access to views
GRANT SELECT ON monthly_revenue_stats TO authenticated;