import { useState } from 'react';
import Layout from './Layout';
import Dashboard from './Dashboard';
import EmailFormulas from './EmailFormulas';
import EmailTemplates from './EmailTemplates';
import Customers from './Customers';
import CustomerAssignments from './CustomerAssignments';
import CronMonitor from './CronMonitor';
import InboxDashboard from './InboxDashboard';
import SchedulerLogs from './SchedulerLogs';
import AcumaticaInvoiceTest from './AcumaticaInvoiceTest';
import AcumaticaCustomers from './AcumaticaCustomers';
import AcumaticaInvoices from './AcumaticaInvoices';
import AcumaticaPayments from './AcumaticaPayments';
import AnalyticsDashboard from './AnalyticsDashboard';
import InvoiceStatusAnalytics from './InvoiceStatusAnalytics';
import PaymentAnalytics from './PaymentAnalytics';
import CustomerReportsMonthly from './CustomerReportsMonthly';
import CustomerReportTemplates from './CustomerReportTemplates';
import CustomerEmailTracking from './CustomerEmailTracking';
import SystemDocumentation from './SystemDocumentation';
import WebhookConfiguration from './WebhookConfiguration';
import SyncStatusDashboard from './SyncStatusDashboard';
import SyncConfiguration from './SyncConfiguration';
import InvoiceStatusAdminPanel from './InvoiceStatusAdminPanel';
import AcumaticaFilesTest from './AcumaticaFilesTest';
import UserManagementSidebar from './UserManagementSidebar';
import RemindersPortal from './RemindersPortal';
import ReminderPopup from './ReminderPopup';
import AcumaticaCredentialTester from './AcumaticaCredentialTester';
import BatchApplicationFetcher from './BatchApplicationFetcher';
import BulkApplicationFetcher from './BulkApplicationFetcher';
import SyncChangeLogsViewer from './SyncChangeLogsViewer';
import PaymentStructureDiagnostic from './PaymentStructureDiagnostic';
import PaymentAttachmentTest from './PaymentAttachmentTest';
import RecentSyncApplicationCheck from './RecentSyncApplicationCheck';
import PaymentCountComparison from './PaymentCountComparison';
import StripePayments from './StripePayments';
import PaymentApplicationStatus from './PaymentApplicationStatus';
import OrphanedInvoiceFixer from './OrphanedInvoiceFixer';
import ApplicationDateDiagnostic from './ApplicationDateDiagnostic';
import InvoiceFormatChecker from './InvoiceFormatChecker';
import AcumaticaInvoiceVariationChecker from './AcumaticaInvoiceVariationChecker';
import OrphanedApplicationDiagnostic from './OrphanedApplicationDiagnostic';
import CollectionTicketing from './CollectionTicketing';
import InvoiceColorStatusManagement from './InvoiceColorStatusManagement';
import MyAssignments from './MyAssignments';
import CollectorPerformanceAnalytics from './CollectorPerformanceAnalytics';
import RevenueAnalytics from './RevenueAnalytics';
import CustomerAnalyticsPage from './CustomerAnalyticsPage';
import UserActivityAnalytics from './UserActivityAnalytics';
import EmailAnalytics from './EmailAnalytics';
import StripeAnalytics from './StripeAnalytics';
import ComprehensiveAdminDashboard from './ComprehensiveAdminDashboard';
import CollectorControlPanel from './CollectorControlPanel';
import AdminCollectorMonitoring from './AdminCollectorMonitoring';
import UserApprovalPanel from './UserApprovalPanel';
import AdminDashboardContainer from './AdminDashboardContainer';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import { Lock } from 'lucide-react';

type View = 'dashboard' | 'inbox' | 'formulas' | 'templates' | 'customers' | 'assignments' | 'schedule' | 'logs' | 'users' | 'acumatica' | 'acumatica-customers' | 'acumatica-invoices' | 'acumatica-payments' | 'invoice-analytics' | 'payment-analytics' | 'webhooks' | 'sync-status' | 'sync-config' | 'invoice-status-admin' | 'invoice-status-analytics' | 'customer-reports-monthly' | 'customer-reports' | 'system-documentation' | 'acumatica-files-test' | 'reminders' | 'credential-tester' | 'batch-fetcher' | 'bulk-fetcher' | 'sync-logs' | 'payment-diagnostic' | 'payment-attachment-test' | 'payment-count' | 'stripe-payments' | 'payment-app-status' | 'orphaned-invoice-fixer' | 'application-date-diagnostic' | 'invoice-format-checker' | 'invoice-variation-checker' | 'orphaned-application-diagnostic' | 'collection-ticketing' | 'invoice-color-settings' | 'admin-dashboard' | 'customer-dashboard' | 'invoice-status' | 'payment-applications' | 'my-assignments' | 'collector-performance' | 'revenue-analytics' | 'customer-analytics' | 'user-activity' | 'email-analytics' | 'stripe-analytics' | 'collector-control-panel' | 'collector-monitoring' | 'user-approval' | 'recent-sync-app-check';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { hasPermission, userRole } = useUserPermissions();
  const isCollector = profile?.role === 'collector';
  const [currentView, setCurrentView] = useState<View>(isCollector ? 'my-assignments' : 'admin-dashboard');

  // Check if user has access to admin dashboard
  const hasAdminAccess = userRole === 'admin' || userRole === 'manager' || hasPermission(PERMISSION_KEYS.ADMIN_DASHBOARD, 'view');
  const [showUserSidebar, setShowUserSidebar] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard onNavigate={(view) => setCurrentView(view as View)} />;
      case 'inbox':
        return <InboxDashboard />;
      case 'formulas':
        return <EmailFormulas />;
      case 'templates':
        return <EmailTemplates />;
      case 'customers':
        return <Customers />;
      case 'assignments':
        return <CustomerAssignments />;
      case 'schedule':
        return <CronMonitor />;
      case 'logs':
        return <SchedulerLogs />;
      case 'acumatica':
        return <AcumaticaInvoiceTest />;
      case 'acumatica-customers':
        return <AcumaticaCustomers onBack={() => setCurrentView('admin-dashboard')} />;
      case 'acumatica-invoices':
        return <AcumaticaInvoices onBack={() => setCurrentView('admin-dashboard')} />;
      case 'acumatica-payments':
        return <AcumaticaPayments onBack={() => setCurrentView('admin-dashboard')} onNavigate={(view) => setCurrentView(view as View)} />;
      case 'invoice-analytics':
        return <AnalyticsDashboard onBack={() => setCurrentView('admin-dashboard')} onNavigate={(view) => setCurrentView(view as View)} />;
      case 'payment-analytics':
        return <PaymentAnalytics onBack={() => setCurrentView('admin-dashboard')} />;
      case 'webhooks':
        return <WebhookConfiguration onBack={() => setCurrentView('admin-dashboard')} />;
      case 'sync-status':
        return <SyncStatusDashboard onBack={() => setCurrentView('admin-dashboard')} />;
      case 'sync-config':
        return <SyncConfiguration />;
      case 'invoice-status-admin':
        return <InvoiceStatusAdminPanel onBack={() => setCurrentView('admin-dashboard')} />;
      case 'invoice-status-analytics':
        return <InvoiceStatusAnalytics onBack={() => setCurrentView('admin-dashboard')} />;
      case 'customer-reports-monthly':
        return <CustomerReportsMonthly onBack={() => setCurrentView('admin-dashboard')} />;
      case 'customer-reports':
        return <CustomerReportsMonthly onBack={() => setCurrentView('admin-dashboard')} />;
      case 'customer-report-templates':
        return <CustomerReportTemplates onBack={() => setCurrentView('admin-dashboard')} />;
      case 'customer-email-tracking':
        return <CustomerEmailTracking onBack={() => setCurrentView('admin-dashboard')} />;
      case 'system-documentation':
        return <SystemDocumentation onBack={() => setCurrentView('admin-dashboard')} />;
      case 'acumatica-files-test':
        return <AcumaticaFilesTest />;
      case 'reminders':
        return <RemindersPortal onBack={() => setCurrentView('admin-dashboard')} />;
      case 'credential-tester':
        return <AcumaticaCredentialTester onBack={() => setCurrentView('admin-dashboard')} />;
      case 'batch-fetcher':
        return <BatchApplicationFetcher onBack={() => setCurrentView('acumatica-payments')} />;
      case 'bulk-fetcher':
        return <BulkApplicationFetcher onBack={() => setCurrentView('acumatica-payments')} />;
      case 'sync-logs':
        return <SyncChangeLogsViewer onBack={() => setCurrentView('admin-dashboard')} />;
      case 'payment-diagnostic':
        return <PaymentStructureDiagnostic onBack={() => setCurrentView('acumatica-payments')} />;
      case 'payment-attachment-test':
        return <PaymentAttachmentTest onBack={() => setCurrentView('acumatica-payments')} />;
      case 'payment-count':
        return <PaymentCountComparison onBack={() => setCurrentView('acumatica-payments')} />;
      case 'stripe-payments':
        return <StripePayments onBack={() => setCurrentView('admin-dashboard')} />;
      case 'payment-app-status':
        return <PaymentApplicationStatus onBack={() => setCurrentView('acumatica-payments')} />;
      case 'orphaned-invoice-fixer':
        return <OrphanedInvoiceFixer onBack={() => setCurrentView('acumatica-payments')} />;
      case 'application-date-diagnostic':
        return <ApplicationDateDiagnostic onBack={() => setCurrentView('acumatica-payments')} />;
      case 'invoice-format-checker':
        return <InvoiceFormatChecker onBack={() => setCurrentView('admin-dashboard')} />;
      case 'invoice-variation-checker':
        return <AcumaticaInvoiceVariationChecker onBack={() => setCurrentView('admin-dashboard')} />;
      case 'orphaned-application-diagnostic':
        return <OrphanedApplicationDiagnostic onBack={() => setCurrentView('acumatica-payments')} />;
      case 'collection-ticketing':
        return <CollectionTicketing onBack={() => setCurrentView('admin-dashboard')} />;
      case 'invoice-color-settings':
        return <InvoiceColorStatusManagement onBack={() => setCurrentView('admin-dashboard')} />;
      case 'my-assignments':
        return <MyAssignments onBack={() => setCurrentView('admin-dashboard')} />;
      case 'collector-performance':
        return <CollectorPerformanceAnalytics onBack={() => setCurrentView('admin-dashboard')} />;
      case 'revenue-analytics':
        return <RevenueAnalytics onBack={() => setCurrentView('admin-dashboard')} onNavigate={(view) => setCurrentView(view as View)} />;
      case 'customer-analytics':
        return <CustomerAnalyticsPage onBack={() => setCurrentView('admin-dashboard')} />;
      case 'user-activity':
        return <UserActivityAnalytics onBack={() => setCurrentView('admin-dashboard')} />;
      case 'email-analytics':
        return <EmailAnalytics onBack={() => setCurrentView('admin-dashboard')} />;
      case 'stripe-analytics':
        return <StripeAnalytics onBack={() => setCurrentView('admin-dashboard')} />;
      case 'collector-control-panel':
        return <CollectorControlPanel onBack={() => setCurrentView('admin-dashboard')} />;
      case 'collector-monitoring':
        return <AdminCollectorMonitoring onBack={() => setCurrentView('admin-dashboard')} />;
      case 'user-approval':
        return <UserApprovalPanel onBack={() => setCurrentView('admin-dashboard')} />;
      case 'recent-sync-app-check':
        return <RecentSyncApplicationCheck onBack={() => setCurrentView('admin-dashboard')} />;
      case 'admin-dashboard':
        return <AdminDashboardContainer onBack={() => setCurrentView('dashboard')} />;
      default:
        return <AdminDashboardContainer onBack={() => setCurrentView('dashboard')} />;
    }
  };

  // Check permission before rendering
  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-12 text-center border border-gray-100">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 rounded-full mb-6">
              <Lock className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Access Denied</h2>
            <p className="text-gray-600 text-lg mb-2">
              You do not have permission to access the Admin Dashboard.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this area.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view as View)}
        onOpenUserManagement={() => setShowUserSidebar(true)}
      >
        {renderView()}
      </Layout>
      <UserManagementSidebar
        isOpen={showUserSidebar}
        onClose={() => setShowUserSidebar(false)}
      />
      <ReminderPopup onViewAll={() => setCurrentView('reminders')} />
    </>
  );
}
