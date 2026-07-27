/*
  # Fix: creating a ticket violated RLS on the audit tables

  Two audit triggers on collection_tickets write rows into RLS-protected tables
  but ran with the caller's (invoker) rights, so the audit insert was rejected
  and the whole ticket creation rolled back:

  1. log_collection_ticket_activity -> user_activity_logs. On INSERT it set
     user_id = COALESCE(NEW.assigned_collector_id, auth.uid()); a ticket assigned
     to a DIFFERENT collector logged user_id = that collector, but the INSERT
     policy requires (auth.uid() = user_id) -> "new row violates row-level
     security policy for table user_activity_logs".

  2. log_ticket_status_change -> ticket_activity_log. On INSERT it set
     created_by = NEW.created_by, which likewise fails that table's INSERT policy
     when it is not the caller -> "... for table ticket_activity_log". (This one
     only surfaced once #1 was fixed, since #1 fires first.)

  Both are audit triggers, so they should run with definer rights. Recreating
  them as SECURITY DEFINER (owner = postgres, which bypasses RLS) lets the audit
  rows be written regardless of who the ticket is assigned to / created by, while
  preserving the existing attribution. auth.uid() still resolves to the calling
  user, so nothing about attribution changes. Bodies are otherwise unchanged.
*/

CREATE OR REPLACE FUNCTION public.log_collection_ticket_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
v_invoice_count integer := 0;
BEGIN
IF (TG_OP = 'INSERT') THEN
SELECT COUNT(*) INTO v_invoice_count
FROM ticket_invoices
WHERE ticket_id = NEW.id;

INSERT INTO user_activity_logs (
user_id, action_type, entity_type, entity_id, details
)
VALUES (
COALESCE(NEW.assigned_collector_id, auth.uid()),
'ticket_created',
'collection_ticket',
NEW.id::text,
jsonb_build_object(
'customer_id', NEW.customer_id,
'customer_name', NEW.customer_name,
'ticket_type', NEW.ticket_type,
'status', NEW.status,
'priority', NEW.priority,
'invoice_count', v_invoice_count
)
);
ELSIF (TG_OP = 'UPDATE') THEN
IF (OLD.status IS DISTINCT FROM NEW.status) THEN
INSERT INTO user_activity_logs (
user_id, action_type, entity_type, entity_id, details
)
VALUES (
COALESCE(auth.uid(), NEW.assigned_collector_id),
CASE
WHEN NEW.status = 'closed' THEN 'ticket_closed'
WHEN OLD.status = 'closed' AND NEW.status != 'closed' THEN 'ticket_reopened'
ELSE 'ticket_status_changed'
END,
'collection_ticket',
NEW.id::text,
jsonb_build_object(
'customer_name', NEW.customer_name,
'old_status', OLD.status,
'new_status', NEW.status
)
);
END IF;

IF (OLD.priority IS DISTINCT FROM NEW.priority) THEN
INSERT INTO user_activity_logs (
user_id, action_type, entity_type, entity_id, details
)
VALUES (
COALESCE(auth.uid(), NEW.assigned_collector_id),
'ticket_priority_changed',
'collection_ticket',
NEW.id::text,
jsonb_build_object(
'customer_name', NEW.customer_name,
'old_priority', OLD.priority,
'new_priority', NEW.priority
)
);
END IF;

IF (OLD.assigned_collector_id IS DISTINCT FROM NEW.assigned_collector_id) THEN
INSERT INTO user_activity_logs (
user_id, action_type, entity_type, entity_id, details
)
VALUES (
COALESCE(auth.uid(), NEW.assigned_collector_id),
'ticket_reassigned',
'collection_ticket',
NEW.id::text,
jsonb_build_object(
'customer_name', NEW.customer_name,
'old_assignee', OLD.assigned_collector_id,
'new_assignee', NEW.assigned_collector_id
)
);
END IF;

IF (OLD.promise_date IS DISTINCT FROM NEW.promise_date) THEN
INSERT INTO user_activity_logs (
user_id, action_type, entity_type, entity_id, details
)
VALUES (
COALESCE(auth.uid(), NEW.assigned_collector_id),
'ticket_promise_date_set',
'collection_ticket',
NEW.id::text,
jsonb_build_object(
'customer_name', NEW.customer_name,
'old_promise_date', OLD.promise_date,
'new_promise_date', NEW.promise_date
)
);
END IF;
END IF;

RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_ticket_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by)
VALUES (NEW.id, OLD.status, NEW.status, auth.uid());

INSERT INTO ticket_activity_log (ticket_id, activity_type, description, created_by, metadata)
VALUES (
NEW.id,
'status_change',
'Status changed from ' || OLD.status || ' to ' || NEW.status,
auth.uid(),
jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
);
END IF;

IF (TG_OP = 'INSERT') THEN
INSERT INTO ticket_activity_log (ticket_id, activity_type, description, created_by, metadata)
VALUES (
NEW.id,
'created',
'Ticket created',
NEW.created_by,
jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'ticket_type', NEW.ticket_type)
);
END IF;

RETURN NEW;
END;
$function$;
