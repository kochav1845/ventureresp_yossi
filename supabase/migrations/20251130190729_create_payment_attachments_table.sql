/*
  # Create Payment Attachments Table

  1. New Tables
    - `payment_attachments`
      - `id` (uuid, primary key)
      - `payment_id` (uuid, foreign key to acumatica_payments)
      - `payment_reference_number` (text, indexed)
      - `file_id` (text) - Acumatica file ID
      - `file_name` (text) - Original filename from Acumatica
      - `file_type` (text) - MIME type
      - `file_size` (integer) - Size in bytes
      - `storage_path` (text) - Path in Supabase Storage
      - `is_check_image` (boolean) - Whether this is a check image
      - `check_side` (text) - 'front', 'back', or null
      - `converted_from_pdf` (boolean) - Whether we converted from PDF to JPG
      - `synced_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Storage
    - Create `payment-check-images` storage bucket with RLS

  3. Security
    - Enable RLS on `payment_attachments` table
    - Add policies for authenticated users to view their attachments
*/

-- Create payment attachments table
CREATE TABLE IF NOT EXISTS payment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES acumatica_payments(id) ON DELETE CASCADE,
  payment_reference_number text NOT NULL,
  file_id text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size integer,
  storage_path text NOT NULL,
  is_check_image boolean DEFAULT false,
  check_side text,
  converted_from_pdf boolean DEFAULT false,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(payment_reference_number, file_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_attachments_payment_id ON payment_attachments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attachments_reference_number ON payment_attachments(payment_reference_number);

-- Enable RLS
ALTER TABLE payment_attachments ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can view payment attachments"
  ON payment_attachments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert payment attachments"
  ON payment_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update payment attachments"
  ON payment_attachments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create storage bucket for check images
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-check-images', 'payment-check-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for authenticated users
CREATE POLICY "Authenticated users can view check images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-check-images');

CREATE POLICY "Authenticated users can upload check images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'payment-check-images');

CREATE POLICY "Authenticated users can update check images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'payment-check-images')
  WITH CHECK (bucket_id = 'payment-check-images');

CREATE POLICY "Authenticated users can delete check images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'payment-check-images');
