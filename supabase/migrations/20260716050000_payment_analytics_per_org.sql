-- Payment analytics cache was global (no org column), so cached_payment_analytics
-- summed BOTH tenants together (e.g. Jan 2026 showed $6.0M = both orgs, when the
-- main org is $2.95M). Partition the whole pipeline by organization.

ALTER TABLE cached_payment_analytics ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS idx_cpa_org_period ON cached_payment_analytics(organization_id, period_type, year, month, day);

-- RPC now scoped to one org
DROP FUNCTION IF EXISTS get_payments_for_analytics(date, date, text[]);
CREATE OR REPLACE FUNCTION public.get_payments_for_analytics(p_start_date date, p_end_date date, p_excluded_types text[], p_org_id uuid)
 RETURNS TABLE(effective_date text, payment_amount text, customer_id text, type text, payment_method text, status text)
 LANGUAGE sql STABLE
AS $function$
SELECT p.effective_date::text, p.payment_amount::text, p.customer_id, p.type, p.payment_method, p.status
FROM acumatica_payments p
WHERE p.effective_date >= p_start_date AND p.effective_date <= p_end_date
AND p.type != ALL(p_excluded_types)
AND p.organization_id = p_org_id
ORDER BY p.id;
$function$;

-- Hourly refresh loops every organization
CREATE OR REPLACE FUNCTION public.refresh_payment_analytics()
 RETURNS void LANGUAGE plpgsql
AS $function$
DECLARE
  supabase_url text; supabase_key text; current_year int; current_month int;
  org record; start_time timestamptz := clock_timestamp();
BEGIN
  SELECT decrypted_secret INTO supabase_url FROM vault.decrypted_secrets WHERE name='SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO supabase_key FROM vault.decrypted_secrets WHERE name='SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  FOR org IN SELECT id FROM organizations LOOP
    PERFORM (SELECT status FROM http(('POST', supabase_url||'/functions/v1/calculate-payment-analytics',
      ARRAY[http_header('Authorization','Bearer '||supabase_key), http_header('Content-Type','application/json')],
      'application/json', json_build_object('periodType','daily','year',current_year,'month',current_month,'organizationId',org.id)::text)::http_request));
    PERFORM (SELECT status FROM http(('POST', supabase_url||'/functions/v1/calculate-payment-analytics',
      ARRAY[http_header('Authorization','Bearer '||supabase_key), http_header('Content-Type','application/json')],
      'application/json', json_build_object('periodType','monthly','year',current_year,'organizationId',org.id)::text)::http_request));
    PERFORM (SELECT status FROM http(('POST', supabase_url||'/functions/v1/calculate-payment-analytics',
      ARRAY[http_header('Authorization','Bearer '||supabase_key), http_header('Content-Type','application/json')],
      'application/json', json_build_object('periodType','yearly','organizationId',org.id)::text)::http_request));
  END LOOP;
  INSERT INTO cron_job_logs(job_name, status, response_data, execution_time_ms)
  VALUES ('refresh-payment-analytics-hourly','completed',
    json_build_object('orgs_refreshed',(SELECT count(*) FROM organizations)),
    EXTRACT(MILLISECOND FROM clock_timestamp()-start_time)::int);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_job_logs(job_name, status, error_message, execution_time_ms)
  VALUES ('refresh-payment-analytics-hourly','error', SQLERRM, EXTRACT(MILLISECOND FROM clock_timestamp()-start_time)::int);
END;
$function$;
