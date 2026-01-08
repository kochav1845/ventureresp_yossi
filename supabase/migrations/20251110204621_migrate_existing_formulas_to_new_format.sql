/*
  # Migrate Existing Email Formulas to New Format

  ## Summary
  This migration converts any existing email formulas from the old structure to the new structure.

  ## Changes Made
  
  1. **Convert schedule structure**
     - Old: [{ day: 1, frequency: 2 }]
     - New: [{ day: 1, times: ["09:00:00", "15:00:00"] }]
     - For each frequency count, create default times at 9 AM, 12 PM, 3 PM, 6 PM pattern
  
  ## Important Notes
  - This is a one-time migration for existing data
  - New formulas will use the new structure from creation
  - Default times are assigned based on frequency count
*/

-- Update existing formulas to convert frequency to times array
DO $$
DECLARE
  formula_record RECORD;
  new_schedule jsonb;
  schedule_item jsonb;
  times_array jsonb;
  freq integer;
  i integer;
BEGIN
  FOR formula_record IN SELECT id, schedule FROM email_formulas LOOP
    new_schedule := '[]'::jsonb;
    
    -- Loop through each day in the schedule
    FOR schedule_item IN SELECT * FROM jsonb_array_elements(formula_record.schedule) LOOP
      -- Check if this is old format (has 'frequency' field)
      IF schedule_item ? 'frequency' THEN
        freq := (schedule_item->>'frequency')::integer;
        times_array := '[]'::jsonb;
        
        -- Generate default times based on frequency
        -- 1 frequency: 09:00
        -- 2 frequency: 09:00, 15:00
        -- 3 frequency: 09:00, 12:00, 15:00
        -- 4+ frequency: 09:00, 12:00, 15:00, 18:00
        FOR i IN 1..LEAST(freq, 4) LOOP
          CASE i
            WHEN 1 THEN times_array := times_array || '"09:00:00"'::jsonb;
            WHEN 2 THEN times_array := times_array || '"15:00:00"'::jsonb;
            WHEN 3 THEN times_array := times_array || '"12:00:00"'::jsonb;
            WHEN 4 THEN times_array := times_array || '"18:00:00"'::jsonb;
          END CASE;
        END LOOP;
        
        -- Create new schedule item with times instead of frequency
        new_schedule := new_schedule || jsonb_build_object(
          'day', schedule_item->>'day',
          'times', times_array
        );
      ELSE
        -- Already in new format, keep as is
        new_schedule := new_schedule || schedule_item;
      END IF;
    END LOOP;
    
    -- Update the formula with new schedule
    UPDATE email_formulas 
    SET schedule = new_schedule 
    WHERE id = formula_record.id;
  END LOOP;
END $$;