/*
  # Enforce Organization Isolation on Related Tables

  1. Changes
    - Fix RLS on payment_invoice_applications
    - Fix RLS on collection_tickets
    - Fix RLS on cached_customer_balances
    - Fix RLS on invoice_memos (uses customer_id to join to org)

  2. Security
    - All tables now only return data for the user's organization
*/

-- ============================================
-- PAYMENT_INVOICE_APPLICATIONS
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read all payment-invoice applications" ON payment_invoice_applications;
DROP POLICY IF EXISTS "Users can view payment applications if they have permission" ON payment_invoice_applications;
DROP POLICY IF EXISTS "Users can delete payment applications if they have permission" ON payment_invoice_applications;
DROP POLICY IF EXISTS "Users can insert payment applications if they have permission" ON payment_invoice_applications;
DROP POLICY IF EXISTS "Users can update payment applications if they have permission" ON payment_invoice_applications;

CREATE POLICY "Users can view own org payment applications"
  ON payment_invoice_applications FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert own org payment applications"
  ON payment_invoice_applications FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org payment applications"
  ON payment_invoice_applications FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can delete own org payment applications"
  ON payment_invoice_applications FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================
-- COLLECTION_TICKETS
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all tickets" ON collection_tickets;
DROP POLICY IF EXISTS "Collectors can update their assigned tickets" ON collection_tickets;
DROP POLICY IF EXISTS "Collectors can view their assigned tickets" ON collection_tickets;
DROP POLICY IF EXISTS "Users can create tickets if they have permission" ON collection_tickets;
DROP POLICY IF EXISTS "Users can edit tickets if they have permission" ON collection_tickets;
DROP POLICY IF EXISTS "Users can view tickets if they have permission" ON collection_tickets;

CREATE POLICY "Users can view own org tickets"
  ON collection_tickets FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can insert own org tickets"
  ON collection_tickets FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can update own org tickets"
  ON collection_tickets FOR UPDATE
  TO authenticated
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Users can delete own org tickets"
  ON collection_tickets FOR DELETE
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================
-- CACHED_CUSTOMER_BALANCES
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cached_customer_balances' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE cached_customer_balances ADD COLUMN organization_id uuid;
  END IF;
END $$;

UPDATE cached_customer_balances cb
SET organization_id = c.organization_id
FROM acumatica_customers c
WHERE cb.customer_id = c.customer_id
AND cb.organization_id IS NULL;

DROP POLICY IF EXISTS "Authenticated users can read cached customer balances" ON cached_customer_balances;

CREATE POLICY "Users can view own org cached balances"
  ON cached_customer_balances FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

-- ============================================
-- INVOICE_MEMOS
-- ============================================
DROP POLICY IF EXISTS "Users can create memos if they have permission" ON invoice_memos;
DROP POLICY IF EXISTS "Users can delete their own memos" ON invoice_memos;
DROP POLICY IF EXISTS "Users can edit their own memos" ON invoice_memos;
DROP POLICY IF EXISTS "Users can view memos if they have permission" ON invoice_memos;
DROP POLICY IF EXISTS "authenticated_users_can_insert_memos" ON invoice_memos;
DROP POLICY IF EXISTS "authenticated_users_can_view_memos" ON invoice_memos;

CREATE POLICY "Users can view memos for own org"
  ON invoice_memos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acumatica_customers c
      WHERE c.customer_id = invoice_memos.customer_id
      AND c.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert memos for own org"
  ON invoice_memos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acumatica_customers c
      WHERE c.customer_id = invoice_memos.customer_id
      AND c.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can update own memos"
  ON invoice_memos FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Users can delete own memos"
  ON invoice_memos FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());
