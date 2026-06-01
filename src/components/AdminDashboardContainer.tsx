import { useState } from 'react';
import { ArrowLeft, Users, Activity, FileText, DollarSign, UserCheck, BarChart3, Mail, RefreshCw, Ticket, Settings, Palette, Clock, ChevronDown, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import PaymentAnalytics from './PaymentAnalytics';
import UserApprovalPanel from './UserApprovalPanel';
import CollectorHub from './CollectorHub';
import AnalyticsDashboard from './AnalyticsDashboard';
import CustomerAnalyticsPage from './CustomerAnalyticsPage';
import UserActivityAnalytics from './UserActivityAnalytics';
import SyncStatusDashboard from './SyncStatusDashboard';
import MyAssignments from './MyAssignments';
import TicketStatusManagement from './TicketStatusManagement';
import TicketTypeManagement from './TicketTypeManagement';
import InvoiceColorStatusManagement from './InvoiceColorStatusManagement';
import AutoTicketRules from './AutoTicketRules';
import AdminCreateUser from './AdminCreateUser';
import EmailSettings from './EmailSettings';
import SystemDocumentation from './SystemDocumentation';

type AdminView =
  | 'payment-analytics'
  | 'user-approval'
  | 'collector-monitoring'
  | 'collector-performance'
  | 'invoice-analytics'
  | 'customer-analytics'
  | 'user-activity'
  | 'sync-status'
  | 'my-assignments'
  | 'ticket-status-management'
  | 'ticket-type-management'
  | 'invoice-color-status-management'
  | 'auto-ticket-rules'
  | 'create-user'
  | 'email-settings'
  | 'system-documentation';

type AdminDashboardContainerProps = {
  onBack?: () => void;
  initialView?: AdminView;
};

type MenuItem = {
  id: AdminView;
  label: string;
  icon: JSX.Element;
};

type MenuGroup = {
  title: string;
  items: MenuItem[];
};

export default function AdminDashboardContainer({ onBack, initialView = 'payment-analytics' }: AdminDashboardContainerProps) {
  const navigate = useNavigate();

  const [currentView, setCurrentView] = useState<AdminView>(initialView);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const handleBack = onBack || (() => navigate(-1));

  const menuGroups: MenuGroup[] = [
    {
      title: 'Analytics',
      items: [
        { id: 'my-assignments', label: 'My Assignments', icon: <Ticket size={18} /> },
        { id: 'collector-monitoring', label: 'Collector Dashboard', icon: <Activity size={18} /> },
        { id: 'invoice-analytics', label: 'Invoice Analytics', icon: <FileText size={18} /> },
        { id: 'customer-analytics', label: 'Customer Analytics', icon: <Users size={18} /> },
        { id: 'payment-analytics', label: 'Payment Analytics', icon: <DollarSign size={18} /> },
      ],
    },
  ];

  const settingsItems: MenuItem[] = [
    { id: 'invoice-color-status-management', label: 'Invoice Color Settings', icon: <Palette size={18} /> },
    { id: 'user-approval', label: 'User Approval', icon: <UserCheck size={18} /> },
    { id: 'create-user', label: 'Create New User', icon: <Users size={18} /> },
    { id: 'user-activity', label: 'User Activity', icon: <Activity size={18} /> },
    { id: 'sync-status', label: 'Synchronization Status', icon: <RefreshCw size={18} /> },
    { id: 'ticket-status-management', label: 'Ticket Status Settings', icon: <Settings size={18} /> },
    { id: 'ticket-type-management', label: 'Ticket Type Settings', icon: <Ticket size={18} /> },
    { id: 'auto-ticket-rules', label: 'Auto-Ticket Rules', icon: <Clock size={18} /> },
    { id: 'email-settings', label: 'Email Settings', icon: <Mail size={18} /> },
    { id: 'system-documentation', label: 'Documentation', icon: <BookOpen size={18} /> },
  ];



  const isSettingsView = settingsItems.some(s => s.id === currentView);

  // Auto-expand settings if current view is a settings item
  if (isSettingsView && !settingsExpanded) {
    setSettingsExpanded(true);
  }

  const renderView = () => {
    switch (currentView) {
      case 'my-assignments':
        return <div className="p-8"><MyAssignments onBack={() => setCurrentView('my-assignments')} /></div>;
      case 'payment-analytics':
        return <PaymentAnalytics onBack={() => setCurrentView('payment-analytics')} />;
      case 'user-approval':
        return <UserApprovalPanel onBack={() => setCurrentView('user-approval')} />;
      case 'collector-monitoring':
      case 'collector-performance':
        return <CollectorHub onBack={() => setCurrentView('collector-monitoring')} />;
      case 'invoice-analytics':
        return <AnalyticsDashboard onBack={() => setCurrentView('invoice-analytics')} onNavigate={() => {}} />;
      case 'customer-analytics':
        return <CustomerAnalyticsPage onBack={() => setCurrentView('customer-analytics')} />;
      case 'user-activity':
        return <UserActivityAnalytics onBack={() => setCurrentView('user-activity')} />;
      case 'sync-status':
        return <SyncStatusDashboard onBack={() => setCurrentView('sync-status')} />;
      case 'ticket-status-management':
        return <TicketStatusManagement onBack={() => setCurrentView('ticket-status-management')} />;
      case 'ticket-type-management':
        return <TicketTypeManagement onBack={() => setCurrentView('ticket-type-management')} />;
      case 'invoice-color-status-management':
        return <InvoiceColorStatusManagement onBack={() => setCurrentView('invoice-color-status-management')} />;
      case 'auto-ticket-rules':
        return <AutoTicketRules onBack={() => setCurrentView('auto-ticket-rules')} />;
      case 'create-user':
        return <AdminCreateUser onBack={() => setCurrentView('create-user')} />;
      case 'email-settings':
        return <EmailSettings />;
      case 'system-documentation':
        return <SystemDocumentation onBack={() => setCurrentView('system-documentation')} />;
      default:
        return <PaymentAnalytics onBack={() => setCurrentView('payment-analytics')} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex">
      <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Back</span>
        </button>

        <div className="mb-4 px-2">
          <h2 className="text-lg font-bold text-slate-800">Admin Dashboard</h2>
          <p className="text-xs text-slate-500 mt-1">Analytics & Management</p>
        </div>

        <nav className="space-y-1 flex-1 overflow-y-auto">
          {menuGroups.map(group => {
            const visibleItems = group.items;
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title}>
                <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group.title}</p>
                {visibleItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      currentView === item.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}

          {/* Settings Section */}
          <div>
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className={`w-full flex items-center justify-between px-3 pt-4 pb-1 transition-colors group`}
            >
              <div className="flex items-center gap-1.5">
                <Settings size={12} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-slate-600 transition-colors">Settings</span>
              </div>
              <ChevronDown size={12} className={`text-slate-400 transition-transform duration-200 ${settingsExpanded ? 'rotate-180' : ''}`} />
            </button>
            {settingsExpanded && (
              <div className="space-y-0.5 mt-1">
                {settingsItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      currentView === item.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        {renderView()}
      </div>
    </div>
  );
}
