/*
  # Add Missing RLS Policies

  1. Security
    - Add policies to invoice_memo_attachments table which has RLS enabled but no policies

  2. Note
    - Without policies, the table is completely locked down (no access)
*/

-- Add policies for invoice_memo_attachments
CREATE POLICY "Users can view memo attachments"
  ON invoice_memo_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_memos im
      WHERE im.id = invoice_memo_attachments.memo_id
    )
  );

CREATE POLICY "Users can insert their own memo attachments"
  ON invoice_memo_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoice_memos im
      WHERE im.id = invoice_memo_attachments.memo_id
      AND im.created_by_user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete their own memo attachments"
  ON invoice_memo_attachments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoice_memos im
      WHERE im.id = invoice_memo_attachments.memo_id
      AND im.created_by_user_id = (select auth.uid())
    )
  );
