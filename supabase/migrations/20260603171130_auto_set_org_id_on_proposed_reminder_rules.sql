/*
  # Auto-populate organization_id on proposed_reminder_rules insert

  ## Problem
  The INSERT RLS policy on `proposed_reminder_rules` requires
  `organization_id = get_user_org_id()`. The Settings UI form did not include
  an `organization_id` field, so inserts were rejected with "new row violates
  row-level security policy".

  ## Fix
  Add a BEFORE INSERT trigger that fills in `organization_id` from
  `get_user_org_id()` when it is null. This matches the auto-org-id pattern
  used by the other multi-tenant tables in the project.
*/

CREATE OR REPLACE FUNCTION public.set_proposed_reminder_rules_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := get_user_org_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_proposed_reminder_rules_org_id ON public.proposed_reminder_rules;

CREATE TRIGGER trg_set_proposed_reminder_rules_org_id
BEFORE INSERT ON public.proposed_reminder_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_proposed_reminder_rules_org_id();
