/*
  # Email-to-Reminder Proposal System

  ## Summary
  Adds a configurable rule engine that automatically proposes reminders when inbound
  emails match admin-defined conditions. Reminders are created with a proposal_status
  of 'pending' and a link back to the source email so collectors can accept, edit,
  or reject them.

  ## New Tables

  ### `proposed_reminder_rules`
  Admin-configurable rules that determine when an inbound email should generate a
  proposed reminder. Each rule has:
  - `rule_type` text: keyword_match, intent_match, sender_domain, has_attachments,
    customer_attribute, gpt_prompt
  - `conditions` jsonb: type-specific match parameters
  - `assignee_strategy` text: customer_collector | rule_default | all_collectors
  - `default_assignee_id` uuid: fallback when strategy can't resolve a user
  - `offset_days` / `offset_hours`: when to schedule the proposed reminder
  - `priority`, `reminder_type`: applied to the proposed reminder
  - `title_template`, `description_template`: support placeholders like
    {sender_email}, {subject}, {customer_name}, {invoice_reference}
  - `gpt_prompt`, `gpt_model`: used when rule_type = gpt_prompt
  - `enabled`, `priority_order`, `organization_id`

  ## Updates

  ### `invoice_reminders`
  Adds proposal-tracking columns:
  - `is_proposed` boolean
  - `source_email_id` uuid REFERENCES inbound_emails(id) ON DELETE SET NULL
  - `proposed_by_rule_id` uuid REFERENCES proposed_reminder_rules(id) ON DELETE SET NULL
  - `proposal_status` text default 'accepted' (pending/accepted/rejected)

  Existing reminders default to 'accepted' so they continue to surface as today.
  user_id is made nullable so unassigned proposals can exist (an admin/collector
  must accept and assign before they become real reminders).

  ## Trigger

  `evaluate_email_for_proposed_reminders` runs AFTER INSERT on `email_analysis`
  (which is populated by email-receiver after the intent classification). It
  iterates enabled rules in `priority_order` and inserts proposed reminders for
  every synchronous rule that matches. GPT-based rules are inserted into the
  `pending_gpt_rule_evaluations` queue for an edge function to process.

  ## New Tables (Queue)

  ### `pending_gpt_rule_evaluations`
  Queue for GPT-based proposed reminder rules. The
  `process-email-for-reminders` edge function consumes this queue.

  ## Security
  - RLS enabled on all new tables
  - `proposed_reminder_rules`: admins/managers in the same org can manage; all
    authenticated users in the same org can view
  - `pending_gpt_rule_evaluations`: service role only
*/

-- =========================================================================
-- 1. proposed_reminder_rules table
-- =========================================================================
CREATE TABLE IF NOT EXISTS proposed_reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  enabled boolean DEFAULT true,
  rule_type text NOT NULL CHECK (rule_type IN (
    'keyword_match',
    'intent_match',
    'sender_domain',
    'has_attachments',
    'customer_attribute',
    'gpt_prompt'
  )),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignee_strategy text NOT NULL DEFAULT 'customer_collector' CHECK (assignee_strategy IN (
    'customer_collector',
    'rule_default',
    'all_collectors'
  )),
  default_assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  offset_days integer NOT NULL DEFAULT 0,
  offset_hours integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  reminder_type text NOT NULL DEFAULT 'follow_up',
  title_template text NOT NULL DEFAULT 'Follow up on email from {sender_email}',
  description_template text DEFAULT '',
  gpt_prompt text DEFAULT '',
  gpt_model text DEFAULT 'gpt-4o-mini',
  priority_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposed_reminder_rules_org
  ON proposed_reminder_rules(organization_id, enabled, priority_order);

ALTER TABLE proposed_reminder_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view proposed reminder rules" ON proposed_reminder_rules;
CREATE POLICY "Org members can view proposed reminder rules"
  ON proposed_reminder_rules FOR SELECT
  TO authenticated
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "Admins can insert proposed reminder rules" ON proposed_reminder_rules;
CREATE POLICY "Admins can insert proposed reminder rules"
  ON proposed_reminder_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('admin', 'manager', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update proposed reminder rules" ON proposed_reminder_rules;
CREATE POLICY "Admins can update proposed reminder rules"
  ON proposed_reminder_rules FOR UPDATE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('admin', 'manager', 'super_admin')
    )
  )
  WITH CHECK (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('admin', 'manager', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete proposed reminder rules" ON proposed_reminder_rules;
CREATE POLICY "Admins can delete proposed reminder rules"
  ON proposed_reminder_rules FOR DELETE
  TO authenticated
  USING (
    organization_id = get_user_org_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role IN ('admin', 'manager', 'super_admin')
    )
  );

-- =========================================================================
-- 2. invoice_reminders columns for proposal tracking
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_reminders' AND column_name = 'is_proposed'
  ) THEN
    ALTER TABLE invoice_reminders ADD COLUMN is_proposed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_reminders' AND column_name = 'source_email_id'
  ) THEN
    ALTER TABLE invoice_reminders ADD COLUMN source_email_id uuid REFERENCES inbound_emails(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_reminders' AND column_name = 'proposed_by_rule_id'
  ) THEN
    ALTER TABLE invoice_reminders ADD COLUMN proposed_by_rule_id uuid REFERENCES proposed_reminder_rules(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_reminders' AND column_name = 'proposal_status'
  ) THEN
    ALTER TABLE invoice_reminders ADD COLUMN proposal_status text DEFAULT 'accepted'
      CHECK (proposal_status IN ('pending', 'accepted', 'rejected'));
  END IF;
END $$;

-- Allow user_id to be NULL so we can have unassigned proposed reminders
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_reminders'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE invoice_reminders ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_proposal
  ON invoice_reminders(proposal_status, is_proposed, reminder_date)
  WHERE is_proposed = true;

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_source_email
  ON invoice_reminders(source_email_id)
  WHERE source_email_id IS NOT NULL;

-- Allow collectors to view proposed reminders that are unassigned or assigned
-- to them. Existing user-owned policies already cover the assigned case.
DROP POLICY IF EXISTS "Org members can view pending proposed reminders" ON invoice_reminders;
CREATE POLICY "Org members can view pending proposed reminders"
  ON invoice_reminders FOR SELECT
  TO authenticated
  USING (
    is_proposed = true
    AND proposal_status = 'pending'
  );

DROP POLICY IF EXISTS "Org members can update pending proposed reminders" ON invoice_reminders;
CREATE POLICY "Org members can update pending proposed reminders"
  ON invoice_reminders FOR UPDATE
  TO authenticated
  USING (
    is_proposed = true
    AND proposal_status = 'pending'
  )
  WITH CHECK (
    is_proposed = true
  );

-- =========================================================================
-- 3. pending_gpt_rule_evaluations queue
-- =========================================================================
CREATE TABLE IF NOT EXISTS pending_gpt_rule_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_email_id uuid NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES proposed_reminder_rules(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_gpt_evals_status
  ON pending_gpt_rule_evaluations(status, created_at);

ALTER TABLE pending_gpt_rule_evaluations ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. Helper: resolve assignee for a rule + customer
-- =========================================================================
CREATE OR REPLACE FUNCTION resolve_proposed_reminder_assignee(
  p_rule proposed_reminder_rules,
  p_customer_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_rule.assignee_strategy = 'customer_collector' AND p_customer_id IS NOT NULL THEN
    SELECT assigned_collector_id INTO v_user_id
    FROM collector_customer_assignments
    WHERE customer_id = p_customer_id
    LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      RETURN v_user_id;
    END IF;
  END IF;

  RETURN p_rule.default_assignee_id;
END;
$$;

-- =========================================================================
-- 5. Helper: render template strings
-- =========================================================================
CREATE OR REPLACE FUNCTION render_reminder_template(
  p_template text,
  p_email inbound_emails,
  p_customer_name text,
  p_invoice_reference text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := COALESCE(p_template, '');
  v_result := REPLACE(v_result, '{sender_email}', COALESCE(p_email.sender_email, ''));
  v_result := REPLACE(v_result, '{subject}', COALESCE(p_email.subject, ''));
  v_result := REPLACE(v_result, '{customer_name}',
    COALESCE(p_customer_name, p_email.acumatica_customer_name, ''));
  v_result := REPLACE(v_result, '{invoice_reference}',
    COALESCE(p_invoice_reference, p_email.acumatica_reference_number, ''));
  RETURN v_result;
END;
$$;

-- =========================================================================
-- 6. Trigger: evaluate rules on email_analysis insert
-- =========================================================================
CREATE OR REPLACE FUNCTION evaluate_email_for_proposed_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email inbound_emails%ROWTYPE;
  v_rule proposed_reminder_rules%ROWTYPE;
  v_customer_name text;
  v_invoice_id uuid;
  v_invoice_reference text;
  v_assignee uuid;
  v_match boolean;
  v_keywords text[];
  v_keyword text;
  v_haystack text;
  v_intents text[];
  v_domains text[];
  v_domain text;
  v_org_id uuid;
  v_reminder_date timestamptz;
  v_attachments_count integer;
BEGIN
  SELECT * INTO v_email FROM inbound_emails WHERE id = NEW.inbound_email_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org_id FROM acumatica_customers WHERE id = v_email.customer_id;

  v_invoice_reference := v_email.acumatica_reference_number;
  IF v_invoice_reference IS NOT NULL THEN
    SELECT id INTO v_invoice_id
    FROM acumatica_invoices
    WHERE reference_number = v_invoice_reference
    LIMIT 1;
  END IF;

  v_customer_name := COALESCE(v_email.acumatica_customer_name, '');

  SELECT COALESCE(jsonb_array_length(v_email.raw_data -> 'attachments'), 0)
    INTO v_attachments_count;

  FOR v_rule IN
    SELECT *
    FROM proposed_reminder_rules
    WHERE enabled = true
      AND (organization_id = v_org_id OR organization_id IS NULL)
    ORDER BY priority_order ASC, created_at ASC
  LOOP
    v_match := false;

    IF v_rule.rule_type = 'keyword_match' THEN
      v_keywords := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_rule.conditions -> 'keywords', '[]'::jsonb)));
      v_haystack := lower(COALESCE(v_email.subject, '') || ' ' || COALESCE(v_email.body, ''));
      FOREACH v_keyword IN ARRAY v_keywords LOOP
        IF position(lower(v_keyword) IN v_haystack) > 0 THEN
          v_match := true;
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_rule.rule_type = 'intent_match' THEN
      v_intents := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_rule.conditions -> 'intents', '[]'::jsonb)));
      IF NEW.detected_intent = ANY(v_intents) THEN
        v_match := true;
      END IF;

    ELSIF v_rule.rule_type = 'sender_domain' THEN
      v_domains := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_rule.conditions -> 'domains', '[]'::jsonb)));
      FOREACH v_domain IN ARRAY v_domains LOOP
        IF v_email.sender_email ILIKE '%@' || v_domain THEN
          v_match := true;
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_rule.rule_type = 'has_attachments' THEN
      IF v_attachments_count > 0 THEN
        v_match := true;
      END IF;

    ELSIF v_rule.rule_type = 'customer_attribute' THEN
      IF v_email.customer_id IS NOT NULL THEN
        IF (v_rule.conditions ? 'requires_matched_customer') AND v_email.customer_id IS NOT NULL THEN
          v_match := true;
        END IF;
      END IF;

    ELSIF v_rule.rule_type = 'gpt_prompt' THEN
      INSERT INTO pending_gpt_rule_evaluations (inbound_email_id, rule_id, organization_id)
      VALUES (v_email.id, v_rule.id, v_org_id);
      CONTINUE;
    END IF;

    IF v_match THEN
      v_assignee := resolve_proposed_reminder_assignee(v_rule, v_email.customer_id);
      v_reminder_date := now() + (v_rule.offset_days * INTERVAL '1 day') + (v_rule.offset_hours * INTERVAL '1 hour');

      INSERT INTO invoice_reminders (
        user_id,
        invoice_id,
        invoice_reference_number,
        reminder_date,
        title,
        description,
        priority,
        reminder_type,
        is_proposed,
        proposal_status,
        source_email_id,
        proposed_by_rule_id,
        organization_id
      ) VALUES (
        v_assignee,
        v_invoice_id,
        v_invoice_reference,
        v_reminder_date,
        render_reminder_template(v_rule.title_template, v_email, v_customer_name, v_invoice_reference),
        render_reminder_template(v_rule.description_template, v_email, v_customer_name, v_invoice_reference),
        v_rule.priority,
        v_rule.reminder_type,
        true,
        'pending',
        v_email.id,
        v_rule.id,
        v_org_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'evaluate_email_for_proposed_reminders failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_email_for_proposed_reminders ON email_analysis;
CREATE TRIGGER trg_evaluate_email_for_proposed_reminders
  AFTER INSERT ON email_analysis
  FOR EACH ROW
  EXECUTE FUNCTION evaluate_email_for_proposed_reminders();
