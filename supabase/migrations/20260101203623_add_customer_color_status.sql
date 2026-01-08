/*
  # Add Customer Color Status

  1. Changes
    - Add `customer_color_status` field to `acumatica_customers`
      - Values: 'red', 'yellow', 'green', or NULL
      - Manually set by collectors/admins
      - Different from invoice color status
    - Add `color_status_updated_at` timestamp
    - Add `color_status_updated_by` for tracking who changed it
    - Add `color_status_notes` for optional reason/note

  2. Purpose
    - Allow staff to manually mark customer priority/status
    - Track accountability for status changes
    - Separate from automatic invoice color logic
*/

-- Add customer color status fields
ALTER TABLE acumatica_customers
ADD COLUMN IF NOT EXISTS customer_color_status text CHECK (customer_color_status IN ('red', 'yellow', 'green')),
ADD COLUMN IF NOT EXISTS color_status_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS color_status_updated_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS color_status_notes text;

-- Create index for filtering by color status
CREATE INDEX IF NOT EXISTS idx_customers_color_status ON acumatica_customers(customer_color_status) WHERE customer_color_status IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN acumatica_customers.customer_color_status IS 'Manually assigned customer priority status: red (urgent), yellow (attention needed), green (good standing)';
