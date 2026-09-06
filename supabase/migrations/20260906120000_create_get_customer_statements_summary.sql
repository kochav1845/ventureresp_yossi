-- Headline totals for the Customer Statements page, computed once server-side
-- so the stat cards show a final figure instead of ticking up as the row
-- batches stream in. Aggregates over the SAME get_customer_statements source,
-- so the four numbers always match the streamed rows exactly.
create or replace function public.get_customer_statements_summary(p_test_mode boolean default false)
returns table (
  customers_with_balance bigint,
  total_open_balance numeric,
  open_invoices bigint,
  overdue_30_count bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    count(*)::bigint                                        as customers_with_balance,
    coalesce(sum(s.total_balance), 0)                       as total_open_balance,
    coalesce(sum(s.open_invoice_count), 0)::bigint          as open_invoices,
    count(*) filter (where s.max_days_overdue > 30)::bigint as overdue_30_count
  from public.get_customer_statements(p_test_mode) s;
$fn$;

grant execute on function public.get_customer_statements_summary(boolean) to authenticated, service_role;
