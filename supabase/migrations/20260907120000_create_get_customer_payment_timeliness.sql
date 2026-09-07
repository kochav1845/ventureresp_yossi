-- Payment timeliness for a single customer, used by the AI chat assistant to
-- answer "how many days after the due date does this customer pay?".
-- Joins each payment to the invoice(s) it settled (payment_invoice_applications)
-- and measures application_date - due_date. Real invoices/payments only.
create or replace function public.get_customer_payment_timeliness(p_customer_id text)
returns table (
  paid_invoice_count bigint,
  avg_days_after_due numeric,
  median_days_after_due numeric,
  pct_paid_late numeric,
  earliest_days integer,
  latest_days integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  with links as (
    select (p.application_date::date - i.due_date::date) as days_after_due
    from payment_invoice_applications a
    join acumatica_invoices i
      on i.reference_number = a.invoice_reference_number
     and i.customer = p_customer_id
     and i.type = 'Invoice'
    join acumatica_payments p
      on p.reference_number = a.payment_reference_number
     and p.type = 'Payment'
     and coalesce(p.status, '') <> 'Voided'
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
$fn$;

grant execute on function public.get_customer_payment_timeliness(text) to authenticated, service_role;
