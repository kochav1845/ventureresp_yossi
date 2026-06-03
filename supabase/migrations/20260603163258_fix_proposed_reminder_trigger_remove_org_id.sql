/*
  # Fix proposed reminder trigger - remove organization_id from invoice_reminders insert

  The invoice_reminders table doesn't have an organization_id column. Org isolation
  is handled via user_id. This drops the column from the trigger's INSERT statement.
*/

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
        proposed_by_rule_id
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
        v_rule.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'evaluate_email_for_proposed_reminders failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
