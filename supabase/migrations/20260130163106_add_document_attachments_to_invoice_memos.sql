/*
  # Add Document Attachments to Invoice Memos

  1. Changes
    - Add `document_urls` column to store array of document file paths in storage
    - Add `document_names` column to store array of original document file names
    
  2. Purpose
    - Enable attaching multiple documents to invoice memos
    - Support various file types including PDFs, Word docs, Excel sheets, EML files, etc.
    - Allow users to drag-and-drop documents into memos
    
  3. Notes
    - Existing memo functionality (text, voice, images) remains unchanged
    - Documents stored in same 'invoice-memo-attachments' bucket
    - Each document path and name stored in parallel arrays
*/

-- Add document columns to invoice_memos table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_memos' AND column_name = 'document_urls'
  ) THEN
    ALTER TABLE invoice_memos 
    ADD COLUMN document_urls text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_memos' AND column_name = 'document_names'
  ) THEN
    ALTER TABLE invoice_memos 
    ADD COLUMN document_names text[];
  END IF;
END $$;

COMMENT ON COLUMN invoice_memos.document_urls IS 
  'Array of document file paths in storage (PDFs, Word, Excel, EML, etc.)';

COMMENT ON COLUMN invoice_memos.document_names IS 
  'Array of original document file names for display';
