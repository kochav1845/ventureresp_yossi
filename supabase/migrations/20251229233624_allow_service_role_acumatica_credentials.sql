/*
  # Allow service role to access Acumatica credentials
  
  1. Changes
    - Add policy to allow service_role to read acumatica_sync_credentials
  
  2. Security
    - Service role is a system account used by edge functions
    - This policy is necessary for edge functions to access credentials
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'acumatica_sync_credentials' 
    AND policyname = 'Service role can view credentials'
  ) THEN
    CREATE POLICY "Service role can view credentials"
      ON acumatica_sync_credentials
      FOR SELECT
      TO service_role
      USING (true);
  END IF;
END $$;