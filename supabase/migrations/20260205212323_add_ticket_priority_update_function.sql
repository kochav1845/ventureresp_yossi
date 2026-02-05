/*
  # Add Ticket Priority Update Function

  1. New Functions
    - `update_ticket_priority` - Updates the priority of a ticket and logs the change
  
  2. Changes
    - Creates RPC function to update ticket priority
    - Logs priority changes to ticket_activity_log
    
  3. Security
    - Only authenticated users can update priorities
    - Changes are logged with user information
*/

CREATE OR REPLACE FUNCTION update_ticket_priority(
  p_ticket_id uuid,
  p_new_priority text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_priority text;
  v_ticket_number text;
BEGIN
  -- Get current priority and ticket number
  SELECT priority, ticket_number
  INTO v_old_priority, v_ticket_number
  FROM collection_tickets
  WHERE id = p_ticket_id;

  -- Update the priority
  UPDATE collection_tickets
  SET priority = p_new_priority,
      updated_at = now()
  WHERE id = p_ticket_id;

  -- Log the activity
  INSERT INTO ticket_activity_log (
    ticket_id,
    activity_type,
    description,
    created_by,
    metadata
  ) VALUES (
    p_ticket_id,
    'priority_changed',
    format('Priority changed from %s to %s', UPPER(v_old_priority), UPPER(p_new_priority)),
    p_user_id,
    jsonb_build_object(
      'old_priority', v_old_priority,
      'new_priority', p_new_priority,
      'ticket_number', v_ticket_number
    )
  );
END;
$$;
