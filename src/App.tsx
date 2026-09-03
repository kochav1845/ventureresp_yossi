import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { PageCacheProvider } from './contexts/PageCacheContext';
import { OrgProvider, useOrg } from './contexts/OrgContext';
// Kept eager: everything on the critical path to first paint (sign-in, shell).
import SignIn from './components/SignIn';
import ResetPassword from './components/ResetPassword';
import Layout from './components/Layout';
import LandingPage from './components/LandingPage';
import { TourProvider } from './components/GuidedTour/TourProvider';
import TourOverlay from './components/GuidedTour/TourOverlay';

// Every page is code-split so users only download the page they open,
// instead of the whole app in one bundle.
const Customers = lazy(() => import('./components/Customers'));
const CronMonitor = lazy(() => import('./components/CronMonitor'));
const SchedulerLogs = lazy(() => import('./components/SchedulerLogs'));
const AcumaticaInvoiceTest = lazy(() => import('./components/AcumaticaInvoiceTest'));
const AcumaticaCustomers = lazy(() => import('./components/AcumaticaCustomers'));
const AcumaticaInvoices = lazy(() => import('./components/AcumaticaInvoices'));
const AcumaticaPayments = lazy(() => import('./components/AcumaticaPayments'));
const InvoiceStatusAnalytics = lazy(() => import('./components/InvoiceStatusAnalytics'));
const PaymentAnalytics = lazy(() => import('./components/PaymentAnalytics'));
const CustomerReportsMonthly = lazy(() => import('./components/CustomerReportsMonthly'));
const CustomerReportTemplates = lazy(() => import('./components/CustomerReportTemplates'));
const SystemDocumentation = lazy(() => import('./components/SystemDocumentation'));
const WebhookConfiguration = lazy(() => import('./components/WebhookConfiguration'));
const SyncStatusDashboard = lazy(() => import('./components/SyncStatusDashboard'));
const SyncConfiguration = lazy(() => import('./components/SyncConfiguration'));
const InvoiceStatusAdminPanel = lazy(() => import('./components/InvoiceStatusAdminPanel'));
const AcumaticaFilesTest = lazy(() => import('./components/AcumaticaFilesTest'));
const RemindersPortal = lazy(() => import('./components/RemindersPortal'));
const ProposedReminderRulesSettings = lazy(() => import('./components/ProposedReminderRulesSettings'));
const AcumaticaCredentialTester = lazy(() => import('./components/AcumaticaCredentialTester'));
const BatchApplicationFetcher = lazy(() => import('./components/BatchApplicationFetcher'));
const BulkApplicationFetcher = lazy(() => import('./components/BulkApplicationFetcher'));
const SyncChangeLogsViewer = lazy(() => import('./components/SyncChangeLogsViewer'));
const SyncDiagnostic = lazy(() => import('./components/SyncDiagnostic'));
const PaymentStructureDiagnostic = lazy(() => import('./components/PaymentStructureDiagnostic'));
const PaymentAttachmentTest = lazy(() => import('./components/PaymentAttachmentTest'));
const RecentSyncApplicationCheck = lazy(() => import('./components/RecentSyncApplicationCheck'));
const PaymentCountComparison = lazy(() => import('./components/PaymentCountComparison'));
const PaymentApplicationStatus = lazy(() => import('./components/PaymentApplicationStatus'));
const PaymentApplicationResync = lazy(() => import('./components/PaymentApplicationResync'));
const OrphanedInvoiceFixer = lazy(() => import('./components/OrphanedInvoiceFixer'));
const ApplicationDateDiagnostic = lazy(() => import('./components/ApplicationDateDiagnostic'));
const InvoiceFormatChecker = lazy(() => import('./components/InvoiceFormatChecker'));
const AcumaticaInvoiceVariationChecker = lazy(() => import('./components/AcumaticaInvoiceVariationChecker'));
const OrphanedApplicationDiagnostic = lazy(() => import('./components/OrphanedApplicationDiagnostic'));
const InvoiceDateComparison = lazy(() => import('./components/InvoiceDateComparison'));
const CollectionTicketing = lazy(() => import('./components/CollectionTicketing'));
const MyAssignments = lazy(() => import('./components/MyAssignments'));
const CollectorHub = lazy(() => import('./components/CollectorHub'));
const RevenueAnalytics = lazy(() => import('./components/RevenueAnalytics'));
const CustomerAnalyticsPage = lazy(() => import('./components/CustomerAnalyticsPage'));
const UserActivityAnalytics = lazy(() => import('./components/UserActivityAnalytics'));
const CollectorControlPanel = lazy(() => import('./components/CollectorControlPanel'));
const UserApprovalPanel = lazy(() => import('./components/UserApprovalPanel'));
const PaymentApplicationDiagnostic = lazy(() => import('./components/PaymentApplicationDiagnostic'));
const PasswordResetTester = lazy(() => import('./components/PasswordResetTester'));
const TestPaymentAppAndAttachmentSync = lazy(() => import('./components/TestPaymentAppAndAttachmentSync'));
const AutoBackfillMonitor = lazy(() => import('./components/AutoBackfillMonitor'));
const PaymentStatusDiagnostic = lazy(() => import('./components/PaymentStatusDiagnostic'));
const PaymentDateRangeResync = lazy(() => import('./components/PaymentDateRangeResync'));
const LiveSyncMonitor = lazy(() => import('./components/LiveSyncMonitor'));
const PaymentSyncHealthCheck = lazy(() => import('./components/PaymentSyncHealthCheck'));
const PaymentSyncDiagnostic = lazy(() => import('./components/PaymentSyncDiagnostic'));
const DeveloperTools = lazy(() => import('./components/DeveloperTools').then(m => ({ default: m.DeveloperTools })));
const Refetch2024Payments = lazy(() => import('./components/Refetch2024Payments'));
const BackfillDocDates = lazy(() => import('./components/BackfillDocDates'));
const AcumaticaPaymentFetch = lazy(() => import('./components/AcumaticaPaymentFetch'));
const AdminCreateUser = lazy(() => import('./components/AdminCreateUser'));
const ResendTemporaryPassword = lazy(() => import('./components/ResendTemporaryPassword'));
const ForceDeleteUser = lazy(() => import('./components/ForceDeleteUser'));
const TicketStatusManagement = lazy(() => import('./components/TicketStatusManagement'));
const InvoiceColorStatusManagement = lazy(() => import('./components/InvoiceColorStatusManagement'));
const SyncHealthDashboard = lazy(() => import('./components/SyncHealthDashboard'));
const AutoTicketRules = lazy(() => import('./components/AutoTicketRules'));
const VoidedPaymentAnalysis = lazy(() => import('./components/VoidedPaymentAnalysis'));
const VoidedPaymentsByDate = lazy(() => import('./components/VoidedPaymentsByDate'));
const Last15DaysPaymentFetch = lazy(() => import('./components/Last15DaysPaymentFetch'));
const ConnectionDiagnostic = lazy(() => import('./components/ConnectionDiagnostic'));
const PaymentBreakdown = lazy(() => import('./components/PaymentBreakdown'));
const InvoiceBreakdown = lazy(() => import('./components/InvoiceBreakdown'));
const EmailSettings = lazy(() => import('./components/EmailSettings'));
const TicketDetailPage = lazy(() => import('./components/TicketDetailPage'));
const CustomerStatements = lazy(() => import('./components/CustomerStatements'));
const Mailbox = lazy(() => import('./components/Mailbox'));
const ApiKeyManagement = lazy(() => import('./components/ApiKeyManagement'));
const CronJobsMonitor = lazy(() => import('./components/CronJobsMonitor'));
const InvoiceAnalyticsPage = lazy(() => import('./components/InvoiceAnalyticsPage'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard'));

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

// Lightweight fallback shown while a code-split page chunk downloads.
function PageLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}

function getDefaultRouteForRole(role: string, orgSlug: string): string {
  switch (role) {
    case 'admin':
      return `/${orgSlug}/payment-analytics`;
    case 'collector':
      return `/${orgSlug}/my-assignments`;
    default:
      return `/${orgSlug}/customers`;
  }
}

// Client-side guard for admin-only pages (dev/diagnostic tools, secret viewers,
// user management). The privileged BACKENDS are separately locked down (edge-fn
// admin checks + RLS); this stops non-admins from opening the pages by URL.
function RequireAdmin({ children }: { children: JSX.Element }) {
  const { profile } = useAuth();
  if (!profile || profile.role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <p className="text-lg font-semibold text-gray-900">Admin access required</p>
        <p className="text-sm text-gray-500 mt-1">You don’t have permission to view this page.</p>
      </div>
    );
  }
  return children;
}

function OrgAppContent() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user || !profile) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="connection-test" element={<ConnectionDiagnostic />} />
          <Route path="*" element={<SignIn />} />
        </Routes>
      </Suspense>
    );
  }

  const defaultRoute = getDefaultRouteForRole(profile.role, orgSlug || '');

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="signin" element={<Navigate to={defaultRoute} replace />} />
        <Route path="reset-password" element={<ResetPassword />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to={defaultRoute} replace />} />
          {/* The Inbox is the embedded webmail (old email system removed). */}
          <Route path="inbox" element={<Mailbox />} />
          <Route path="customers" element={<Customers />} />
          <Route path="schedule" element={<CronMonitor />} />
          <Route path="logs" element={<SchedulerLogs />} />
          <Route path="acumatica" element={<AcumaticaInvoiceTest />} />
          <Route path="acumatica-customers" element={<AcumaticaCustomers />} />
          <Route path="acumatica-invoices" element={<AcumaticaInvoices />} />
          <Route path="acumatica-payments" element={<AcumaticaPayments />} />
          <Route path="invoice-analytics" element={<InvoiceAnalyticsPage />} />
          <Route path="payment-analytics" element={<PaymentAnalytics />} />
          <Route path="payment-breakdown" element={<PaymentBreakdown />} />
          <Route path="invoice-breakdown" element={<InvoiceBreakdown />} />
          <Route path="voided-payment-analysis" element={<VoidedPaymentAnalysis />} />
          <Route path="voided-payments-by-date" element={<VoidedPaymentsByDate />} />
          <Route path="webhooks" element={<RequireAdmin><WebhookConfiguration /></RequireAdmin>} />
          <Route path="sync-status" element={<SyncStatusDashboard />} />
          <Route path="sync-config" element={<RequireAdmin><SyncConfiguration /></RequireAdmin>} />
          <Route path="invoice-status-admin" element={<RequireAdmin><InvoiceStatusAdminPanel /></RequireAdmin>} />
          <Route path="invoice-status-analytics" element={<InvoiceStatusAnalytics />} />
          <Route path="customer-reports" element={<CustomerReportsMonthly />} />
          <Route path="customer-statements" element={<CustomerStatements />} />
          <Route path="mailbox" element={<Mailbox />} />
          <Route path="customer-report-templates" element={<CustomerReportTemplates />} />
          <Route path="system-documentation" element={<SystemDocumentation />} />
          <Route path="acumatica-files-test" element={<AcumaticaFilesTest />} />
          <Route path="reminders" element={<RemindersPortal />} />
          <Route path="proposed-reminder-rules" element={<ProposedReminderRulesSettings />} />
          <Route path="credential-tester" element={<RequireAdmin><AcumaticaCredentialTester /></RequireAdmin>} />
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
          <Route path="invoice-date-comparison" element={<InvoiceDateComparison onBack={() => window.history.back()} />} />
          <Route path="orphaned-application-diagnostic" element={<OrphanedApplicationDiagnostic />} />
          <Route path="collection-ticketing" element={<CollectionTicketing />} />
          <Route path="ticket/:ticketId" element={<TicketDetailPage />} />
          <Route path="my-assignments" element={<MyAssignments />} />
          <Route path="collector-performance" element={<CollectorHub />} />
          <Route path="revenue-analytics" element={<RevenueAnalytics />} />
          <Route path="customer-analytics" element={<CustomerAnalyticsPage />} />
          <Route path="user-activity" element={<UserActivityAnalytics />} />
          <Route path="collector-control-panel" element={<CollectorControlPanel />} />
          <Route path="collector-monitoring" element={<CollectorHub onBack={() => window.history.back()} />} />
          <Route path="user-approval" element={<RequireAdmin><UserApprovalPanel /></RequireAdmin>} />
          <Route path="create-user" element={<RequireAdmin><AdminCreateUser /></RequireAdmin>} />
          <Route path="payment-app-diagnostic" element={<PaymentApplicationDiagnostic />} />
          <Route path="password-reset-tester" element={<RequireAdmin><PasswordResetTester /></RequireAdmin>} />
          <Route path="test-payment-sync" element={<TestPaymentAppAndAttachmentSync />} />
          <Route path="auto-backfill" element={<AutoBackfillMonitor />} />
          <Route path="payment-status-diagnostic" element={<PaymentStatusDiagnostic />} />
          <Route path="payment-date-range-resync" element={<PaymentDateRangeResync />} />
          <Route path="live-sync-monitor" element={<LiveSyncMonitor />} />
          <Route path="payment-sync-health" element={<PaymentSyncHealthCheck />} />
          <Route path="payment-sync-diagnostic" element={<PaymentSyncDiagnostic />} />
          <Route path="developer-tools" element={<RequireAdmin><DeveloperTools /></RequireAdmin>} />
          <Route path="refetch-2024-payments" element={<Refetch2024Payments />} />
          <Route path="backfill-doc-dates" element={<BackfillDocDates />} />
          <Route path="payment-bulk-fetch" element={<AcumaticaPaymentFetch onBack={() => window.history.back()} />} />
          <Route path="resend-temp-password" element={<RequireAdmin><ResendTemporaryPassword onBack={() => window.history.back()} /></RequireAdmin>} />
          <Route path="force-delete-user" element={<RequireAdmin><ForceDeleteUser onBack={() => window.history.back()} /></RequireAdmin>} />
          <Route path="ticket-status-settings" element={<TicketStatusManagement onBack={() => window.history.back()} />} />
          <Route path="invoice-color-settings" element={<InvoiceColorStatusManagement onBack={() => window.history.back()} />} />
          <Route path="auto-ticket-rules" element={<AutoTicketRules onBack={() => window.history.back()} />} />
          <Route path="sync-health" element={<SyncHealthDashboard />} />
          <Route path="last-15-days-payments" element={<Last15DaysPaymentFetch />} />
          <Route path="email-settings" element={<RequireAdmin><EmailSettings /></RequireAdmin>} />
          <Route path="api-keys" element={<RequireAdmin><ApiKeyManagement /></RequireAdmin>} />
          <Route path="cron-jobs" element={<CronJobsMonitor />} />
        </Route>

        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </Suspense>
  );
}

function OrgGate() {
  const { org, loading, error } = useOrg();

  if (loading) {
    return <LoadingScreen />;
  }

  if (error === 'Database temporarily unavailable. Please refresh the page.') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Temporary Connection Issue</h2>
          <p className="text-gray-600 mb-6">The database is momentarily unavailable. This usually resolves within a few seconds.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (error || !org) {
    return <LandingPage />;
  }

  return (
    <PageCacheProvider>
      <TourProvider>
        <OrgAppContent />
        <TourOverlay />
      </TourProvider>
    </PageCacheProvider>
  );
}

function OrgWrapper() {
  return (
    <OrgProvider>
      <OrgGate />
    </OrgProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<Navigate to="/demo" replace />} />
              <Route path="/developer" element={<SuperAdminDashboard />} />
              <Route path="/connection-test" element={<ConnectionDiagnostic />} />
              <Route path="/:orgSlug/*" element={<OrgWrapper />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
