import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

export const LOCKABLE_COMPONENTS = {
  SETTINGS: 'settings',
  EMAIL_SYSTEM: 'email_system',
  DEVELOPER_SETTINGS: 'developer_settings',
  INVOICE_ANALYTICS: 'invoice_analytics',
  PAYMENT_ANALYTICS: 'payment_analytics',
} as const;

export type LockableComponent = typeof LOCKABLE_COMPONENTS[keyof typeof LOCKABLE_COMPONENTS];

export const COMPONENT_LABELS: Record<LockableComponent, { name: string; description: string }> = {
  settings: { name: 'Settings', description: 'Admin settings, user approval, sync config, ticket settings, email settings, documentation' },
  email_system: { name: 'Email System', description: 'Inbox, assignments, formulas, templates, email logs' },
  developer_settings: { name: 'Developer Settings', description: 'Developer tools, system health, sync logs, scheduler, system logs' },
  invoice_analytics: { name: 'Invoice Analytics', description: 'Invoice analytics dashboard and breakdown' },
  payment_analytics: { name: 'Payment Analytics', description: 'Payment analytics dashboard and breakdown' },
};

interface ComponentLock {
  component_key: string;
  is_locked: boolean;
}

export function useUserPermissions() {
  const { profile, isImpersonating } = useAuth();
  const [locks, setLocks] = useState<ComponentLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>(profile?.role || '');
  const loadingRef = useRef(false);
  const lastLoadedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (profile?.role && profile.role !== userRole) {
      setUserRole(profile.role);
    }
  }, [profile?.role]);

  useEffect(() => {
    if (profile?.id) {
      if (!loadingRef.current && lastLoadedUserId.current !== profile.id) {
        loadLocks(profile.id);
      }
    } else {
      setLocks([]);
      setUserRole('');
      setLoading(false);
      lastLoadedUserId.current = null;
    }
  }, [profile?.id, isImpersonating]);

  const loadLocks = async (userId: string) => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    lastLoadedUserId.current = userId;
    setLoading(true);

    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setUserRole(profileData.role);
      }

      const { data, error } = await supabase
        .from('user_component_locks')
        .select('component_key, is_locked')
        .eq('user_id', userId);

      if (error) throw error;
      setLocks(data || []);
    } catch (error) {
      console.error('Error loading component locks:', error);
      setLocks([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const isComponentLocked = useCallback((componentKey: string): boolean => {
    if (loading) return false;
    if (userRole === 'admin') return false;

    const lock = locks.find(l => l.component_key === componentKey);
    return lock?.is_locked ?? false;
  }, [loading, userRole, locks]);

  return {
    loading,
    userRole,
    isComponentLocked,
    isAdmin: userRole === 'admin',
    isManager: userRole === 'manager',
    isCollector: userRole === 'collector',
    isViewer: userRole === 'viewer',
  };
}
