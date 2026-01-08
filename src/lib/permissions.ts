import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';

export interface UserPermission {
  permission_key: string;
  permission_name: string;
  category: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  is_custom: boolean;
}

export function useUserPermissions() {
  const { profile, isImpersonating } = useAuth();
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const loadingRef = useRef(false);
  const lastLoadedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      // Only load if we're not already loading and the user changed
      if (!loadingRef.current && lastLoadedUserId.current !== profile.id) {
        loadPermissions(profile.id);
      }
    } else {
      setPermissions([]);
      setUserRole('');
      setLoading(false);
      lastLoadedUserId.current = null;
    }
  }, [profile?.id, isImpersonating]);

  const loadPermissions = async (userId: string) => {
    if (loadingRef.current) return; // Prevent concurrent loads

    loadingRef.current = true;
    lastLoadedUserId.current = userId;
    setLoading(true);

    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileData) {
        setUserRole(profileData.role);
      }

      const { data, error } = await supabase
        .rpc('get_user_permissions', { user_uuid: userId });

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('Error loading permissions:', error);
      setPermissions([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const hasPermission = useCallback((
    permissionKey: string,
    action: 'view' | 'create' | 'edit' | 'delete' = 'view'
  ): boolean => {
    if (userRole === 'admin') return true;

    const permission = permissions.find(p => p.permission_key === permissionKey);
    if (!permission) return false;

    switch (action) {
      case 'view':
        return permission.can_view;
      case 'create':
        return permission.can_create;
      case 'edit':
        return permission.can_edit;
      case 'delete':
        return permission.can_delete;
      default:
        return false;
    }
  }, [userRole, permissions]);

  const hasAnyPermission = useCallback((permissionKeys: string[], action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean => {
    return permissionKeys.some(key => hasPermission(key, action));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((permissionKeys: string[], action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean => {
    return permissionKeys.every(key => hasPermission(key, action));
  }, [hasPermission]);

  return {
    permissions,
    loading,
    userRole,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin: userRole === 'admin',
    isManager: userRole === 'manager',
    isCollector: userRole === 'collector',
    isViewer: userRole === 'viewer',
  };
}

// New consolidated permission keys (21 total)
export const PERMISSION_KEYS = {
  // Dashboard & Analytics (3)
  DASHBOARD_MAIN: 'dashboard_main',
  ANALYTICS_BASIC: 'analytics_basic',  // Invoice, Payment, Invoice Status Analytics
  ANALYTICS_ADVANCED: 'analytics_advanced',  // Revenue, Customer, Collector, Email, Stripe Analytics

  // Core Operations (4)
  CUSTOMERS: 'customers',  // All customer management (view, edit, files, assignments, reports)
  INVOICES: 'invoices',  // All invoice operations (view, edit, status, memos)
  PAYMENTS: 'payments',  // All payment operations (view, edit, applications, check images)
  EMAILS: 'emails',  // Email system (inbox, send, reply, templates, formulas)

  // Features (3)
  REMINDERS: 'reminders',  // Reminder management
  MY_ASSIGNMENTS: 'my_assignments',  // View own assignments
  COLLECTION_TICKETING: 'collection_ticketing',  // Collection workflow

  // Reports & Integrations (3)
  REPORTS: 'reports',  // Reports and documentation
  STRIPE: 'stripe',  // Stripe payment portal
  MONITORING: 'monitoring',  // Logs and system monitoring

  // Administration (6)
  ADMIN_USERS: 'admin_users',  // User management
  ADMIN_ROLES: 'admin_roles',  // Role management
  ADMIN_SYNC_CONFIG: 'admin_sync_config',  // Sync configuration
  ADMIN_WEBHOOKS: 'admin_webhooks',  // Webhook configuration
  ADMIN_COLLECTOR_CONTROL: 'admin_collector_control',  // Collector management
  ADMIN_DASHBOARD: 'admin_dashboard',  // Admin dashboard access

  // Technical (2)
  ACUMATICA: 'acumatica',  // Acumatica integration
  DIAGNOSTICS: 'diagnostics',  // Diagnostic tools

  // Legacy aliases for backwards compatibility (will use the new consolidated keys)
  CUSTOMERS_VIEW: 'customers',
  CUSTOMERS_EDIT: 'customers',
  CUSTOMERS_ASSIGNMENTS: 'customers',
  CUSTOMERS_FILES: 'customers',
  CUSTOMERS_REPORTS: 'customers',
  CUSTOMERS_DASHBOARD: 'customers',

  INVOICES_VIEW: 'invoices',
  INVOICES_EDIT: 'invoices',
  INVOICES_STATUS: 'invoices',
  INVOICES_MEMOS: 'invoices',

  PAYMENTS_VIEW: 'payments',
  PAYMENTS_EDIT: 'payments',
  PAYMENTS_APPLICATIONS: 'payments',
  PAYMENTS_CHECK_IMAGES: 'payments',

  EMAIL_INBOX: 'emails',
  EMAIL_SEND: 'emails',
  EMAIL_REPLY: 'emails',
  EMAIL_TEMPLATES: 'emails',
  EMAIL_FORMULAS: 'emails',

  ANALYTICS_INVOICES: 'analytics_basic',
  ANALYTICS_PAYMENTS: 'analytics_basic',
  ANALYTICS_INVOICE_STATUS: 'analytics_basic',
  ANALYTICS_DASHBOARD: 'analytics_basic',

  LOGS_SYNC: 'monitoring',
  LOGS_WEBHOOK: 'monitoring',
  LOGS_SCHEDULER: 'monitoring',
  MONITOR_CRON: 'monitoring',
  MONITOR_SYNC_STATUS: 'monitoring',

  REPORTS_MONTHLY: 'reports',
  REPORTS_CUSTOM: 'reports',
  DOCUMENTS_VIEW: 'reports',

  ACUMATICA_CUSTOMERS: 'acumatica',
  ACUMATICA_SYNC: 'acumatica',
  ACUMATICA_TEST: 'diagnostics',
  ACUMATICA_CREDENTIALS: 'acumatica',
} as const;
