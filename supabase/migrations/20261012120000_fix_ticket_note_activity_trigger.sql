/*
  # Fix log_ticket_note_activity() — it referenced columns ticket_notes doesn't have

  The AFTER INSERT OR UPDATE OR DELETE trigger on ticket_notes read
  NEW.user_id / OLD.user_id and NEW.note_type. ticket_notes has neither: the
  author column is `created_by_user_id`, and there is no note_type at all.

  Every one of those branches therefore raised
      record "new" has no field "user_id"
  which means:

  - adding or editing a note on a ticket has been failing outright, and
  - DELETING any ticket that has notes has been failing too, because the
    cascade into ticket_notes fires this trigger.

  The second one is how it was found — clearing the ticket history errored on
  the first ticket that had a note attached.

  user_activity_logs.user_id is nullable, so a note whose author is unknown
  still logs rather than blocking the write. The activity log is bookkeeping;
  it must never be the reason a note or a ticket can't be saved or removed,
  so the whole body is wrapped to swallow its own failures.
*/

CREATE OR REPLACE FUNCTION public.log_ticket_note_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_customer_name text;
BEGIN
  BEGIN
    SELECT customer_name INTO v_customer_name
      FROM collection_tickets
     WHERE id = COALESCE(NEW.ticket_id, OLD.ticket_id);

    IF (TG_OP = 'INSERT') THEN
      INSERT INTO user_activity_logs (user_id, action_type, entity_type, entity_id, details)
      VALUES (
        NEW.created_by_user_id,
        'ticket_note_added',
        'collection_ticket',
        NEW.ticket_id::text,
        jsonb_build_object(
          'customer_name', v_customer_name,
          'note_preview', LEFT(COALESCE(NEW.note_text, ''), 100)
        )
      );

    ELSIF (TG_OP = 'UPDATE') THEN
      INSERT INTO user_activity_logs (user_id, action_type, entity_type, entity_id, details)
      VALUES (
        NEW.created_by_user_id,
        'ticket_note_updated',
        'collection_ticket',
        NEW.ticket_id::text,
        jsonb_build_object(
          'customer_name', v_customer_name,
          'note_preview', LEFT(COALESCE(NEW.note_text, ''), 100)
        )
      );

    ELSIF (TG_OP = 'DELETE') THEN
      INSERT INTO user_activity_logs (user_id, action_type, entity_type, entity_id, details)
      VALUES (
        OLD.created_by_user_id,
        'ticket_note_deleted',
        'collection_ticket',
        OLD.ticket_id::text,
        jsonb_build_object('customer_name', v_customer_name)
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Logging is not worth losing the write over.
    RAISE WARNING 'log_ticket_note_activity failed (%): %', TG_OP, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
