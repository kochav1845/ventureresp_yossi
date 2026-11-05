import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

/**
 * Navigate without falling out of the organization.
 *
 * Almost every route in this app lives under `/:orgSlug/*` (App.tsx). Only
 * three paths sit above it: `/`, `/developer` and `/connection-test`. So a bare
 * `navigate('/customers')` from inside an org goes to a path that matches no
 * org route, the app shell disappears and the user lands on the public landing
 * page -- which is what made the whole Developer Tools page, every guided tour
 * step and crash recovery dead ends.
 *
 * Use this hook's `navigate` anywhere inside the org shell. It adds the slug
 * when one is missing, and leaves the three top-level paths alone so they still
 * work.
 */

/** Paths that are deliberately outside an organization. Keep in step with App.tsx. */
const TOP_LEVEL = ['/', '/developer', '/connection-test'];

const isTopLevel = (path: string) =>
  TOP_LEVEL.some((p) => path === p || (p !== '/' && path.startsWith(p + '/')));

export function useOrgNavigation() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const getOrgPath = useCallback((path: string) => {
    if (!path.startsWith('/') || !orgSlug) return path;
    if (isTopLevel(path)) return path;
    if (path === `/${orgSlug}` || path.startsWith(`/${orgSlug}/`)) return path;
    return `/${orgSlug}${path}`;
  }, [orgSlug]);

  const orgNavigate = useCallback((path: string, options?: { replace?: boolean }) => {
    navigate(getOrgPath(path), options);
  }, [navigate, getOrgPath]);

  return { navigate: orgNavigate, getOrgPath, orgSlug };
}
