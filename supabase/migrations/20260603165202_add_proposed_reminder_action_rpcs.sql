/*
  # Add RPC functions for managing proposed reminders

  ## What this adds
  Two helper RPCs callers use from the UI:
    - `accept_proposed_reminder(p_id, p_user_id, p_reminder_date)` — converts a
      proposed reminder into a real one assigned to the caller (or specified user),
      clears the proposal flags, and lets the user override the date.
    - `dismiss_proposed_reminder(p_id)` — marks the proposal as dismissed without
      creating a real reminder.

  ## Security
  Both functions are SECURITY INVOKER and rely on the existing RLS policies on
  `invoice_reminders` to enforce who is allowed to take action. They only operate
  on rows where `is_proposed = true`.
*/

CREATE OR REPLACE FUNCTION public.accept_proposed_reminder(
  p_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_reminder_date timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_existing invoice_reminders%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM invoice_reminders WHERE id = p_id AND is_proposed = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposed reminder not found: %', p_id;
  END IF;

  v_target_user := COALESCE(p_user_id, auth.uid());

  UPDATE invoice_reminders
  SET
    is_proposed = false,
    proposal_status = 'accepted',
    user_id = v_target_user,
    reminder_date = COALESCE(p_reminder_date, reminder_date),
    status = 'pending',
    updated_at = now()
  WHERE id = p_id;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_proposed_reminder(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE invoice_reminders
  SET
    proposal_status = 'dismissed',
    updated_at = now()
  WHERE id = p_id AND is_proposed = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_proposed_reminder(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_proposed_reminder(uuid) TO authenticated;
