import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function useOrgNavigation() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const orgNavigate = useCallback((path: string, options?: { replace?: boolean }) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      navigate(`/${orgSlug}${path}`, options);
    } else {
      navigate(path, options);
    }
  }, [navigate, orgSlug]);

  const getOrgPath = useCallback((path: string) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      return `/${orgSlug}${path}`;
    }
    return path;
  }, [orgSlug]);

  return { navigate: orgNavigate, getOrgPath, orgSlug };
}
