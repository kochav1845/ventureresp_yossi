/*
  # Create Storage Bucket for Customer Files

  ## Overview
  This migration creates a Supabase Storage bucket for storing customer file uploads
  organized by customer ID, year, and month.

  ## Storage Bucket
  - Bucket name: `customer-files`
  - Public: false (requires authentication)
  - File size limit: 50MB per file
  - Allowed MIME types: PDF, images, Excel, Word documents, text files

  ## Storage Policies
  - Admins can upload, view, update, and delete all files
  - Customers can upload files to their own folder
  - Customers can view files in their own folder
  - Service role can upload files (for webhook)

  ## Organization
  Files are stored in paths: {customer_id}/{year}/{month}/{filename}
*/

-- Create the customer_files storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-files',
  'customer-files',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DO $$
BEGIN
  DROP POLICY IF EXISTS "Admins can view all customer files" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can upload customer files" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can update customer files" ON storage.objects;
  DROP POLICY IF EXISTS "Admins can delete customer files" ON storage.objects;
  DROP POLICY IF EXISTS "Service role can upload customer files" ON storage.objects;
  DROP POLICY IF EXISTS "Customers can view their own files" ON storage.objects;
  DROP POLICY IF EXISTS "Customers can upload their own files" ON storage.objects;
END $$;

-- Storage policy: Admins can view all files
CREATE POLICY "Admins can view all customer files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Storage policy: Admins can upload files anywhere
CREATE POLICY "Admins can upload customer files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-files'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Storage policy: Admins can update files
CREATE POLICY "Admins can update customer files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Storage policy: Admins can delete files
CREATE POLICY "Admins can delete customer files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Storage policy: Service role can upload files (for webhooks)
CREATE POLICY "Service role can upload customer files"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (
  bucket_id = 'customer-files'
);

-- Storage policy: Customers can view their own files
CREATE POLICY "Customers can view their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-files'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text
    FROM customers c
    INNER JOIN user_profiles up ON up.email = c.email
    WHERE up.id = auth.uid()
  )
);

-- Storage policy: Customers can upload to their own folder
CREATE POLICY "Customers can upload their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-files'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text
    FROM customers c
    INNER JOIN user_profiles up ON up.email = c.email
    WHERE up.id = auth.uid()
  )
);
