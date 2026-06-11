import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useOrgNavigation } from '../hooks/useOrgNavigation';
import {
  LogOut,
  BarChart3,
  Database,
  FileText,
  DollarSign,
  Users,
  Settings,
  Mail,
  Inbox,
  Calendar,
  Link as LinkIcon,
  Clock,
  Activity,
  RefreshCw,
  Shield,
  Bell,
  CreditCard,
  Ticket,
  ChevronDown,
  ChevronUp,
  Code,
  ChevronLeft,
  ChevronRight,
  Palette,
  ClipboardList,
  TrendingUp,
  MailCheck,
  Gauge,
  Key,
  Webhook,
  Ban,
  FileBarChart,
  Send,
  Sliders,
  HeartPulse,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import RemindersSidebar from './RemindersSidebar';
import ImpersonationBanner from './ImpersonationBanner';
import GlobalSearchBar from './GlobalSearch/GlobalSearchBar';
import { supabase } from '../lib/supabase';
import { useUserPermissions, LOCKABLE_COMPONENTS } from '../lib/permissions';
import UserManagementSidebar from './UserManagementSidebar';

import TourLauncher from './GuidedTour/TourLauncher';

export default function Layout() {
  const { profile, signOut, user, isImpersonating } = useAuth();
  const { navigate } = useOrgNavigation();
  const location = useLocation();
  const { isComponentLocked, isAdmin } = useUserPermissions();
  const isCollector = profile?.role === 'collector';
  const canBeAssignedAsCollector = profile?.can_be_assigned_as_collector || profile?.role === 'collector' || profile?.role === 'admin' || profile?.role === 'manager';
  const [showReminders, setShowReminders] = useState(false);
  const [hasOverdueReminders, setHasOverdueReminders] = useState(false);
  const [developerSettingsOpen, setDeveloperSettingsOpen] = useState(false);
  const [emailSystemOpen, setEmailSystemOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showUserSidebar, setShowUserSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cronJobHealthy, setCronJobHealthy] = useState(true);

  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentView = pathParts.length > 1 ? pathParts.slice(1).join('/') : pathParts[0] || 'dashboard';

  useEffect(() => {
    loadSidebarPreference();
  }, [profile?.id]);

  const loadSidebarPreference = async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('ui_preferences')
        .eq('id', profile.id)
        .single();

      if (!error && data?.ui_preferences) {
        setSidebarCollapsed(data.ui_preferences.sidebarCollapsed || false);
      }
    } catch (error) {
      console.error('Error loading sidebar preference:', error);
    }
  };

  const toggleSidebar = async () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);

    if (!profile?.id) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          ui_preferences: { sidebarCollapsed: newState }
        })
        .eq('id', profile.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving sidebar preference:', error);
    }
  };

  useEffect(() => {
    checkOverdueReminders();
    const interval = setInterval(checkOverdueReminders, 60000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  const checkOverdueReminders = async () => {
    if (!profile) return;

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('invoice_reminders')
        .select('id')
        .eq('user_id', profile.id)
        .is('completed_at', null)
        .lt('reminder_date', now)
        .limit(1);

      if (!error && data && data.length > 0) {
        setHasOverdueReminders(true);
      } else {
        setHasOverdueReminders(false);
      }
    } catch (error) {
      console.error('Error checking overdue reminders:', error);
    }
  };

  useEffect(() => {
    checkCronJobHealth();
    const interval = setInterval(checkCronJobHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkCronJobHealth = async () => {
    try {
      const { data, error } = await supabase.rpc('check_cron_job_health');

      if (!error && data !== null) {
        setCronJobHealthy(data);
      } else {
        setCronJobHealthy(false);
      }
    } catch (error) {
      console.error('Error checking cron job health:', error);
      setCronJobHealthy(false);
    }
  };

  const settingsLocked = isComponentLocked(LOCKABLE_COMPONENTS.SETTINGS);

  const allMenuSections = [
    {
      title: 'Customer Management',
      items: [
        { id: 'customers', name: 'Customers', icon: Users },
        ...(canBeAssignedAsCollector ? [{ id: 'my-assignments', name: 'My Assignments', icon: Ticket }] : []),
        ...(!settingsLocked ? [{ id: 'customer-statements', name: 'Statements', icon: Send }] : []),
      ]
    },
    ...(!isComponentLocked(LOCKABLE_COMPONENTS.INVOICE_ANALYTICS) ? [{
      title: 'Invoice Management',
      items: [
        { id: 'invoice-analytics', name: 'Invoice Analytics', icon: FileText },
      ]
    }] : []),
    ...(!isComponentLocked(LOCKABLE_COMPONENTS.PAYMENT_ANALYTICS) ? [{
      title: 'Payment Management',
      items: [
        { id: 'payment-analytics', name: 'Payment Analytics', icon: DollarSign },
      ]
    }] : []),
    {
      title: 'Reminders',
      items: [
        { id: 'reminders', name: 'My Reminders', icon: Bell },
      ]
    },
    {
      title: 'Administration',
      items: [
        ...(isAdmin ? [{ id: 'collection-ticketing', name: 'Ticketing System', icon: Ticket }] : []),
      ]
    },
  ];

  const emailSystemItems = !isComponentLocked(LOCKABLE_COMPONENTS.EMAIL_SYSTEM) ? [
    { id: 'inbox', name: 'Inbox', icon: Inbox },
    { id: 'assignments', name: 'Assignments', icon: LinkIcon },
    { id: 'formulas', name: 'Formulas', icon: Calendar },
    { id: 'templates', name: 'Templates', icon: Mail },
    { id: 'customer-email-tracking', name: 'Email Tracking', icon: MailCheck },
  ] : [];

  const adminDashboardItems = !settingsLocked ? [
    { id: 'collector-monitoring', name: 'Collector Dashboard', icon: Activity },
    { id: 'collector-control-panel', name: 'Collector Control Panel', icon: Sliders },
    { id: 'customer-analytics', name: 'Customer Analytics', icon: Users },
    { id: 'revenue-analytics', name: 'Revenue Analytics', icon: TrendingUp },
    ...(!isComponentLocked(LOCKABLE_COMPONENTS.INVOICE_ANALYTICS) ? [
      { id: 'invoice-analytics', name: 'Invoice Analytics', icon: FileText },
      { id: 'invoice-breakdown', name: 'Invoice Breakdown', icon: FileBarChart },
      { id: 'invoice-status-analytics', name: 'Invoice Status Analytics', icon: BarChart3 },
    ] : []),
    ...(!isComponentLocked(LOCKABLE_COMPONENTS.PAYMENT_ANALYTICS) ? [
      { id: 'payment-analytics', name: 'Payment Analytics', icon: DollarSign },
      { id: 'payment-breakdown', name: 'Payment Breakdown', icon: CreditCard },
      { id: 'voided-payment-analysis', name: 'Voided Payment Analysis', icon: Ban },
    ] : []),
    { id: 'email-analytics', name: 'Email Analytics', icon: MailCheck },
  ] : [];

  const adminSettingsItems = !settingsLocked ? [
    { id: 'invoice-color-settings', name: 'Invoice Color Settings', icon: Palette },
    { id: 'invoice-status-admin', name: 'Invoice Status Admin', icon: ClipboardList },
    { id: 'ticket-status-settings', name: 'Ticket Status Settings', icon: Settings },
    { id: 'auto-ticket-rules', name: 'Auto-Ticket Rules', icon: Clock },
    { id: 'user-approval', name: 'User Approval', icon: Shield },
    { id: 'create-user', name: 'Create New User', icon: Users },
    { id: 'user-activity', name: 'User Activity', icon: Activity },
    { id: 'customer-reports', name: 'Customer Reports', icon: FileBarChart },
    { id: 'customer-report-templates', name: 'Report Templates', icon: FileText },
    { id: 'email-settings', name: 'Email Settings', icon: Mail },
    { id: 'system-documentation', name: 'Documentation', icon: FileText },
  ] : [];

  const developerItems = !isComponentLocked(LOCKABLE_COMPONENTS.DEVELOPER_SETTINGS) ? [
    ...(isAdmin ? [{ id: 'developer-tools', name: 'Developer Tools', icon: Code }] : []),
    { id: 'sync-status', name: 'Sync Status', icon: RefreshCw },
    { id: 'sync-config', name: 'Sync Configuration', icon: Sliders },
    { id: 'sync-health', name: 'Sync Health', icon: HeartPulse },
    { id: 'webhooks', name: 'Webhooks', icon: Webhook },
    { id: 'api-keys', name: 'API Keys', icon: Key },
    { id: 'cron-jobs', name: 'Cron Jobs', icon: Clock },
    { id: 'sync-logs', name: 'Sync Change Logs', icon: RefreshCw },
    { id: 'sync-diagnostic', name: 'Sync Diagnostic', icon: Gauge },
    { id: 'live-sync-monitor', name: 'Live Sync Monitor', icon: HeartPulse },
    { id: 'schedule', name: 'Scheduler', icon: Clock },
    { id: 'logs', name: 'System Logs', icon: Database },
    { id: 'auto-backfill', name: 'Auto Backfill Monitor', icon: RefreshCw },
    { id: 'payment-sync-health', name: 'Payment Sync Health', icon: HeartPulse },
  ] : [];

  const menuSections = allMenuSections.filter(section => section.items.length > 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar */}
      <aside data-tour="sidebar" className={`fixed left-0 h-screen bg-white border-r border-gray-200 shadow-sm flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-64'} ${isImpersonating ? 'top-16' : 'top-0'}`}>
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="p-4 border-b border-blue-100 flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex-1">
                <p className="text-center text-sm text-blue-700 font-semibold">Collections Portal</p>
              </div>
            )}
            <button
              data-tour="sidebar-collapse"
              onClick={toggleSidebar}
              className={`p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-all ${sidebarCollapsed ? 'mx-auto' : ''}`}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="p-2 space-y-4">
            {menuSections.map((section) => (
              <div key={section.title}>
                {!sidebarCollapsed && (
                  <h3 className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-2 px-3">
                    {section.title}
                  </h3>
                )}
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    return (
                      <li key={item.id} className="relative group">
                        <button
                          data-tour={`nav-${item.id}`}
                          onClick={() => navigate(`/${item.id}`)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                              : 'text-blue-700 hover:bg-blue-50 hover:text-blue-900'
                          } ${sidebarCollapsed ? 'justify-center' : ''}`}
                          title={sidebarCollapsed ? item.name : ''}
                        >
                          <Icon size={18} />
                          {!sidebarCollapsed && <span>{item.name}</span>}
                        </button>
                        {sidebarCollapsed && (
                          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                            {item.name}
                            <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Admin Dashboard - Collapsible Section */}
            {adminDashboardItems.length > 0 && (
              <div>
                <div className="relative group">
                  <button
                    onClick={(e) => {
                      if (sidebarCollapsed) {
                        navigate('/payment-analytics');
                      } else {
                        setAdminDashboardOpen(!adminDashboardOpen);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all mb-2 ${
                      adminDashboardItems.some(item => currentView === item.id)
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                        : 'text-blue-700 hover:text-blue-900 hover:bg-blue-50'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    {sidebarCollapsed ? (
                      <BarChart3 size={18} />
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <BarChart3 size={16} />
                          <span className="text-xs font-semibold uppercase tracking-wider">Admin Dashboard</span>
                        </div>
                        {adminDashboardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </>
                    )}
                  </button>
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      Admin Dashboard
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
                    </div>
                  )}
                </div>

                {adminDashboardOpen && !sidebarCollapsed && (
                  <ul className="space-y-1 ml-2">
                    {adminDashboardItems.map((item, index) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <li key={`${item.id}-${index}`}>
                          <button
                            onClick={() => navigate(`/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md'
                                : 'text-blue-700 hover:bg-blue-50 hover:text-blue-900'
                            }`}
                          >
                            <Icon size={18} />
                            <span>{item.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Settings - Collapsible Section */}
            {adminSettingsItems.length > 0 && (
              <div>
                <div className="relative group">
                  <button
                    onClick={() => {
                      if (sidebarCollapsed) {
                        navigate('/invoice-color-settings');
                      } else {
                        setSettingsOpen(!settingsOpen);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all mb-2 ${
                      adminSettingsItems.some(item => currentView === item.id)
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                        : 'text-blue-700 hover:text-blue-900 hover:bg-blue-50'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    {sidebarCollapsed ? (
                      <Settings size={18} />
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Settings size={16} />
                          <span className="text-xs font-semibold uppercase tracking-wider">Settings</span>
                        </div>
                        {settingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </>
                    )}
                  </button>
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      Settings
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
                    </div>
                  )}
                </div>

                {settingsOpen && !sidebarCollapsed && (
                  <ul className="space-y-1 ml-2">
                    {adminSettingsItems.map((item, index) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <li key={`${item.id}-settings-${index}`}>
                          <button
                            onClick={() => navigate(`/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md'
                                : 'text-blue-700 hover:bg-blue-50 hover:text-blue-900'
                            }`}
                          >
                            <Icon size={18} />
                            <span>{item.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Email System - Collapsible Section */}
            {emailSystemItems.length > 0 && (
              <div>
                <div className="relative group">
                  <button
                    onClick={() => {
                      if (sidebarCollapsed) {
                        navigate('/inbox');
                      } else {
                        setEmailSystemOpen(!emailSystemOpen);
                      }
                    }}
                    data-tour="nav-email-system"
                    className={`w-full flex items-center justify-between px-3 py-2 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all mb-2 ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    {sidebarCollapsed ? (
                      <Mail size={18} />
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Mail size={16} />
                          <span className="text-xs font-semibold uppercase tracking-wider">Email System</span>
                        </div>
                        {emailSystemOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </>
                    )}
                  </button>
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      Email System
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
                    </div>
                  )}
                </div>

                {emailSystemOpen && !sidebarCollapsed && (
                  <ul className="space-y-1 ml-2">
                    {emailSystemItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => navigate(`/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                                : 'text-blue-700 hover:bg-blue-50 hover:text-blue-900'
                            }`}
                          >
                            <Icon size={18} />
                            <span>{item.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Developer Settings - Collapsible Section */}
            {developerItems.length > 0 && (
              <div>
                <div className="relative group">
                  <button
                    onClick={() => {
                      if (sidebarCollapsed) {
                        navigate('/developer-tools');
                      } else {
                        setDeveloperSettingsOpen(!developerSettingsOpen);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all mb-2 ${
                      !cronJobHealthy
                        ? 'text-red-600 bg-red-50 hover:bg-red-100'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    {sidebarCollapsed ? (
                      <div className="relative">
                        <Code size={18} />
                        {!cronJobHealthy && (
                          <>
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Code size={16} />
                            {!cronJobHealthy && (
                              <>
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                              </>
                            )}
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-wider">Developer Settings</span>
                        </div>
                        {developerSettingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </>
                    )}
                  </button>
                  {sidebarCollapsed && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      Developer Settings {!cronJobHealthy && '⚠️'}
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
                    </div>
                  )}
                </div>

                {developerSettingsOpen && !sidebarCollapsed && (
                  <ul className="space-y-1 ml-2">
                    {developerItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => navigate(`/${item.id}`)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-gray-500 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                            }`}
                          >
                            <Icon size={18} />
                            <span>{item.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </nav>
        </div>

        {/* User Info & Logout - Fixed at Bottom */}
        <div className="flex-shrink-0 p-4 border-t border-blue-100 bg-white">
          {!sidebarCollapsed && (
            <div className="mb-3 px-3">
              <p className="text-xs text-blue-600 font-medium truncate">{profile?.email}</p>
              <p className="text-xs text-blue-400 capitalize">{profile?.role}</p>
            </div>
          )}
          {isAdmin && (
            <div className="relative group">
              <button
                onClick={() => setShowUserSidebar(t => !t)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 mb-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium ${sidebarCollapsed ? 'px-2' : ''}`}
                title={sidebarCollapsed ? 'Manage Users' : ''}
              >
                <Users size={16} />
                {!sidebarCollapsed && <span>Manage Users</span>}
              </button>
              {sidebarCollapsed && (
                <div className="absolute left-full ml-2 bottom-0 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                  Manage Users
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
                </div>
              )}
            </div>
          )}
          <div className="relative group">
            <button
              onClick={() => signOut()}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium ${sidebarCollapsed ? 'px-2' : ''}`}
              title={sidebarCollapsed ? 'Sign Out' : ''}
            >
              <LogOut size={16} />
              {!sidebarCollapsed && <span>Sign Out</span>}
            </button>
            {sidebarCollapsed && (
              <div className="absolute left-full ml-2 bottom-0 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                Sign Out
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-gray-900"></div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Impersonation Banner */}
      <ImpersonationBanner />

      {/* Main Content */}
      <main className={`min-h-screen transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} ${showReminders ? 'mr-96' : 'mr-0'} ${isImpersonating ? 'pt-16' : ''}`}>
        {/* Header with Global Search + Reminder Toggle */}
        <div className={`sticky z-40 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 ${isImpersonating ? 'top-16' : 'top-0'}`}>
          <div data-tour="global-search" className="flex-1">
            <GlobalSearchBar />
          </div>
          <TourLauncher />
          <button
            data-tour="reminders-btn"
            onClick={() => setShowReminders(!showReminders)}
            className={`relative flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
              hasOverdueReminders
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Bell className={`w-4 h-4 ${hasOverdueReminders ? 'animate-pulse' : ''}`} />
            <span className="text-sm hidden lg:inline">Reminders</span>
            {hasOverdueReminders && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
            )}
            {hasOverdueReminders && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
            )}
          </button>
        </div>

        <div className="p-8">
          <Outlet />
        </div>
      </main>

      {/* Right Sidebar - Reminders (Collapsible) */}
      {showReminders && (
        <aside className={`fixed right-0 h-screen w-96 p-6 bg-gradient-to-b from-slate-900 to-slate-800 overflow-y-auto border-l border-slate-700 shadow-2xl z-20 animate-slide-in ${isImpersonating ? 'top-16' : 'top-0'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Reminders</h2>
            <button
              onClick={() => setShowReminders(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <span className="text-2xl">×</span>
            </button>
          </div>
          <RemindersSidebar onNavigateToReminders={() => navigate('/reminders')} />
        </aside>
      )}

      {showUserSidebar && (
        <UserManagementSidebar onClose={() => setShowUserSidebar(false)} isOpen={showUserSidebar}/>
      )}
    </div>
  );
}
