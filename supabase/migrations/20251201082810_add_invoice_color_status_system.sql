/*
  # Add Invoice Color Status System
  
  1. Overview
    - Add color status tracking to invoices
    - Create log table to track all status changes with user attribution
    - Support 4 color statuses: green, yellow, orange, red
  
  2. New Columns
    - `color_status` on acumatica_invoices table (green, yellow, orange, red, or null)
    - Tracks the current color status of each invoice
  
  3. New Tables
    - `invoice_status_changes` table to log all status changes
      - Records what changed, when, and by whom
      - Stores both old and new status values
  
  4. Security
    - Enable RLS on invoice_status_changes table
    - Only authenticated users can insert change logs
    - All authenticated users can read change logs
*/

-- Add color_status column to acumatica_invoices
ALTER TABLE acumatica_invoices 
ADD COLUMN IF NOT EXISTS color_status TEXT CHECK (color_status IN ('green', 'yellow', 'orange', 'red'));

CREATE INDEX IF NOT EXISTS idx_invoices_color_status ON acumatica_invoices(color_status);

-- Create invoice_status_changes table to log all changes
CREATE TABLE IF NOT EXISTS invoice_status_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES acumatica_invoices(id) ON DELETE CASCADE,
  invoice_reference TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  changed_by_email TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_status_changes_invoice ON invoice_status_changes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_status_changes_user ON invoice_status_changes(changed_by);
CREATE INDEX IF NOT EXISTS idx_status_changes_date ON invoice_status_changes(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_changes_reference ON invoice_status_changes(invoice_reference);

-- Enable RLS
ALTER TABLE invoice_status_changes ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert their own status changes
CREATE POLICY "Users can log their own status changes"
  ON invoice_status_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- Policy: Authenticated users can view all status changes
CREATE POLICY "Users can view all status changes"
  ON invoice_status_changes
  FOR SELECT
  TO authenticated
  USING (true);

-- Create function to automatically log status changes
CREATE OR REPLACE FUNCTION log_invoice_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if color_status actually changed
  IF (OLD.color_status IS DISTINCT FROM NEW.color_status) THEN
    INSERT INTO invoice_status_changes (
      invoice_id,
      invoice_reference,
      old_status,
      new_status,
      changed_by,
      changed_by_email
    ) VALUES (
      NEW.id,
      NEW.reference_number,
      OLD.color_status,
      NEW.color_status,
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid())
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log status changes
DROP TRIGGER IF EXISTS invoice_status_change_trigger ON acumatica_invoices;
CREATE TRIGGER invoice_status_change_trigger
  AFTER UPDATE ON acumatica_invoices
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_status_change();

-- Grant permissions
GRANT SELECT, UPDATE(color_status) ON acumatica_invoices TO authenticated;
GRANT SELECT, INSERT ON invoice_status_changes TO authenticated;

-- Add helpful comment
COMMENT ON TABLE invoice_status_changes IS 'Logs all changes to invoice color status with user attribution';
COMMENT ON COLUMN acumatica_invoices.color_status IS 'Custom color status indicator: green, yellow, orange, or red';
