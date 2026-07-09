/*
  # True distinct customer count for Invoice Analytics

  The monthly/yearly views summed each period's distinct-customer count, so a
  customer active in N periods was counted N times (e.g. "Unique Customers 8,895"
  when the real figure is ~2,833). This returns COUNT(DISTINCT customer) for the
  whole scope, mirroring get_filtered_invoice_aggregates' filters. p_year is null
  for the yearly (all-years) view, or the selected year for the monthly view.
*/

create or replace function public.get_analytics_customer_count(
  p_year int default null,
  p_status text default null,
  p_type text default null,
  p_included_customers text[] default '{}',
  p_excluded_customers text[] default '{}'
) returns bigint
language sql stable security definer set search_path = public
as $fn$
  select count(distinct i.customer)
  from acumatica_invoices i
  where i.organization_id = get_user_org_id()
    and i.type in ('Invoice','Debit Memo','Credit Memo')
    and i.status in ('Balanced','Credit Hold','Open','Closed','Voided','Canceled')
    and (p_status is null or i.status = p_status)
    and (p_type is null or i.type = p_type)
    and (coalesce(array_length(p_excluded_customers,1),0) = 0 or i.customer <> all(p_excluded_customers))
    and (coalesce(array_length(p_included_customers,1),0) = 0 or i.customer = any(p_included_customers))
    and (p_year is null or (i.date >= make_date(p_year,1,1) and i.date <= make_date(p_year,12,31)));
$fn$;
