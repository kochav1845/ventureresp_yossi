/*
  # Fix resolve_proposed_reminder_assignee to properly resolve customer assignments

  ## Problem
  The function compared `collector_customer_assignments.customer_id` (text) with the
  `inbound_emails.customer_id` (uuid). This always returned no results so proposed
  reminders never received an assignee from the customer's collector.

  ## Fix
  Look up the Acumatica text customer_id from `acumatica_customers` using the uuid,
  then match it against `collector_customer_assignments.customer_id`.

  ## Notes
  - Falls back to `default_assignee_id` if no collector assignment is found.
  - Function remains SECURITY DEFINER to bypass RLS during trigger evaluation.
*/

CREATE OR REPLACE FUNCTION public.resolve_proposed_reminder_assignee(
  p_rule proposed_reminder_rules,
  p_customer_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_acumatica_customer_id text;
BEGIN
  IF p_rule.assignee_strategy = 'customer_collector' AND p_customer_id IS NOT NULL THEN
    SELECT customer_id INTO v_acumatica_customer_id
    FROM acumatica_customers
    WHERE id = p_customer_id
    LIMIT 1;

    IF v_acumatica_customer_id IS NOT NULL THEN
      SELECT assigned_collector_id INTO v_user_id
      FROM collector_customer_assignments
      WHERE customer_id = v_acumatica_customer_id
      LIMIT 1;

      IF v_user_id IS NOT NULL THEN
        RETURN v_user_id;
      END IF;
    END IF;
  END IF;

  RETURN p_rule.default_assignee_id;
END;
$function$;
