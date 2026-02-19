import { useState } from 'react';
import { ArrowLeft, Users, Activity, TrendingUp, FileText, DollarSign, UserCheck, BarChart3, Mail, RefreshCw, Ticket, Settings, Palette, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import PaymentAnalytics from './PaymentAnalytics';
import UserApprovalPanel from './UserApprovalPanel';
import CollectorHub from './CollectorHub';
import AnalyticsDashboard from './AnalyticsDashboard';
import CustomerAnalyticsPage from './CustomerAnalyticsPage';
import UserActivityAnalytics from './UserActivityAnalytics';
import EmailAnalytics from './EmailAnalytics';
import SyncStatusDashboard from './SyncStatusDashboard';
import MyAssignments from './MyAssignments';
import TicketStatusManagement from './TicketStatusManagement';
import TicketTypeManagement from './TicketTypeManagement';
import InvoiceColorStatusManagement from './InvoiceColorStatusManagement';
import AutoTicketRules from './AutoTicketRules';

type AdminView =
  | 'payment-analytics'
  | 'user-approval'
  | 'collector-monitoring'
  | 'collector-performance'
  | 'invoice-analytics'
  | 'customer-analytics'
  | 'user-activity'
  | 'email-analytics'
  | 'sync-status'
  | 'my-assignments'
  | 'ticket-status-management'
  | 'ticket-type-management'
  | 'invoice-color-status-management'
  | 'auto-ticket-rules';

type AdminDashboardContainerProps = {
  onBack?: () => void;
  initialView?: AdminView;
};

export default function AdminDashboardContainer({ onBack, initialView = 'payment-analytics' }: AdminDashboardContainerProps) {
  const navigate = useNavigate();
  const { hasPermission, userRole } = useUserPermissions();
  const [currentView, setCurrentView] = useState<AdminView>(initialView);
  const handleBack = onBack || (() => navigate(-1));

  const menuItems = [
    {
      id: 'my-assignments' as AdminView,
      label: 'My Assignments',
      icon: <Ticket size={20} />,
      permissionKey: null, // Always accessible to admins/managers
    },
    {
      id: 'user-approval' as AdminView,
      label: 'User Approval',
      icon: <UserCheck size={20} />,
      permissionKey: PERMISSION_KEYS.USER_APPROVAL,
    },
    {
      id: 'collector-monitoring' as AdminView,
      label: 'Collector Monitoring',
      icon: <Activity size={20} />,
      permissionKey: PERMISSION_KEYS.COLLECTOR_MONITORING,
    },
    {
      id: 'collector-performance' as AdminView,
      label: 'Collector Performance',
      icon: <TrendingUp size={20} />,
      permissionKey: PERMISSION_KEYS.COLLECTOR_PERFORMANCE,
    },
    {
      id: 'invoice-analytics' as AdminView,
      label: 'Invoice Analytics',
      icon: <FileText size={20} />,
      permissionKey: PERMISSION_KEYS.INVOICE_ANALYTICS,
    },
    {
      id: 'customer-analytics' as AdminView,
      label: 'Customer Analytics',
      icon: <Users size={20} />,
      permissionKey: PERMISSION_KEYS.CUSTOMER_ANALYTICS,
    },
    {
      id: 'payment-analytics' as AdminView,
      label: 'Payment Analytics',
      icon: <DollarSign size={20} />,
      permissionKey: PERMISSION_KEYS.PAYMENT_ANALYTICS,
    },
    {
      id: 'user-activity' as AdminView,
      label: 'User Activity',
      icon: <Activity size={20} />,
      permissionKey: PERMISSION_KEYS.USER_ACTIVITY_LOGS,
    },
    {
      id: 'email-analytics' as AdminView,
      label: 'Email Analytics',
      icon: <Mail size={20} />,
      permissionKey: PERMISSION_KEYS.EMAIL_ANALYTICS,
    },
    {
      id: 'sync-status' as AdminView,
      label: 'Synchronization Status',
      icon: <RefreshCw size={20} />,
      permissionKey: PERMISSION_KEYS.SYNC_STATUS,
    },
    {
      id: 'ticket-status-management' as AdminView,
      label: 'Ticket Status Settings',
      icon: <Settings size={20} />,
      permissionKey: null, // Only admins and managers
    },
    {
      id: 'ticket-type-management' as AdminView,
      label: 'Ticket Type Settings',
      icon: <Ticket size={20} />,
      permissionKey: null, // Only admins and managers
    },
    {
      id: 'invoice-color-status-management' as AdminView,
      label: 'Invoice Color Settings',
      icon: <Palette size={20} />,
      permissionKey: null, // Only admins and managers
    },
    {
      id: 'auto-ticket-rules' as AdminView,
      label: 'Auto-Ticket Rules',
      icon: <Clock size={20} />,
      permissionKey: null, // Only admins and managers
    },
  ];

  const getViewTitle = () => {
    const item = menuItems.find(m => m.id === currentView);
    return item?.label || 'Admin Dashboard';
  };

  const renderView = () => {
    switch (currentView) {
      case 'my-assignments':
        return (
          <div className="p-8">
            <MyAssignments onBack={() => setCurrentView('my-assignments')} />
          </div>
        );
      case 'payment-analytics':
        return <PaymentAnalytics onBack={() => setCurrentView('payment-analytics')} />;
      case 'user-approval':
        return <UserApprovalPanel onBack={() => setCurrentView('user-approval')} />;
      case 'collector-monitoring':
        return <CollectorHub onBack={() => setCurrentView('collector-monitoring')} />;
      case 'collector-performance':
        return <CollectorHub onBack={() => setCurrentView('collector-performance')} />;
      case 'invoice-analytics':
        return <AnalyticsDashboard onBack={() => setCurrentView('invoice-analytics')} onNavigate={() => {}} />;
      case 'customer-analytics':
        return <CustomerAnalyticsPage onBack={() => setCurrentView('customer-analytics')} />;
      case 'user-activity':
        return <UserActivityAnalytics onBack={() => setCurrentView('user-activity')} />;
      case 'email-analytics':
        return <EmailAnalytics onBack={() => setCurrentView('email-analytics')} />;
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
          <p className="text-xs text-slate-500 mt-1">System Analytics & Management</p>
        </div>

        <nav className="space-y-1 flex-1">
          {menuItems.map(item => {
            const hasAccess = item.permissionKey === null
              ? (userRole === 'admin' || userRole === 'manager')
              : (userRole === 'admin' || userRole === 'manager' || hasPermission(item.permissionKey, 'view'));

            if (!hasAccess) return null;

            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  currentView === item.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.icon}
                <span className="flex-1 text-left text-sm">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        {renderView()}
      </div>
    </div>
  );
}
