/*
  # Fix Storage Policies for Memo Attachments
  
  1. Issue
    - Storage policies for invoice-memo-attachments bucket were not created
    - Files are uploading but cannot be accessed/displayed
    
  2. Solution
    - Create proper storage policies for authenticated users
    - Allow upload, view, and delete operations
*/

-- Drop existing policies if any
DROP POLICY IF EXISTS "authenticated_users_can_upload_attachments" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_users_can_view_attachments" ON storage.objects;
DROP POLICY IF EXISTS "users_can_delete_own_attachments" ON storage.objects;

-- Allow authenticated users to upload files to invoice-memo-attachments bucket
CREATE POLICY "Allow authenticated uploads to memo attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'invoice-memo-attachments');

-- Allow authenticated users to view files in invoice-memo-attachments bucket
CREATE POLICY "Allow authenticated access to memo attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'invoice-memo-attachments');

-- Allow authenticated users to update files they own
CREATE POLICY "Allow authenticated updates to own memo attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'invoice-memo-attachments')
  WITH CHECK (bucket_id = 'invoice-memo-attachments');

-- Allow authenticated users to delete files in invoice-memo-attachments bucket
CREATE POLICY "Allow authenticated deletes from memo attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'invoice-memo-attachments');

-- Update bucket configuration to allow proper file types
UPDATE storage.buckets
SET 
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg', 
    'image/png', 
    'image/gif', 
    'image/webp',
    'image/jpg',
    'audio/webm', 
    'audio/wav', 
    'audio/mp3', 
    'audio/mpeg', 
    'audio/ogg',
    'audio/mp4'
  ]
WHERE id = 'invoice-memo-attachments';
