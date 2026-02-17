import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Code, FileSearch, Database, Activity, AlertCircle, CheckCircle, FileText, RefreshCw, RotateCcw, Calendar, HeartPulse, Download, Mail, Trash2, CreditCard, Monitor, XCircle } from 'lucide-react';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: any;
  path: string;
  category: 'payment' | 'invoice' | 'sync' | 'system';
}

export function DeveloperTools() {
  const navigate = useNavigate();

  const tools: Tool[] = [
    {
      id: 'payment-bulk-fetch',
      name: 'Payment Bulk Fetch',
      description: 'Bulk fetch payments, credit memos, and prepayments from Acumatica',
      icon: CreditCard,
      path: '/payment-bulk-fetch',
      category: 'payment'
    },
    {
      id: 'test-payment-sync',
      name: 'Test Payment App & Attachment Sync',
      description: 'Test automatic fetching of payment applications and attachments',
      icon: Activity,
      path: '/test-payment-sync',
      category: 'payment'
    },
    {
      id: 'batch-fetcher',
      name: 'Batch Application Fetcher',
      description: 'Manually fetch payment applications in batch',
      icon: Database,
      path: '/batch-fetcher',
      category: 'payment'
    },
    {
      id: 'bulk-fetcher',
      name: 'Bulk Application Fetcher',
      description: 'Fetch all payment applications',
      icon: Database,
      path: '/bulk-fetcher',
      category: 'payment'
    },
    {
      id: 'payment-app-diagnostic',
      name: 'Payment Application Diagnostic',
      description: 'Diagnose payment application issues',
      icon: AlertCircle,
      path: '/payment-app-diagnostic',
      category: 'payment'
    },
    {
      id: 'payment-diagnostic',
      name: 'Payment Structure Diagnostic',
      description: 'Analyze payment data structure',
      icon: FileSearch,
      path: '/payment-diagnostic',
      category: 'payment'
    },
    {
      id: 'payment-status-diagnostic',
      name: 'Payment Status Diagnostic',
      description: 'Compare payment status between Acumatica and database',
      icon: AlertCircle,
      path: '/payment-status-diagnostic',
      category: 'payment'
    },
    {
      id: 'payment-date-range-resync',
      name: 'Payment Date Range Resync',
      description: 'Bulk resync payments within a specific date range',
      icon: Calendar,
      path: '/payment-date-range-resync',
      category: 'payment'
    },
    {
      id: 'last-15-days-payments',
      name: 'Last 15 Days Payment Fetch',
      description: 'Fetch payments from the last 15 days with batch processing support',
      icon: Download,
      path: '/last-15-days-payments',
      category: 'payment'
    },
    {
      id: 'payment-sync-health',
      name: 'Payment Sync Health Check',
      description: 'Verify payment sync accuracy and detect mismatches',
      icon: HeartPulse,
      path: '/payment-sync-health',
      category: 'payment'
    },
    {
      id: 'voided-payments-by-date',
      name: 'Voided Payments by Date',
      description: 'Search voided payments with timezone-aware date filtering (UTC vs ET)',
      icon: XCircle,
      path: '/voided-payments-by-date',
      category: 'payment'
    },
    {
      id: 'payment-sync-diagnostic',
      name: 'Payment Sync Diagnostic',
      description: 'Diagnose and fix payment sync issues (recommended first step)',
      icon: Activity,
      path: '/payment-sync-diagnostic',
      category: 'sync'
    },
    {
      id: 'live-sync-monitor',
      name: 'Live Sync Monitor',
      description: 'Real-time monitoring of all sync operations with live progress tracking',
      icon: Monitor,
      path: '/live-sync-monitor',
      category: 'sync'
    },
    {
      id: 'refetch-2024-payments',
      name: 'Refetch 2024 Payments',
      description: 'Batch refetch payment applications for all 2024 payments (100 at a time)',
      icon: Download,
      path: '/refetch-2024-payments',
      category: 'payment'
    },
    {
      id: 'payment-attachment-test',
      name: 'Payment Attachment Test',
      description: 'Test fetching payment attachments',
      icon: FileText,
      path: '/payment-attachment-test',
      category: 'payment'
    },
    {
      id: 'payment-app-status',
      name: 'Payment Application Status',
      description: 'View payment application synchronization status',
      icon: CheckCircle,
      path: '/payment-app-status',
      category: 'payment'
    },
    {
      id: 'payment-count',
      name: 'Payment Count Comparison',
      description: 'Compare payment counts between Acumatica and database',
      icon: Database,
      path: '/payment-count',
      category: 'payment'
    },
    {
      id: 'application-date-diagnostic',
      name: 'Application Date Diagnostic',
      description: 'Diagnose application date issues',
      icon: AlertCircle,
      path: '/application-date-diagnostic',
      category: 'payment'
    },
    {
      id: 'invoice-format-checker',
      name: 'Invoice Format Checker',
      description: 'Check invoice data format and structure',
      icon: FileSearch,
      path: '/invoice-format-checker',
      category: 'invoice'
    },
    {
      id: 'invoice-variation-checker',
      name: 'Invoice Variation Checker',
      description: 'Check for invoice data variations',
      icon: AlertCircle,
      path: '/invoice-variation-checker',
      category: 'invoice'
    },
    {
      id: 'invoice-date-comparison',
      name: 'Invoice Date Comparison',
      description: 'Compare invoice dates between Acumatica and database to diagnose discrepancies',
      icon: Calendar,
      path: '/invoice-date-comparison',
      category: 'invoice'
    },
    {
      id: 'orphaned-invoice-fixer',
      name: 'Orphaned Invoice Fixer',
      description: 'Find and fix orphaned invoices',
      icon: AlertCircle,
      path: '/orphaned-invoice-fixer',
      category: 'invoice'
    },
    {
      id: 'orphaned-application-diagnostic',
      name: 'Orphaned Application Diagnostic',
      description: 'Find orphaned payment applications',
      icon: AlertCircle,
      path: '/orphaned-application-diagnostic',
      category: 'payment'
    },
    {
      id: 'payment-app-resync',
      name: 'Payment Application Re-sync',
      description: 'Re-fetch all payment applications from Acumatica with correct doc types',
      icon: RotateCcw,
      path: '/payment-app-resync',
      category: 'payment'
    },
    {
      id: 'sync-diagnostic',
      name: 'Sync Diagnostic',
      description: 'Diagnose sync issues and check sync health',
      icon: AlertCircle,
      path: '/sync-diagnostic',
      category: 'sync'
    },
    {
      id: 'sync-logs',
      name: 'Sync Change Logs',
      description: 'View synchronization change logs',
      icon: RefreshCw,
      path: '/sync-logs',
      category: 'sync'
    },
    {
      id: 'credential-tester',
      name: 'Acumatica Credential Tester',
      description: 'Test Acumatica API credentials',
      icon: CheckCircle,
      path: '/credential-tester',
      category: 'system'
    },
    {
      id: 'password-reset-tester',
      name: 'Password Reset Tester',
      description: 'Test password reset functionality',
      icon: Code,
      path: '/password-reset-tester',
      category: 'system'
    },
    {
      id: 'resend-temp-password',
      name: 'Resend Temporary Password',
      description: 'Generate and send new temporary password to existing users',
      icon: Mail,
      path: '/resend-temp-password',
      category: 'system'
    },
    {
      id: 'force-delete-user',
      name: 'Force Delete User',
      description: 'Delete stuck user accounts completely from the system',
      icon: Trash2,
      path: '/force-delete-user',
      category: 'system'
    },
  ];

  const categories = {
    payment: 'Payment Tools',
    invoice: 'Invoice Tools',
    sync: 'Sync Tools',
    system: 'System Tools'
  };

  const groupedTools = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, Tool[]>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Code className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Developer Tools</h1>
          </div>
          <p className="text-gray-600">
            Diagnostic and testing tools for development and troubleshooting
          </p>
        </div>

        {Object.entries(groupedTools).map(([category, categoryTools]) => (
          <div key={category} className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {categories[category as keyof typeof categories]}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    onClick={() => navigate(tool.path)}
                    className="flex flex-col items-start p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {tool.name}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600">{tool.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
