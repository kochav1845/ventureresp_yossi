import { supabase } from './supabase';

/**
 * Headers for calling a Supabase edge function from the app.
 *
 * These screens used to send the public anon key as the bearer. Edge functions
 * authenticate the CALLER, not the project: several of them resolve the
 * caller's profile and check their role, their organization and whether their
 * account is approved. An anon-key bearer means "no user", so every one of
 * those checks fails and the call comes back 401 or 403.
 *
 * Always send the signed-in user's access token. The anon key still goes in the
 * `apikey` header, which is what the gateway wants.
 */
export async function functionAuthHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  return {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}
