/*
  # Add Storage Policies for Payment Check Images

  1. Storage Policies
    - Allow authenticated users to read payment check images
    - Allow service role to upload/manage payment check images

  2. Security
    - Authenticated users can view all payment check images
    - Only service role can upload/delete files
*/

CREATE POLICY "Authenticated users can view payment check images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-check-images');

CREATE POLICY "Service role can upload payment check images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'payment-check-images');

CREATE POLICY "Service role can update payment check images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'payment-check-images')
  WITH CHECK (bucket_id = 'payment-check-images');

CREATE POLICY "Service role can delete payment check images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'payment-check-images');