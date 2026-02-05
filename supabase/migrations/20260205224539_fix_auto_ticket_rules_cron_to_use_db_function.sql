/*
  # Fix Auto-Ticket Rules Cron Job

  1. Updates the cron job to use the database function instead of edge function
  2. This fixes the issue with missing configuration parameters
  3. Runs at 6:00 AM daily
*/

-- Remove the old cron job
SELECT cron.unschedule('process-auto-ticket-rules-daily');

-- Create new cron job using the database function
SELECT cron.schedule(
  'process-auto-ticket-rules-daily',
  '0 6 * * *',
  'SELECT process_auto_ticket_rules();'
);
