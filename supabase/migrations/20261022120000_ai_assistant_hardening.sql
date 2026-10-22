/*
  # AI assistant: make the SQL tool genuinely read-only, scope the two
  # RLS-bypassing RPCs it calls, and give every tool call an audit trail

  Groundwork for selling the AI bot into an enterprise account. Three things.

  ## 1. execute_readonly_sql was not read-only

  It guarded itself with

      SET LOCAL default_transaction_read_only = on;

  but that GUC only sets the default for transactions started LATER; it does
  nothing to the transaction already in progress. Probed on this database:
  default_transaction_read_only read 'on' while transaction_read_only read
  'off', and an INSERT in that transaction succeeded. The only other guard was
  `upper(trim(sql_query)) LIKE 'SELECT%'`, which a statement like
  `SELECT some_writing_function(...)` satisfies -- so a write could be smuggled
  through a "read-only" tool, which I confirmed end to end (and rolled back).

  `SET TRANSACTION READ ONLY` is the real thing: it sets transaction_read_only
  on the current transaction. Re-probed after this change, the same smuggled
  write fails with SQLSTATE 25006, "cannot execute INSERT in a read-only
  transaction". It throws if the transaction has already written, which is
  fail-closed and cannot happen on the one-statement RPC path these callers use.

  The LLM-composed SQL tools that sat on top of this are being removed from both
  AI edge functions in the same change; what remains are three fixed,
  developer-written queries.

  ## 2. Two SECURITY DEFINER RPCs the assistant calls ignored the tenant

  search_customers_fuzzy and get_customer_payment_timeliness are SECURITY
  DEFINER, so they bypass RLS, and neither mentioned organization_id. Every
  other RPC the assistant calls is SECURITY INVOKER and is therefore scoped
  correctly once the caller has a real identity -- these two were not. Both now
  filter on get_user_org_id(). A NULL org (no user identity, e.g. a service-role
  caller) returns nothing rather than everything.

  ## 3. No audit trail existed

  Nothing recorded AI prompts, tool calls, arguments or results -- not one
  table. ai_tool_calls records enterprise identity, organization, tool name,
  redacted arguments, outcome, row count, latency and a correlation id, which is
  the artefact a security review asks for.
*/

-- ── 1. A read-only guard that actually holds ──────────────────────────────
CREATE OR REPLACE FUNCTION public.execute_readonly_sql(sql_query text)
RETURNS json
LANGUAGE plpgsql
SET statement_timeout TO '10s'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT (upper(trim(sql_query)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Was: SET LOCAL default_transaction_read_only = on, which only affects
  -- transactions started afterwards and left this one writable.
  SET TRANSACTION READ ONLY;

  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql_query || ') t'
  INTO result;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;

-- ── 2. Tenant-scope the two DEFINER RPCs the assistant calls ──────────────
CREATE OR REPLACE FUNCTION public.search_customers_fuzzy(p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE(customer_id text, customer_name text, similarity_score real, customer_status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select c.customer_id, c.customer_name,
         round(greatest(
           word_similarity(p_query, coalesce(c.customer_name,'')),
           similarity(coalesce(c.customer_name,''), p_query),
           similarity(coalesce(c.customer_id,''), p_query)
         )::numeric, 3)::real as similarity_score,
         c.customer_status
  from acumatica_customers c
  where coalesce(p_query,'') <> ''
    -- SECURITY DEFINER bypasses RLS, so the tenant has to be named here.
    and c.organization_id = get_user_org_id()
    and (
      greatest(word_similarity(p_query, coalesce(c.customer_name,'')),
               similarity(coalesce(c.customer_name,''), p_query)) > 0.1
      or c.customer_name ilike '%'||p_query||'%'
      or c.customer_id ilike '%'||p_query||'%'
    )
  order by similarity_score desc
  limit greatest(coalesce(p_limit,8),1);
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_payment_timeliness(p_customer_id text)
RETURNS TABLE(paid_invoice_count bigint, avg_days_after_due numeric, median_days_after_due numeric, pct_paid_late numeric, earliest_days integer, latest_days integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with links as (
    select (p.application_date::date - i.due_date::date) as days_after_due
    from payment_invoice_applications a
    join acumatica_invoices i
      on i.reference_number = a.invoice_reference_number
     and i.customer = p_customer_id
     and i.type = 'Invoice'
     -- SECURITY DEFINER bypasses RLS, so the tenant has to be named here.
     and i.organization_id = get_user_org_id()
    join acumatica_payments p
      on p.reference_number = a.payment_reference_number
     and p.type = 'Payment'
     and coalesce(p.status,'') <> 'Voided'
     and p.organization_id = i.organization_id
    where i.due_date is not null and p.application_date is not null
  )
  select
    count(*)::bigint,
    round(avg(days_after_due), 1),
    round(percentile_cont(0.5) within group (order by days_after_due)::numeric, 1),
    round(100.0 * count(*) filter (where days_after_due > 0) / nullif(count(*), 0), 0),
    min(days_after_due)::int,
    max(days_after_due)::int
  from links;
$function$;

-- ── 3. An audit trail for every AI tool call ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_tool_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id         uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  user_email      text,
  assistant       text NOT NULL,              -- which AI surface made the call
  correlation_id  uuid NOT NULL,              -- one per chat request
  tool_name       text NOT NULL,
  arguments       jsonb,                      -- redacted before it gets here
  outcome         text NOT NULL,              -- 'ok' | 'error'
  error_message   text,
  row_count       integer,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_tool_calls_org_time_idx
  ON public.ai_tool_calls (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_tool_calls_correlation_idx
  ON public.ai_tool_calls (correlation_id);

ALTER TABLE public.ai_tool_calls ENABLE ROW LEVEL SECURITY;

-- Admins and managers can review their own organization's AI activity.
DROP POLICY IF EXISTS "Admins read their org's AI tool calls" ON public.ai_tool_calls;
CREATE POLICY "Admins read their org's AI tool calls"
  ON public.ai_tool_calls FOR SELECT TO authenticated
  USING (is_manager_or_admin() AND organization_id = get_user_org_id());

-- Only the edge functions write, and nobody edits or deletes an audit row.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_tool_calls FROM anon, authenticated;
GRANT SELECT ON public.ai_tool_calls TO authenticated;
GRANT INSERT ON public.ai_tool_calls TO service_role;

-- ── 4. A typed replacement for one interpolated query ─────────────────────
/*
  acumatica-get-invoice-count built its SQL by string interpolation:

      `... WHERE date >= '${startDate}' AND date <= '${endDate}' GROUP BY type`

  with both bounds derived from request input, so it was injectable through the
  execute_readonly_sql path. Typed date parameters cannot be, and this is
  org-scoped besides.
*/
CREATE OR REPLACE FUNCTION public.get_invoice_type_counts(p_from date, p_to date)
RETURNS TABLE(type text, cnt integer)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT i.type, count(*)::int
  FROM acumatica_invoices i
  WHERE i.date >= p_from
    AND i.date <= p_to
  GROUP BY i.type;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_invoice_type_counts(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_invoice_type_counts(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_type_counts(date, date) TO authenticated, service_role;
