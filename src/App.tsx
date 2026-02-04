import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import SignIn from './components/SignIn';
import ResetPassword from './components/ResetPassword';
import Layout from './components/Layout';
import EmailFormulas from './components/EmailFormulas';
import EmailTemplates from './components/EmailTemplates';
import Customers from './components/Customers';
import CustomerAssignments from './components/CustomerAssignments';
import CronMonitor from './components/CronMonitor';
import InboxDashboard from './components/InboxDashboard';
import SchedulerLogs from './components/SchedulerLogs';
import AcumaticaInvoiceTest from './components/AcumaticaInvoiceTest';
import AcumaticaCustomers from './components/AcumaticaCustomers';
import AcumaticaInvoices from './components/AcumaticaInvoices';
import AcumaticaPayments from './components/AcumaticaPayments';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import InvoiceStatusAnalytics from './components/InvoiceStatusAnalytics';
import PaymentAnalytics from './components/PaymentAnalytics';
import CustomerReportsMonthly from './components/CustomerReportsMonthly';
import SystemDocumentation from './components/SystemDocumentation';
import WebhookConfiguration from './components/WebhookConfiguration';
import SyncStatusDashboard from './components/SyncStatusDashboard';
import SyncConfiguration from './components/SyncConfiguration';
import InvoiceStatusAdminPanel from './components/InvoiceStatusAdminPanel';
import AcumaticaFilesTest from './components/AcumaticaFilesTest';
import RemindersPortal from './components/RemindersPortal';
import AcumaticaCredentialTester from './components/AcumaticaCredentialTester';
import BatchApplicationFetcher from './components/BatchApplicationFetcher';
import BulkApplicationFetcher from './components/BulkApplicationFetcher';
import SyncChangeLogsViewer from './components/SyncChangeLogsViewer';
import SyncDiagnostic from './components/SyncDiagnostic';
import PaymentStructureDiagnostic from './components/PaymentStructureDiagnostic';
import PaymentAttachmentTest from './components/PaymentAttachmentTest';
import RecentSyncApplicationCheck from './components/RecentSyncApplicationCheck';
import PaymentCountComparison from './components/PaymentCountComparison';
import PaymentApplicationStatus from './components/PaymentApplicationStatus';
import PaymentApplicationResync from './components/PaymentApplicationResync';
import OrphanedInvoiceFixer from './components/OrphanedInvoiceFixer';
import ApplicationDateDiagnostic from './components/ApplicationDateDiagnostic';
import InvoiceFormatChecker from './components/InvoiceFormatChecker';
import AcumaticaInvoiceVariationChecker from './components/AcumaticaInvoiceVariationChecker';
import OrphanedApplicationDiagnostic from './components/OrphanedApplicationDiagnostic';
import CollectionTicketing from './components/CollectionTicketing';
import MyAssignments from './components/MyAssignments';
import CollectorPerformanceAnalytics from './components/CollectorPerformanceAnalytics';
import RevenueAnalytics from './components/RevenueAnalytics';
import CustomerAnalyticsPage from './components/CustomerAnalyticsPage';
import UserActivityAnalytics from './components/UserActivityAnalytics';
import EmailAnalytics from './components/EmailAnalytics';
import CollectorControlPanel from './components/CollectorControlPanel';
import AdminCollectorMonitoring from './components/AdminCollectorMonitoring';
import UserApprovalPanel from './components/UserApprovalPanel';
import PaymentApplicationDiagnostic from './components/PaymentApplicationDiagnostic';
import PasswordResetTester from './components/PasswordResetTester';
import TestPaymentAppAndAttachmentSync from './components/TestPaymentAppAndAttachmentSync';
import AutoBackfillMonitor from './components/AutoBackfillMonitor';
import PaymentStatusDiagnostic from './components/PaymentStatusDiagnostic';
import PaymentDateRangeResync from './components/PaymentDateRangeResync';
import PaymentSyncHealthCheck from './components/PaymentSyncHealthCheck';
import PaymentSyncDiagnostic from './components/PaymentSyncDiagnostic';
import { DeveloperTools } from './components/DeveloperTools';
import Refetch2024Payments from './components/Refetch2024Payments';
import AdminCreateUser from './components/AdminCreateUser';
import ResendTemporaryPassword from './components/ResendTemporaryPassword';
import ForceDeleteUser from './components/ForceDeleteUser';
import TicketStatusManagement from './components/TicketStatusManagement';
import InvoiceColorStatusManagement from './components/InvoiceColorStatusManagement';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-400">Loading...</p>
      </div>
    </div>
  );
}

function getDefaultRouteForRole(role: string): string {
  switch (role) {
    case 'admin':
      return '/payment-analytics';
    case 'collector':
      return '/my-assignments';
    default:
      return '/customers';
  }
}

function AppContent() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user || !profile) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }

  const defaultRoute = getDefaultRouteForRole(profile.role);

  return (
    <Routes>
      <Route path="/signin" element={<Navigate to={defaultRoute} replace />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="inbox" element={<InboxDashboard />} />
        <Route path="formulas" element={<EmailFormulas />} />
        <Route path="templates" element={<EmailTemplates />} />
        <Route path="customers" element={<Customers />} />
        <Route path="assignments" element={<CustomerAssignments />} />
        <Route path="schedule" element={<CronMonitor />} />
        <Route path="logs" element={<SchedulerLogs />} />
        <Route path="acumatica" element={<AcumaticaInvoiceTest />} />
        <Route path="acumatica-customers" element={<AcumaticaCustomers />} />
        <Route path="acumatica-invoices" element={<AcumaticaInvoices />} />
        <Route path="acumatica-payments" element={<AcumaticaPayments />} />
        <Route path="invoice-analytics" element={<AnalyticsDashboard />} />
        <Route path="payment-analytics" element={<PaymentAnalytics />} />
        <Route path="webhooks" element={<WebhookConfiguration />} />
        <Route path="sync-status" element={<SyncStatusDashboard />} />
        <Route path="sync-config" element={<SyncConfiguration />} />
        <Route path="invoice-status-admin" element={<InvoiceStatusAdminPanel />} />
        <Route path="invoice-status-analytics" element={<InvoiceStatusAnalytics />} />
        <Route path="customer-reports" element={<CustomerReportsMonthly />} />
        <Route path="system-documentation" element={<SystemDocumentation />} />
        <Route path="acumatica-files-test" element={<AcumaticaFilesTest />} />
        <Route path="reminders" element={<RemindersPortal />} />
        <Route path="credential-tester" element={<AcumaticaCredentialTester />} />
        <Route path="batch-fetcher" element={<BatchApplicationFetcher />} />
        <Route path="bulk-fetcher" element={<BulkApplicationFetcher />} />
        <Route path="sync-logs" element={<SyncChangeLogsViewer />} />
        <Route path="sync-diagnostic" element={<SyncDiagnostic />} />
        <Route path="payment-diagnostic" element={<PaymentStructureDiagnostic />} />
        <Route path="payment-attachment-test" element={<PaymentAttachmentTest />} />
        <Route path="recent-sync-app-check" element={<RecentSyncApplicationCheck />} />
        <Route path="payment-count" element={<PaymentCountComparison />} />
        <Route path="payment-app-status" element={<PaymentApplicationStatus />} />
        <Route path="payment-app-resync" element={<PaymentApplicationResync onBack={() => window.history.back()} />} />
        <Route path="orphaned-invoice-fixer" element={<OrphanedInvoiceFixer />} />
        <Route path="application-date-diagnostic" element={<ApplicationDateDiagnostic />} />
        <Route path="invoice-format-checker" element={<InvoiceFormatChecker />} />
        <Route path="invoice-variation-checker" element={<AcumaticaInvoiceVariationChecker />} />
        <Route path="orphaned-application-diagnostic" element={<OrphanedApplicationDiagnostic />} />
        <Route path="collection-ticketing" element={<CollectionTicketing />} />
        <Route path="my-assignments" element={<MyAssignments />} />
        <Route path="collector-performance" element={<CollectorPerformanceAnalytics />} />
        <Route path="revenue-analytics" element={<RevenueAnalytics />} />
        <Route path="customer-analytics" element={<CustomerAnalyticsPage />} />
        <Route path="user-activity" element={<UserActivityAnalytics />} />
        <Route path="email-analytics" element={<EmailAnalytics />} />
        <Route path="collector-control-panel" element={<CollectorControlPanel />} />
        <Route path="collector-monitoring" element={<AdminCollectorMonitoring />} />
        <Route path="user-approval" element={<UserApprovalPanel />} />
        <Route path="create-user" element={<AdminCreateUser />} />
        <Route path="payment-app-diagnostic" element={<PaymentApplicationDiagnostic />} />
        <Route path="password-reset-tester" element={<PasswordResetTester />} />
        <Route path="test-payment-sync" element={<TestPaymentAppAndAttachmentSync />} />
        <Route path="auto-backfill" element={<AutoBackfillMonitor />} />
        <Route path="payment-status-diagnostic" element={<PaymentStatusDiagnostic />} />
        <Route path="payment-date-range-resync" element={<PaymentDateRangeResync />} />
        <Route path="payment-sync-health" element={<PaymentSyncHealthCheck />} />
        <Route path="payment-sync-diagnostic" element={<PaymentSyncDiagnostic />} />
        <Route path="developer-tools" element={<DeveloperTools />} />
        <Route path="refetch-2024-payments" element={<Refetch2024Payments />} />
        <Route path="resend-temp-password" element={<ResendTemporaryPassword onBack={() => window.history.back()} />} />
        <Route path="force-delete-user" element={<ForceDeleteUser onBack={() => window.history.back()} />} />
        <Route path="ticket-status-settings" element={<TicketStatusManagement onBack={() => window.history.back()} />} />
        <Route path="invoice-color-settings" element={<InvoiceColorStatusManagement onBack={() => window.history.back()} />} />
      </Route>

      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
