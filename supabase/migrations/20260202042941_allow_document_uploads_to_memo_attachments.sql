/*
  # Allow Document Uploads to Invoice Memo Attachments

  1. Issue
    - Storage bucket only allows image and audio MIME types
    - Users cannot upload PDFs, Word docs, Excel, or other documents
    - Error: "mime type application/pdf is not supported"

  2. Solution
    - Extend allowed_mime_types to include common document formats:
      - PDF documents (application/pdf)
      - Microsoft Word (.doc, .docx)
      - Microsoft Excel (.xls, .xlsx)
      - Microsoft PowerPoint (.ppt, .pptx)
      - Plain text files (.txt)
      - Email files (.eml, .msg)
      - ZIP archives
      - Other common formats

  3. Security
    - File size limit remains at 10MB per file
    - Only authenticated users can upload (enforced by RLS)
    - Malicious file execution is prevented by serving as downloads
*/

-- Update bucket configuration to allow document uploads
UPDATE storage.buckets
SET 
  allowed_mime_types = ARRAY[
    -- Images
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/webp',
    'image/jpg',
    -- Audio
    'audio/webm', 
    'audio/wav', 
    'audio/mp3', 
    'audio/mpeg', 
    'audio/ogg',
    'audio/mp4',
    -- Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    -- Email files
    'message/rfc822',
    'application/vnd.ms-outlook',
    -- Archives
    'application/zip',
    'application/x-zip-compressed',
    -- Generic fallback for unknown document types
    'application/octet-stream'
  ]
WHERE id = 'invoice-memo-attachments';
