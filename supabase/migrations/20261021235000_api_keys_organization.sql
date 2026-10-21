/*
  # gpt-data-api keys were not bound to a tenant (groundwork for audit H34)

  api_keys had no organization column, and gpt-data-api runs on a service-role
  client with verify_jwt off -- so nothing in the database could scope a request
  made with an API key. Every handler in that function read across both orgs.

  The key now carries the organization of whoever created it, backfilled from
  created_by's profile, and validateApiKey() returns it so handlers can filter
  on it. A key with no organization is rejected (403) rather than served
  unscoped data.
*/

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

UPDATE public.api_keys k
   SET organization_id = p.organization_id
  FROM public.user_profiles p
 WHERE p.id = k.created_by
   AND k.organization_id IS NULL;
