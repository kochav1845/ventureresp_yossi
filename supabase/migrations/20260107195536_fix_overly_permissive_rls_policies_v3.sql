/*
  # Fix Overly Permissive RLS Policies

  1. Security Improvements
    - Replace policies with USING (true) or WITH CHECK (true) with proper permission checks
    - Use inline role checks for better performance

  2. Tables Fixed
    - acumatica_customers: restrict insert/update to users with permission
    - acumatica_payments: restrict insert/update/delete to users with permission
    - acumatica_documents: restrict modifications to users with permission
    - payment_invoice_applications: restrict modifications to users with permission
    - invoice_memos: restrict insert to users with permission
    - outbound_replies: restrict insert to authenticated users with email permission
*/

-- Fix acumatica_customers policies
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON acumatica_customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON acumatica_customers;

CREATE POLICY "Users can insert customers if they have permission"
  ON acumatica_customers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can update customers with permission"
  ON acumatica_customers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  );

-- Fix acumatica_payments policies
DROP POLICY IF EXISTS "Authenticated users can insert payments" ON acumatica_payments;
DROP POLICY IF EXISTS "Authenticated users can update payments" ON acumatica_payments;
DROP POLICY IF EXISTS "Authenticated users can delete payments" ON acumatica_payments;

CREATE POLICY "Users can insert payments if they have permission"
  ON acumatica_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can update payments with permission"
  ON acumatica_payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can delete payments if they have permission"
  ON acumatica_payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role = 'admin'
    )
  );

-- Fix acumatica_documents policies
DROP POLICY IF EXISTS "Authenticated users can insert acumatica documents" ON acumatica_documents;
DROP POLICY IF EXISTS "Authenticated users can update acumatica documents" ON acumatica_documents;
DROP POLICY IF EXISTS "Authenticated users can delete acumatica documents" ON acumatica_documents;

CREATE POLICY "Users can insert documents if they have permission"
  ON acumatica_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can update documents if they have permission"
  ON acumatica_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can delete documents if they have permission"
  ON acumatica_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role = 'admin'
    )
  );

-- Fix payment_invoice_applications policies
DROP POLICY IF EXISTS "Authenticated users can insert payment-invoice applications" ON payment_invoice_applications;
DROP POLICY IF EXISTS "Authenticated users can update payment-invoice applications" ON payment_invoice_applications;
DROP POLICY IF EXISTS "Authenticated users can delete payment-invoice applications" ON payment_invoice_applications;

CREATE POLICY "Users can insert payment applications if they have permission"
  ON payment_invoice_applications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can update payment applications if they have permission"
  ON payment_invoice_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can delete payment applications if they have permission"
  ON payment_invoice_applications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role = 'admin'
    )
  );

-- Fix invoice_memos policies
DROP POLICY IF EXISTS "authenticated_users_can_insert_memos" ON invoice_memos;

CREATE POLICY "authenticated_users_can_insert_memos"
  ON invoice_memos FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = (select auth.uid())
  );

-- Fix outbound_replies policies
DROP POLICY IF EXISTS "Authenticated users can insert replies" ON outbound_replies;

CREATE POLICY "Authenticated users can insert replies"
  ON outbound_replies FOR INSERT
  TO authenticated
  WITH CHECK (
    sent_by = (select auth.uid())
  );

-- Fix payment_attachments policies
DROP POLICY IF EXISTS "Authenticated users can insert payment attachments" ON payment_attachments;
DROP POLICY IF EXISTS "Authenticated users can update payment attachments" ON payment_attachments;

CREATE POLICY "Users can insert payment attachments if they have permission"
  ON payment_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  );

CREATE POLICY "Users can update payment attachments if they have permission"
  ON payment_attachments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  );

-- Fix invoice_current_status policies
DROP POLICY IF EXISTS "Users can update invoice status" ON invoice_current_status;

CREATE POLICY "Users can update invoice status"
  ON invoice_current_status FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = (select auth.uid()) 
      AND role IN ('admin', 'manager', 'collector')
    )
  );
