/*
  # Fuzzy customer search for the AI assistant

  The AI bot searched customers with exact ILIKE '%term%', so a misspelling like
  "venderbuilyt" never matched "New Vanderbilt Rehab & Care Center". This adds a
  trigram-similarity search so the bot can resolve the closest customer even with
  typos/partial names (surfaced via the new `find_customer` tool).

  Requires pg_trgm (already enabled on this project).
*/

create extension if not exists pg_trgm;

create or replace function public.search_customers_fuzzy(p_query text, p_limit int default 8)
returns table(customer_id text, customer_name text, similarity_score real, customer_status text)
language sql stable security definer set search_path = public
as $fn$
  select c.customer_id, c.customer_name,
         round(greatest(
           word_similarity(p_query, coalesce(c.customer_name,'')),
           similarity(coalesce(c.customer_name,''), p_query),
           similarity(coalesce(c.customer_id,''), p_query)
         )::numeric, 3)::real as similarity_score,
         c.customer_status
  from acumatica_customers c
  where coalesce(p_query,'') <> ''
    and (
      greatest(word_similarity(p_query, coalesce(c.customer_name,'')),
               similarity(coalesce(c.customer_name,''), p_query)) > 0.1
      or c.customer_name ilike '%'||p_query||'%'
      or c.customer_id ilike '%'||p_query||'%'
    )
  order by similarity_score desc
  limit greatest(coalesce(p_limit,8),1);
$fn$;
