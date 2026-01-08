/*
  # Fix Incorrect Triggers on acumatica_invoices Table
  
  ## Problem
  Two triggers on `acumatica_invoices` are causing sync failures:
  - `invoice_status_change_trigger` - tries to access `last_updated_by` field that doesn't exist
  - `update_invoice_last_modified_on_status_trigger` - tries to set `last_modified_by` fields that don't exist
  
  These triggers were incorrectly attached to `acumatica_invoices` when they should only be on `invoice_current_status`.
  
  ## Solution
  1. Drop both incorrect triggers from `acumatica_invoices`
  2. Ensure triggers only exist on `invoice_current_status` where the required fields exist
  
  ## Impact
  - Fixes 48 invoice sync errors
  - Allows bulk invoice fetches to complete successfully
*/

-- Drop incorrect triggers from acumatica_invoices table
DROP TRIGGER IF EXISTS invoice_status_change_trigger ON acumatica_invoices;
DROP TRIGGER IF EXISTS update_invoice_last_modified_on_status_trigger ON acumatica_invoices;

-- Ensure the triggers exist on the correct table (invoice_current_status)
-- The log_invoice_status_change trigger should already exist from previous migration
DROP TRIGGER IF EXISTS trigger_log_invoice_status ON invoice_current_status;
CREATE TRIGGER trigger_log_invoice_status
  AFTER INSERT OR UPDATE ON invoice_current_status
  FOR EACH ROW
  EXECUTE FUNCTION log_invoice_status_change();

-- Note: acumatica_invoices should have NO triggers
-- It's a pure data sync table from Acumatica API
