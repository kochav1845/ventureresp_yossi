/*
  # Enforce Organization Isolation on Core Tables

  1. Changes
    - Drop overly permissive RLS policies on acumatica_customers, acumatica_invoices, acumatica_payments
    - Create new org-aware RLS policies that only allow users to see data belonging to their organization
    - Create a helper function to get the current user's organization_id

  2. Security
    - Users can only SELECT/UPDATE/INSERT/DELETE data within their own organization
    - Service role bypasses RLS as usual for sync operations
    - Super admins can see all data
*/

-- Helper function to get current user's org
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM user_profiles WHERE id = auth.uid();
$$;

-- ============================================
-- ACUMATICA_CUSTOMERS
-- ============================================

-- Drop all existing SELECT policies
DROP POLICY IF EXISTS "Authenticated users can read customers" ON acumatica_customers;
DROP POLICY IF EXISTS "Public users can view customers for lookup" ON acumatica_customers;
DROP POLICY IF EXISTS "Users can view customers if they have permission" ON acumatica_customers;

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Users can edit customers if they have permission" ON acumatica_customers;
DROP POLICY IF EXISTS "Users can update customers with permission" ON acumatica_customers;

-- Drop existing INSERT policies
DROP POLICY IF EXISTS "Users can insert customers if they have permission" ON acumatica_customers;

-- New org-aware policies
CREATE POLICY "Users can view own org customers"
  ON acumatica_customers FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org customers"
  ON acumatica_customers FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can insert into own org customers"
  ON acumatica_customers FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

-- ============================================
-- ACUMATICA_INVOICES
-- ============================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Admin users can delete invoices" ON acumatica_invoices;
DROP POLICY IF EXISTS "Admin users can insert invoices" ON acumatica_invoices;
DROP POLICY IF EXISTS "Admin users can update invoices" ON acumatica_invoices;
DROP POLICY IF EXISTS "Admin users can view all invoices" ON acumatica_invoices;
DROP POLICY IF EXISTS "Public users can view invoices for payment" ON acumatica_invoices;
DROP POLICY IF EXISTS "Users can edit invoices if they have permission" ON acumatica_invoices;
DROP POLICY IF EXISTS "Users can view invoices if they have permission" ON acumatica_invoices;

-- New org-aware policies
CREATE POLICY "Users can view own org invoices"
  ON acumatica_invoices FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org invoices"
  ON acumatica_invoices FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can insert into own org invoices"
  ON acumatica_invoices FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can delete own org invoices"
  ON acumatica_invoices FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================
-- ACUMATICA_PAYMENTS
-- ============================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can read payments" ON acumatica_payments;
DROP POLICY IF EXISTS "Users can delete payments if they have permission" ON acumatica_payments;
DROP POLICY IF EXISTS "Users can edit payments if they have permission" ON acumatica_payments;
DROP POLICY IF EXISTS "Users can insert payments if they have permission" ON acumatica_payments;
DROP POLICY IF EXISTS "Users can update payments with permission" ON acumatica_payments;
DROP POLICY IF EXISTS "Users can view payments if they have permission" ON acumatica_payments;

-- New org-aware policies
CREATE POLICY "Users can view own org payments"
  ON acumatica_payments FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org payments"
  ON acumatica_payments FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can insert into own org payments"
  ON acumatica_payments FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can delete own org payments"
  ON acumatica_payments FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());
