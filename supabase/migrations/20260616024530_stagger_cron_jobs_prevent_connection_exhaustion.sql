-- Stagger heavy cron jobs to prevent connection pool exhaustion (PGRST002 errors)

-- Move customer stats refresh to minutes 2,7,12,17,22,27,32,37,42,47,52,57
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh-customer-stats'),
  schedule := '2,7,12,17,22,27,32,37,42,47,52,57 * * * *'
);

-- Move payment month summary to minutes 3,13,23,33,43,53
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh-payment-month-summary'),
  schedule := '3,13,23,33,43,53 * * * *'
);

-- Move auto-red-status-checker to minutes 4,9,14,19,24,29,34,39,44,49,54,59
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'auto-red-status-checker'),
  schedule := '4,9,14,19,24,29,34,39,44,49,54,59 * * * *'
);

-- Move reminder emails to minutes 1,6,11,16,21,26,31,36,41,46,51,56
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'send-reminder-emails-every-5-minutes'),
  schedule := '1,6,11,16,21,26,31,36,41,46,51,56 * * * *'
);

-- Move invoice month summary refresh to minute 20 instead of 15
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh-invoice-month-summary-hourly'),
  schedule := '20 * * * *'
);

-- Move invoice analytics to minute 40 instead of 30 
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'refresh-invoice-analytics'),
  schedule := '40 * * * *'
);

-- Move auto-close-paid-tickets to minutes 8,18,28,38,48,58
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'auto-close-paid-tickets'),
  schedule := '8,18,28,38,48,58 * * * *'
);