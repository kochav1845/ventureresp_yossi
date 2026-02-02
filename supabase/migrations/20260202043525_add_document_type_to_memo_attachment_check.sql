/*
  # Add Document Type to Invoice Memo Attachment Check Constraint

  1. Issue
    - Check constraint only allows: 'text', 'voice', 'image', 'mixed'
    - Users cannot save memos with document attachments
    - Error: "violates check constraint invoice_memos_attachment_type_check"

  2. Solution
    - Drop existing check constraint
    - Recreate with 'document' added to allowed values

  3. Notes
    - Existing data remains unchanged
    - New memos can now use 'document' as attachment_type
*/

-- Drop the existing check constraint
ALTER TABLE invoice_memos 
DROP CONSTRAINT IF EXISTS invoice_memos_attachment_type_check;

-- Recreate the check constraint with 'document' included
ALTER TABLE invoice_memos 
ADD CONSTRAINT invoice_memos_attachment_type_check 
CHECK (attachment_type = ANY (ARRAY['text'::text, 'voice'::text, 'image'::text, 'document'::text, 'mixed'::text]));
