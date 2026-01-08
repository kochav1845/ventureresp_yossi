/*
  # Setup Invoice Reminder Cron Job

  ## Summary
  Creates a cron job that runs every minute to check for due invoice reminders
  and trigger notifications for users.

  ## Details
  - Runs every minute via pg_cron
  - Calls the check-invoice-reminders edge function
  - Creates notifications for users when reminders are due
  - Marks reminders as triggered after processing

  ## Important Notes
  - pg_cron extension must be enabled (already enabled in previous migrations)
  - Uses pg_net for HTTP requests
  - Runs with service role permissions
*/

-- Try to unschedule existing reminder check job if it exists (ignore errors)
DO $$
BEGIN
  PERFORM cron.unschedule('check-invoice-reminders-every-minute');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule the reminder check to run every minute
SELECT cron.schedule(
  'check-invoice-reminders-every-minute',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.api_url', true) || '/functions/v1/check-invoice-reminders'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Create a function to manually trigger reminder checks (for testing)
CREATE OR REPLACE FUNCTION trigger_invoice_reminder_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT
    net.http_post(
      url := current_setting('app.settings.api_url', true) || '/functions/v1/check-invoice-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) INTO result;
  
  RETURN jsonb_build_object(
    'success', true,
    'request_id', result,
    'message', 'Reminder check triggered manually'
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION trigger_invoice_reminder_check() TO authenticated;

-- Add comment
COMMENT ON FUNCTION trigger_invoice_reminder_check() IS 'Manually trigger invoice reminder check for testing purposes';
