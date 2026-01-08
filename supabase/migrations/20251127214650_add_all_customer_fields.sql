/*
  # Add All Missing Customer Fields to acumatica_customers

  1. New Columns Added
    - `baccount_id` (integer) - Internal Acumatica account ID
    - `account_ref` (text) - Account reference
    - `note` (text) - Customer notes
    - `apply_overdue_charges` (boolean) - Apply overdue charges flag
    - `auto_apply_payments` (boolean) - Auto apply payments flag
    - `billing_address_override` (boolean) - Billing address override flag
    - `billing_contact_override` (boolean) - Billing contact override flag
    - `created_date_time` (timestamptz) - Record creation timestamp
    - `currency_id` (text) - Currency identifier
    - `currency_rate_type` (text) - Currency rate type
    - `customer_category` (text) - Customer category
    - `email_address` (text) - Email address (renamed from Email)
    - `enable_currency_override` (boolean) - Enable currency override
    - `enable_rate_override` (boolean) - Enable rate override
    - `enable_write_offs` (boolean) - Enable write offs
    - `fob_point` (text) - FOB point
    - `is_guest_customer` (boolean) - Guest customer flag
    - `last_modified_date_time` (timestamptz) - Last modified timestamp
    - `lead_time_days` (integer) - Lead time in days
    - `location_name` (text) - Location name
    - `multi_currency_statements` (boolean) - Multi currency statements flag
    - `note_id` (text) - Note identifier
    - `order_priority` (integer) - Order priority
    - `parent_record` (text) - Parent record reference
    - `price_class_id` (text) - Price class identifier
    - `primary_contact_id` (text) - Primary contact identifier
    - `print_dunning_letters` (boolean) - Print dunning letters flag
    - `print_invoices` (boolean) - Print invoices flag
    - `print_statements` (boolean) - Print statements flag
    - `residential_delivery` (boolean) - Residential delivery flag
    - `saturday_delivery` (boolean) - Saturday delivery flag
    - `send_dunning_letters_by_email` (boolean) - Send dunning letters by email
    - `send_invoices_by_email` (boolean) - Send invoices by email
    - `send_statements_by_email` (boolean) - Send statements by email
    - `shipping_address_override` (text) - Shipping address override
    - `shipping_contact_override` (text) - Shipping contact override
    - `shipping_rule` (text) - Shipping rule
    - `shipping_terms` (text) - Shipping terms
    - `shipping_zone_id` (text) - Shipping zone identifier
    - `ship_via` (text) - Ship via method
    - `statement_cycle_id` (text) - Statement cycle identifier
    - `statement_type` (text) - Statement type
    - `tax_registration_id` (text) - Tax registration identifier
    - `tax_zone` (text) - Tax zone
    - `warehouse_id` (text) - Warehouse identifier
    - `write_off_limit` (numeric) - Write off limit amount

  2. Notes
    - All existing columns preserved
    - New columns added with appropriate data types
    - Boolean fields default to false where applicable
    - Numeric fields allow null values
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'baccount_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN baccount_id integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'account_ref') THEN
    ALTER TABLE acumatica_customers ADD COLUMN account_ref text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'note') THEN
    ALTER TABLE acumatica_customers ADD COLUMN note text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'apply_overdue_charges') THEN
    ALTER TABLE acumatica_customers ADD COLUMN apply_overdue_charges boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'auto_apply_payments') THEN
    ALTER TABLE acumatica_customers ADD COLUMN auto_apply_payments boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'billing_address_override') THEN
    ALTER TABLE acumatica_customers ADD COLUMN billing_address_override boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'billing_contact_override') THEN
    ALTER TABLE acumatica_customers ADD COLUMN billing_contact_override boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'created_date_time') THEN
    ALTER TABLE acumatica_customers ADD COLUMN created_date_time timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'currency_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN currency_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'currency_rate_type') THEN
    ALTER TABLE acumatica_customers ADD COLUMN currency_rate_type text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'customer_category') THEN
    ALTER TABLE acumatica_customers ADD COLUMN customer_category text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'email_address') THEN
    ALTER TABLE acumatica_customers ADD COLUMN email_address text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'enable_currency_override') THEN
    ALTER TABLE acumatica_customers ADD COLUMN enable_currency_override boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'enable_rate_override') THEN
    ALTER TABLE acumatica_customers ADD COLUMN enable_rate_override boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'enable_write_offs') THEN
    ALTER TABLE acumatica_customers ADD COLUMN enable_write_offs boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'fob_point') THEN
    ALTER TABLE acumatica_customers ADD COLUMN fob_point text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'is_guest_customer') THEN
    ALTER TABLE acumatica_customers ADD COLUMN is_guest_customer boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'last_modified_date_time') THEN
    ALTER TABLE acumatica_customers ADD COLUMN last_modified_date_time timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'lead_time_days') THEN
    ALTER TABLE acumatica_customers ADD COLUMN lead_time_days integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'location_name') THEN
    ALTER TABLE acumatica_customers ADD COLUMN location_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'multi_currency_statements') THEN
    ALTER TABLE acumatica_customers ADD COLUMN multi_currency_statements boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'note_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN note_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'order_priority') THEN
    ALTER TABLE acumatica_customers ADD COLUMN order_priority integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'parent_record') THEN
    ALTER TABLE acumatica_customers ADD COLUMN parent_record text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'price_class_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN price_class_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'primary_contact_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN primary_contact_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'print_dunning_letters') THEN
    ALTER TABLE acumatica_customers ADD COLUMN print_dunning_letters boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'print_invoices') THEN
    ALTER TABLE acumatica_customers ADD COLUMN print_invoices boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'print_statements') THEN
    ALTER TABLE acumatica_customers ADD COLUMN print_statements boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'residential_delivery') THEN
    ALTER TABLE acumatica_customers ADD COLUMN residential_delivery boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'saturday_delivery') THEN
    ALTER TABLE acumatica_customers ADD COLUMN saturday_delivery boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'send_dunning_letters_by_email') THEN
    ALTER TABLE acumatica_customers ADD COLUMN send_dunning_letters_by_email boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'send_invoices_by_email') THEN
    ALTER TABLE acumatica_customers ADD COLUMN send_invoices_by_email boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'send_statements_by_email') THEN
    ALTER TABLE acumatica_customers ADD COLUMN send_statements_by_email boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'shipping_address_override') THEN
    ALTER TABLE acumatica_customers ADD COLUMN shipping_address_override text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'shipping_contact_override') THEN
    ALTER TABLE acumatica_customers ADD COLUMN shipping_contact_override text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'shipping_rule') THEN
    ALTER TABLE acumatica_customers ADD COLUMN shipping_rule text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'shipping_terms') THEN
    ALTER TABLE acumatica_customers ADD COLUMN shipping_terms text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'shipping_zone_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN shipping_zone_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'ship_via') THEN
    ALTER TABLE acumatica_customers ADD COLUMN ship_via text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'statement_cycle_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN statement_cycle_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'statement_type') THEN
    ALTER TABLE acumatica_customers ADD COLUMN statement_type text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'tax_registration_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN tax_registration_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'tax_zone') THEN
    ALTER TABLE acumatica_customers ADD COLUMN tax_zone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'warehouse_id') THEN
    ALTER TABLE acumatica_customers ADD COLUMN warehouse_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'acumatica_customers' AND column_name = 'write_off_limit') THEN
    ALTER TABLE acumatica_customers ADD COLUMN write_off_limit numeric;
  END IF;
END $$;