import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, setSupabaseOrgHeader, isRetryableError } from '../lib/supabase';

interface Organization {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

interface OrgContextType {
  org: Organization | null;
  orgSlug: string | null;
  loading: boolean;
  error: string | null;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevOrgId = useRef<string | null>(null);

  useEffect(() => {
    if (!orgSlug) {
      setOrg(null);
      setLoading(false);
      return;
    }

    const loadOrg = async () => {
      setLoading(true);
      setError(null);

      let lastError: any = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, error: fetchError } = await supabase
          .from('organizations')
          .select('*')
          .eq('slug', orgSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (fetchError && isRetryableError(fetchError)) {
          lastError = fetchError;
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
            continue;
          }
        }

        if (fetchError && !isRetryableError(fetchError)) {
          setError('Failed to load organization');
          setOrg(null);
          setLoading(false);
          return;
        }

        if (!fetchError && !data) {
          setError('Organization not found');
          setOrg(null);
          setLoading(false);
          return;
        }

        if (!fetchError && data) {
          setOrg(data);
          setError(null);
          if (data.id !== prevOrgId.current) {
            prevOrgId.current = data.id;
            setSupabaseOrgHeader(data.id);
          }
          setLoading(false);
          return;
        }
      }

      setError('Database temporarily unavailable. Please refresh the page.');
      setOrg(null);
      setLoading(false);
    };

    loadOrg();
  }, [orgSlug]);

  const contextValue = useMemo(() => ({
    org,
    orgSlug: orgSlug || null,
    loading,
    error
  }), [org, orgSlug, loading, error]);

  return (
    <OrgContext.Provider value={contextValue}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}
