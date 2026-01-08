/*
  # Fix Email Subject Normalization
  
  1. Changes
    - Update the normalize_email_subject function to properly remove ALL Re:/Fwd:/Fw: prefixes
    - Re-normalize all existing email subjects to use the corrected logic
  
  2. Purpose
    - Ensure email threading works correctly by properly normalizing subjects
    - Subjects like "Re: Re: Re: test" should normalize to just "test"
*/

-- Update the function to remove ALL Re:/Fwd:/Fw: prefixes iteratively
CREATE OR REPLACE FUNCTION normalize_email_subject(subject text)
RETURNS text AS $$
DECLARE
  normalized text;
BEGIN
  normalized := LOWER(TRIM(subject));
  
  -- Keep removing Re:/Fwd:/Fw: prefixes until none remain
  WHILE normalized ~* '^(re:|fwd:|fw:)\s*' LOOP
    normalized := TRIM(REGEXP_REPLACE(normalized, '^(re:|fwd:|fw:)\s*', '', 'i'));
  END LOOP;
  
  -- Normalize whitespace
  normalized := REGEXP_REPLACE(normalized, '\s+', ' ', 'g');
  
  RETURN TRIM(normalized);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Re-normalize all existing email subjects with the corrected function
UPDATE inbound_emails
SET normalized_subject = normalize_email_subject(subject)
WHERE subject IS NOT NULL;