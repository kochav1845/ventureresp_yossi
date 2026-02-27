/*
  # Auto-Update Monthly Tracking from Email Activity

  Connects the email sending/receiving pipeline to the monthly tracking system
  so that sent/received counts and inbound attachments automatically appear
  in the Customer Monthly Email Tracking view.

  1. New Triggers
    - Trigger on `customer_email_logs` INSERT: When an invoice email is sent,
      auto-upserts `customer_monthly_tracking` to increment `emails_sent_count`
      and update `last_email_sent_at`. Uses `customer_id` (acumatica customer ID text).
    - Trigger on `inbound_emails` INSERT: When an email is received from a customer,
      looks up the matching `acumatica_customers` record by sender email, then
      auto-upserts `customer_monthly_tracking` to increment `emails_received_count`
      and update `last_response_at`.

  2. New Trigger on `customer_files` INSERT
    - When an attachment is saved to `customer_files` (by the email-receiver),
      cross-posts it to `customer_monthly_files` so it appears in the monthly view.
      Maps from `customers.id` (UUID) to `acumatica_customers.customer_id` (text)
      via email address matching.

  3. Security
    - Service role policies on `customer_monthly_tracking` and `customer_monthly_files`
      so edge functions (running as service_role) can insert/update records.

  4. Important Notes
    - The `customer_email_logs` trigger uses `customer_id` (text) directly as
      the acumatica customer ID
    - The `inbound_emails` trigger matches sender_email against acumatica_customers
      email_address, general_email, or billing_email fields
    - Monthly tracking status auto-transitions: pending -> active (on send),
      pending/active/sent/no_response -> responded (on receive)
*/

-- 1. Trigger: Auto-update monthly tracking when invoice email is sent
CREATE OR REPLACE FUNCTION update_monthly_tracking_on_email_sent()
RETURNS TRIGGER AS $$
DECLARE
  v_month integer;
  v_year integer;
BEGIN
  IF NEW.status = 'sent' AND NEW.customer_id IS NOT NULL THEN
    v_month := EXTRACT(MONTH FROM COALESCE(NEW.sent_at, now()));
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.sent_at, now()));

    INSERT INTO customer_monthly_tracking (
      acumatica_customer_id, month, year, status,
      emails_sent_count, last_email_sent_at
    ) VALUES (
      NEW.customer_id, v_month, v_year, 'active',
      1, COALESCE(NEW.sent_at, now())
    )
    ON CONFLICT (acumatica_customer_id, month, year)
    DO UPDATE SET
      emails_sent_count = customer_monthly_tracking.emails_sent_count + 1,
      last_email_sent_at = COALESCE(NEW.sent_at, now()),
      status = CASE
        WHEN customer_monthly_tracking.status = 'pending' THEN 'active'
        ELSE customer_monthly_tracking.status
      END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_monthly_tracking_email_sent'
  ) THEN
    CREATE TRIGGER trg_monthly_tracking_email_sent
      AFTER INSERT ON customer_email_logs
      FOR EACH ROW
      EXECUTE FUNCTION update_monthly_tracking_on_email_sent();
  END IF;
END $$;


-- 2. Trigger: Auto-update monthly tracking when inbound email is received
CREATE OR REPLACE FUNCTION update_monthly_tracking_on_email_received()
RETURNS TRIGGER AS $$
DECLARE
  v_acumatica_customer_id text;
  v_month integer;
  v_year integer;
BEGIN
  IF NEW.customer_id IS NOT NULL AND NEW.folder != 'spam' THEN
    SELECT ac.customer_id INTO v_acumatica_customer_id
    FROM acumatica_customers ac
    WHERE LOWER(ac.email_address) = LOWER(NEW.sender_email)
       OR LOWER(ac.general_email) = LOWER(NEW.sender_email)
       OR LOWER(ac.billing_email) = LOWER(NEW.sender_email)
    LIMIT 1;

    IF v_acumatica_customer_id IS NOT NULL THEN
      v_month := EXTRACT(MONTH FROM COALESCE(NEW.received_at, now()));
      v_year := EXTRACT(YEAR FROM COALESCE(NEW.received_at, now()));

      INSERT INTO customer_monthly_tracking (
        acumatica_customer_id, month, year, status,
        emails_received_count, last_response_at
      ) VALUES (
        v_acumatica_customer_id, v_month, v_year, 'responded',
        1, COALESCE(NEW.received_at, now())
      )
      ON CONFLICT (acumatica_customer_id, month, year)
      DO UPDATE SET
        emails_received_count = customer_monthly_tracking.emails_received_count + 1,
        last_response_at = COALESCE(NEW.received_at, now()),
        status = CASE
          WHEN customer_monthly_tracking.status IN ('pending', 'active', 'sent', 'no_response') THEN 'responded'
          ELSE customer_monthly_tracking.status
        END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_monthly_tracking_email_received'
  ) THEN
    CREATE TRIGGER trg_monthly_tracking_email_received
      AFTER INSERT ON inbound_emails
      FOR EACH ROW
      EXECUTE FUNCTION update_monthly_tracking_on_email_received();
  END IF;
END $$;


-- 3. Trigger: Cross-post customer_files attachments to customer_monthly_files
CREATE OR REPLACE FUNCTION crosspost_customer_file_to_monthly()
RETURNS TRIGGER AS $$
DECLARE
  v_acumatica_customer_id text;
  v_customer_email text;
  v_tracking_id uuid;
BEGIN
  IF NEW.upload_source = 'email' THEN
    SELECT c.email INTO v_customer_email
    FROM customers c
    WHERE c.id = NEW.customer_id;

    IF v_customer_email IS NOT NULL THEN
      SELECT ac.customer_id INTO v_acumatica_customer_id
      FROM acumatica_customers ac
      WHERE LOWER(ac.email_address) = LOWER(v_customer_email)
         OR LOWER(ac.general_email) = LOWER(v_customer_email)
         OR LOWER(ac.billing_email) = LOWER(v_customer_email)
      LIMIT 1;
    END IF;

    IF v_acumatica_customer_id IS NOT NULL THEN
      INSERT INTO customer_monthly_tracking (
        acumatica_customer_id, month, year, status
      ) VALUES (
        v_acumatica_customer_id, NEW.month, NEW.year, 'responded'
      )
      ON CONFLICT (acumatica_customer_id, month, year)
      DO UPDATE SET
        status = CASE
          WHEN customer_monthly_tracking.status IN ('pending', 'active', 'sent', 'no_response') THEN 'responded'
          ELSE customer_monthly_tracking.status
        END;

      SELECT id INTO v_tracking_id
      FROM customer_monthly_tracking
      WHERE acumatica_customer_id = v_acumatica_customer_id
        AND month = NEW.month
        AND year = NEW.year;

      INSERT INTO customer_monthly_files (
        tracking_id, acumatica_customer_id, month, year,
        filename, storage_path, file_size, mime_type,
        upload_source, inbound_email_id, uploaded_by
      ) VALUES (
        v_tracking_id, v_acumatica_customer_id, NEW.month, NEW.year,
        NEW.filename, NEW.storage_path, NEW.file_size, NEW.mime_type,
        'email', NEW.inbound_email_id, NEW.uploaded_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crosspost_customer_file_to_monthly'
  ) THEN
    CREATE TRIGGER trg_crosspost_customer_file_to_monthly
      AFTER INSERT ON customer_files
      FOR EACH ROW
      EXECUTE FUNCTION crosspost_customer_file_to_monthly();
  END IF;
END $$;


-- 4. Trigger: Auto-update monthly tracking when outbound reply is sent
CREATE OR REPLACE FUNCTION update_monthly_tracking_on_reply_sent()
RETURNS TRIGGER AS $$
DECLARE
  v_acumatica_customer_id text;
  v_month integer;
  v_year integer;
BEGIN
  IF NEW.sent_to IS NOT NULL THEN
    SELECT ac.customer_id INTO v_acumatica_customer_id
    FROM acumatica_customers ac
    WHERE LOWER(ac.email_address) = LOWER(NEW.sent_to)
       OR LOWER(ac.general_email) = LOWER(NEW.sent_to)
       OR LOWER(ac.billing_email) = LOWER(NEW.sent_to)
    LIMIT 1;

    IF v_acumatica_customer_id IS NOT NULL THEN
      v_month := EXTRACT(MONTH FROM COALESCE(NEW.sent_at, now()));
      v_year := EXTRACT(YEAR FROM COALESCE(NEW.sent_at, now()));

      INSERT INTO customer_monthly_tracking (
        acumatica_customer_id, month, year, status,
        emails_sent_count, last_email_sent_at
      ) VALUES (
        v_acumatica_customer_id, v_month, v_year, 'active',
        1, COALESCE(NEW.sent_at, now())
      )
      ON CONFLICT (acumatica_customer_id, month, year)
      DO UPDATE SET
        emails_sent_count = customer_monthly_tracking.emails_sent_count + 1,
        last_email_sent_at = COALESCE(NEW.sent_at, now()),
        status = CASE
          WHEN customer_monthly_tracking.status = 'pending' THEN 'active'
          ELSE customer_monthly_tracking.status
        END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_monthly_tracking_reply_sent'
  ) THEN
    CREATE TRIGGER trg_monthly_tracking_reply_sent
      AFTER INSERT ON outbound_replies
      FOR EACH ROW
      EXECUTE FUNCTION update_monthly_tracking_on_reply_sent();
  END IF;
END $$;


-- 5. Service role policies so edge functions can manage monthly tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customer_monthly_tracking'
    AND policyname = 'Service role can manage monthly tracking'
  ) THEN
    CREATE POLICY "Service role can manage monthly tracking"
      ON customer_monthly_tracking
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customer_monthly_files'
    AND policyname = 'Service role can manage monthly files'
  ) THEN
    CREATE POLICY "Service role can manage monthly files"
      ON customer_monthly_files
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
