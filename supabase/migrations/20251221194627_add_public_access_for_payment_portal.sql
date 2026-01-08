/*
  # Add Public Access for Payment Portal

  1. Changes
    - Add policy to allow anonymous users to view invoices
    - Add policy to allow anonymous users to view customers (needed for email lookup)
    - These policies enable the public payment portal to function

  2. Security Notes
    - Only SELECT permissions are granted
    - This allows customers to view and pay their invoices without authentication
    - No write permissions are granted to anonymous users
*/

-- Allow anonymous users to view invoices for payment portal
CREATE POLICY "Public users can view invoices for payment"
  ON acumatica_invoices
  FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view customers for email lookup
CREATE POLICY "Public users can view customers for lookup"
  ON acumatica_customers
  FOR SELECT
  TO anon
  USING (true);
