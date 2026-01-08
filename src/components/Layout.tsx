import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
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
  Code
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import RemindersSidebar from './RemindersSidebar';
import ImpersonationBanner from './ImpersonationBanner';
import { supabase } from '../lib/supabase';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import UserManagementSidebar from './UserManagementSidebar';

export default function Layout() {
  const { profile, signOut, user, isImpersonating } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission, isAdmin } = useUserPermissions();
  const isCollector = profile?.role === 'collector';
  const [showReminders, setShowReminders] = useState(false);
  const [hasOverdueReminders, setHasOverdueReminders] = useState(false);
  const [developerSettingsOpen, setDeveloperSettingsOpen] = useState(false);
  const [emailSystemOpen, setEmailSystemOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);
  const [showUserSidebar, setShowUserSidebar] = useState(false);

  const currentView = location.pathname.substring(1) || 'dashboard';

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

  const allMenuSections = [
    {
      title: 'Customer Management',
      items: [
        ...(hasPermission(PERMISSION_KEYS.CUSTOMERS_VIEW) ? [{ id: 'acumatica-customers', name: 'Customers', icon: Users, permission: PERMISSION_KEYS.CUSTOMERS_VIEW }] : []),
        ...(hasPermission(PERMISSION_KEYS.CUSTOMERS_DASHBOARD) ? [{ id: 'customer-analytics', name: 'Customer Dashboard', icon: BarChart3, permission: PERMISSION_KEYS.CUSTOMERS_DASHBOARD }] : []),
        ...(isCollector ? [{ id: 'my-assignments', name: 'My Assignments', icon: Ticket }] : []),
      ]
    },
    {
      title: 'Invoice Management',
      items: [
        ...(hasPermission(PERMISSION_KEYS.INVOICES_VIEW) ? [{ id: 'acumatica-invoices', name: 'Invoices', icon: FileText, permission: PERMISSION_KEYS.INVOICES_VIEW }] : []),
        ...(hasPermission(PERMISSION_KEYS.INVOICES_STATUS) ? [{ id: 'invoice-status-admin', name: 'Invoice Status', icon: Shield, permission: PERMISSION_KEYS.INVOICES_STATUS }] : []),
      ]
    },
    {
      title: 'Payment Management',
      items: [
        ...(hasPermission(PERMISSION_KEYS.PAYMENTS_VIEW) ? [{ id: 'acumatica-payments', name: 'Payments', icon: DollarSign, permission: PERMISSION_KEYS.PAYMENTS_VIEW }] : []),
      ]
    },
    {
      title: 'Reminders',
      items: [
        ...(hasPermission(PERMISSION_KEYS.REMINDERS_VIEW) ? [{ id: 'reminders', name: 'My Reminders', icon: Bell, permission: PERMISSION_KEYS.REMINDERS_VIEW }] : []),
      ]
    },
    {
      title: 'Administration',
      items: [
        ...(isAdmin ? [{ id: 'collection-ticketing', name: 'Ticketing System', icon: Ticket }] : []),
        ...(hasPermission(PERMISSION_KEYS.ADMIN_SYNC_CONFIG) ? [{ id: 'sync-config', name: 'Sync Settings', icon: Settings, permission: PERMISSION_KEYS.ADMIN_SYNC_CONFIG }] : []),
      ]
    },
  ];

  const emailSystemItems = [
    ...(hasPermission(PERMISSION_KEYS.EMAIL_INBOX) ? [{ id: 'inbox', name: 'Inbox', icon: Inbox, permission: PERMISSION_KEYS.EMAIL_INBOX }] : []),
    ...(hasPermission(PERMISSION_KEYS.CUSTOMERS_ASSIGNMENTS) ? [{ id: 'assignments', name: 'Assignments', icon: LinkIcon, permission: PERMISSION_KEYS.CUSTOMERS_ASSIGNMENTS }] : []),
    ...(hasPermission(PERMISSION_KEYS.EMAIL_FORMULAS) ? [{ id: 'formulas', name: 'Formulas', icon: Calendar, permission: PERMISSION_KEYS.EMAIL_FORMULAS }] : []),
    ...(hasPermission(PERMISSION_KEYS.EMAIL_TEMPLATES) ? [{ id: 'templates', name: 'Templates', icon: Mail, permission: PERMISSION_KEYS.EMAIL_TEMPLATES }] : []),
    ...(hasPermission(PERMISSION_KEYS.EMAIL_LOGS) ? [{ id: 'email-logs', name: 'Email Logs', icon: Clock, permission: PERMISSION_KEYS.EMAIL_LOGS }] : []),
  ];

  const hasAnyAdminPermission = isAdmin ||
    hasPermission(PERMISSION_KEYS.USER_APPROVAL, 'view') ||
    hasPermission(PERMISSION_KEYS.COLLECTOR_MONITORING, 'view') ||
    hasPermission(PERMISSION_KEYS.COLLECTOR_PERFORMANCE, 'view') ||
    hasPermission(PERMISSION_KEYS.INVOICE_ANALYTICS, 'view') ||
    hasPermission(PERMISSION_KEYS.CUSTOMER_ANALYTICS, 'view') ||
    hasPermission(PERMISSION_KEYS.PAYMENT_ANALYTICS, 'view') ||
    hasPermission(PERMISSION_KEYS.USER_ACTIVITY_LOGS, 'view') ||
    hasPermission(PERMISSION_KEYS.EMAIL_ANALYTICS, 'view') ||
    hasPermission(PERMISSION_KEYS.SYNC_STATUS, 'view');

  const adminDashboardItems = hasAnyAdminPermission ? [
    { id: 'user-approval', name: 'User Approval', icon: Shield },
    { id: 'collector-monitoring', name: 'Collector Monitoring', icon: Activity },
    { id: 'collector-performance', name: 'Collector Performance', icon: BarChart3 },
    { id: 'customer-analytics', name: 'Customer Analytics', icon: Users },
    { id: 'payment-analytics', name: 'Payment Analytics', icon: DollarSign },
    { id: 'user-activity', name: 'User Activity', icon: Activity },
    { id: 'email-analytics', name: 'Email Analytics', icon: Mail },
    { id: 'sync-status', name: 'Synchronization Status', icon: RefreshCw },
  ] : [];

  const developerItems = [
    ...(isAdmin ? [{ id: 'developer-tools', name: 'Developer Tools', icon: Code }] : []),
    ...(hasPermission(PERMISSION_KEYS.MONITOR_SYNC_STATUS) ? [{ id: 'sync-status', name: 'System Health', icon: Activity, permission: PERMISSION_KEYS.MONITOR_SYNC_STATUS }] : []),
    ...(hasPermission(PERMISSION_KEYS.LOGS_SYNC) ? [{ id: 'sync-logs', name: 'Sync Change Logs', icon: RefreshCw, permission: PERMISSION_KEYS.LOGS_SYNC }] : []),
    ...(hasPermission(PERMISSION_KEYS.LOGS_SCHEDULER) ? [{ id: 'schedule', name: 'Scheduler', icon: Clock, permission: PERMISSION_KEYS.LOGS_SCHEDULER }] : []),
    ...(hasPermission(PERMISSION_KEYS.MONITOR_CRON) ? [{ id: 'logs', name: 'System Logs', icon: Database, permission: PERMISSION_KEYS.MONITOR_CRON }] : []),
  ];

  const menuSections = allMenuSections.filter(section => section.items.length > 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Sidebar */}
      <aside className={`fixed left-0 h-screen w-64 bg-white border-r border-gray-200 shadow-sm flex flex-col ${isImpersonating ? 'top-16' : 'top-0'}`}>
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Logo Header */}
          <div className="p-6 border-b border-blue-100">
            <div className="flex items-center justify-center mb-2">
              <img
                src="https://ahmrghovmuxowchijumv.supabase.co/storage/v1/object/public/uploaded-images/-logoventure_1644182585__38264.webp"
                alt="Venture Respiratory"
                className="h-12 w-auto"
              />
            </div>
            <p className="text-center text-xs text-blue-600 font-medium">Admin Portal</p>
          </div>

          {/* Navigation Menu */}
          <nav className="p-4 space-y-6">
            {menuSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-blue-900 uppercase tracking-wider mb-2 px-3">
                  {section.title}
                </h3>
                <ul className="space-y-1">
                  {section.items.map((item) => {
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
              </div>
            ))}

            {/* Admin Dashboard - Collapsible Section */}
            {adminDashboardItems.length > 0 && (
              <div>
                <button
                  onClick={() => {
                    setAdminDashboardOpen(!adminDashboardOpen);
                    if (!adminDashboardOpen) {
                      navigate('/payment-analytics');
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all mb-2 ${
                    adminDashboardItems.some(item => currentView === item.id)
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                      : 'text-blue-700 hover:text-blue-900 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Admin Dashboard</span>
                  </div>
                  {adminDashboardOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {adminDashboardOpen && (
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

            {/* Email System - Collapsible Section */}
            {emailSystemItems.length > 0 && (
              <div>
                <button
                  onClick={() => setEmailSystemOpen(!emailSystemOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-all mb-2"
                >
                  <div className="flex items-center gap-2">
                    <Mail size={16} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Email System</span>
                  </div>
                  {emailSystemOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {emailSystemOpen && (
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
                <button
                  onClick={() => setDeveloperSettingsOpen(!developerSettingsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-all mb-2"
                >
                  <div className="flex items-center gap-2">
                    <Code size={16} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Developer Settings</span>
                  </div>
                  {developerSettingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {developerSettingsOpen && (
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
          <div className="mb-3 px-3">
            <p className="text-xs text-blue-600 font-medium truncate">{profile?.email}</p>
            <p className="text-xs text-blue-400 capitalize">{profile?.role}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowUserSidebar(t => !t)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 mb-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              <Users size={16} />
              <span>Manage Users</span>
            </button>
          )}
              {console.warn(showUserSidebar)}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Impersonation Banner */}
      <ImpersonationBanner />

      {/* Main Content */}
      <main className={`ml-64 min-h-screen transition-all duration-300 ${showReminders ? 'mr-96' : 'mr-0'} ${isImpersonating ? 'pt-16' : ''}`}>
        {/* Header with Reminder Toggle */}
        <div className={`sticky z-10 bg-white border-b border-slate-200 px-8 py-4 flex justify-end ${isImpersonating ? 'top-16' : 'top-0'}`}>
          <button
            onClick={() => setShowReminders(!showReminders)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              hasOverdueReminders
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Bell className={`w-5 h-5 ${hasOverdueReminders ? 'animate-pulse' : ''}`} />
            <span>Reminders</span>
            {hasOverdueReminders && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
            )}
            {hasOverdueReminders && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
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
