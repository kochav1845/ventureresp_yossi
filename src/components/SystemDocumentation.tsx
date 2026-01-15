import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, Database, Mail, RefreshCw, Bell, Users, DollarSign, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SystemDocumentationProps {
  onBack?: () => void;
}

interface SystemStats {
  totalCustomers: number;
  totalInvoices: number;
  totalPayments: number;
  totalInvoiceAmount: number;
  totalPaymentAmount: number;
  unpaidInvoiceCount: number;
  unpaidBalance: number;
  emailFormulas: number;
  emailTemplates: number;
  activeReminders: number;
  cronJobs: number;
}

export default function SystemDocumentation({ onBack }: SystemDocumentationProps) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadSystemStats();
  }, []);

  const loadSystemStats = async () => {
    try {
      const [
        customersResult,
        invoicesResult,
        paymentsResult,
        unpaidInvoicesResult,
        formulasResult,
        templatesResult,
        remindersResult
      ] = await Promise.all([
        supabase.from('acumatica_customers').select('*', { count: 'exact', head: true }),
        supabase.from('acumatica_invoices').select('amount'),
        supabase.from('acumatica_payments').select('amount'),
        supabase.from('acumatica_invoices').select('balance').gt('balance', 0),
        supabase.from('email_formulas').select('*', { count: 'exact', head: true }),
        supabase.from('email_templates').select('*', { count: 'exact', head: true }),
        supabase.from('invoice_reminders').select('*', { count: 'exact', head: true }).is('completed_at', null)
      ]);

      const totalInvoiceAmount = invoicesResult.data?.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0) || 0;
      const totalPaymentAmount = paymentsResult.data?.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0) || 0;
      const unpaidBalance = unpaidInvoicesResult.data?.reduce((sum, inv) => sum + (Number(inv.balance) || 0), 0) || 0;

      setStats({
        totalCustomers: customersResult.count || 0,
        totalInvoices: invoicesResult.data?.length || 0,
        totalPayments: paymentsResult.data?.length || 0,
        totalInvoiceAmount,
        totalPaymentAmount,
        unpaidInvoiceCount: unpaidInvoicesResult.data?.length || 0,
        unpaidBalance,
        emailFormulas: formulasResult.count || 0,
        emailTemplates: templatesResult.count || 0,
        activeReminders: remindersResult.count || 0,
        cronJobs: 3
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto print:max-w-none">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <button
            onClick={generatePDF}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            <Download className="w-5 h-5" />
            Export as PDF
          </button>
        </div>

        <div className="bg-white text-slate-900 rounded-lg p-8 print:rounded-none print:shadow-none">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">System Documentation</h1>
            <p className="text-xl text-slate-600">Post-Development Technical Specification</p>
            <p className="text-slate-500 mt-2">Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 print:grid-cols-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Customers</span>
              </div>
              <div className="text-2xl font-bold text-blue-700">{stats?.totalCustomers}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">Invoices</span>
              </div>
              <div className="text-2xl font-bold text-green-700">{stats?.totalInvoices}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Payments</span>
              </div>
              <div className="text-2xl font-bold text-purple-700">{stats?.totalPayments}</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium text-red-900">Reminders</span>
              </div>
              <div className="text-2xl font-bold text-red-700">{stats?.activeReminders}</div>
            </div>
          </div>

          <div className="space-y-12">
            <section className="border-t-4 border-blue-600 pt-6">
              <div className="flex items-center gap-3 mb-6">
                <Mail className="w-8 h-8 text-blue-600" />
                <h2 className="text-3xl font-bold">Email Automation System</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3 text-blue-900">Email Templates</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    Email templates are pre-designed email structures that define the content, layout, and styling of automated emails.
                    The system currently has <strong>{stats?.emailTemplates} email templates</strong> configured. Each template includes:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Template Name:</strong> A unique identifier for the template</li>
                    <li><strong>Subject Line:</strong> The email subject that recipients will see</li>
                    <li><strong>HTML Body:</strong> The email content with support for dynamic variables</li>
                    <li><strong>Dynamic Variables:</strong> Placeholders like customer_name, balance_due, invoice_number that get replaced with actual data</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Templates support full HTML formatting, allowing for professional-looking emails with headers, tables, and styled content.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Email templates provide reusable email designs that automatically populate customer-specific information,
                    ensuring consistent and professional communication across all automated emails.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-blue-900">Email Formulas</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    Email formulas are the business logic that determines when and to whom emails should be sent.
                    The system has <strong>{stats?.emailFormulas} active email formulas</strong>. Each formula contains:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Trigger Conditions:</strong> Rules that determine when an email should be sent (e.g., "7 days after invoice due date")</li>
                    <li><strong>Target Template:</strong> Which email template to use for this formula</li>
                    <li><strong>Customer Filters:</strong> Criteria for selecting which customers receive the email (balance thresholds, customer status)</li>
                    <li><strong>Send Schedule:</strong> Specific times of day to send emails (e.g., 9:00 AM, 2:00 PM)</li>
                    <li><strong>Frequency:</strong> How often to check conditions (daily, weekly, monthly)</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Formulas work by evaluating customer and invoice data against defined rules. When conditions are met,
                    the system automatically queues emails for sending at the scheduled times.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Email formulas automate the decision-making process for sending emails, combining trigger conditions,
                    customer filters, and schedules to ensure the right message reaches the right customer at the right time.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-blue-900">Email Scheduler & Cron Jobs</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The email scheduler is powered by PostgreSQL's pg_cron extension, which runs automated tasks at specified intervals.
                    Currently, <strong>{stats?.cronJobs} cron jobs</strong> are active in the system:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Email Scheduler Job:</strong> Runs every hour to evaluate email formulas and queue emails for sending</li>
                    <li><strong>Reminder Check Job:</strong> Runs every 30 minutes to check for due reminders and send notifications</li>
                    <li><strong>Acumatica Sync Job:</strong> Runs every 5 minutes to fetch recent changes from Acumatica ERP</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    The email scheduler works by:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 ml-4 text-slate-700 mt-2">
                    <li>Evaluating all active email formulas against current customer and invoice data</li>
                    <li>Identifying customers who meet the formula criteria</li>
                    <li>Checking if emails should be sent based on the time schedule</li>
                    <li>Calling the send-customer-invoice-email edge function for each recipient</li>
                    <li>Logging all email activities in the outbound_replies table</li>
                  </ol>
                  <p className="mt-3 text-slate-700">
                    Each email is sent with a small delay (500ms) between sends to prevent overwhelming the email service provider (SendGrid)
                    and to comply with rate limiting policies.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    The email scheduler uses automated cron jobs to regularly evaluate email formulas and send emails at optimal times,
                    with built-in rate limiting and comprehensive logging to ensure reliable delivery and trackability.
                  </p>
                </div>
              </div>

              <div className="mt-8 p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
                <h3 className="text-lg font-bold text-blue-900 mb-3">Email System Complete Summary</h3>
                <p className="text-slate-800 leading-relaxed">
                  The email automation system combines templates, formulas, and scheduled execution to create a powerful,
                  hands-off communication platform. Templates define what emails look like, formulas define when and to whom
                  they're sent, and the scheduler ensures everything runs automatically. With {stats?.emailTemplates} templates
                  and {stats?.emailFormulas} formulas currently active, the system handles all customer communications without
                  manual intervention, from initial invoices to payment reminders, all tracked and logged for accountability.
                </p>
              </div>
            </section>

            <section className="border-t-4 border-green-600 pt-6 print:break-before-page">
              <div className="flex items-center gap-3 mb-6">
                <Database className="w-8 h-8 text-green-600" />
                <h2 className="text-3xl font-bold">Acumatica ERP Integration</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3 text-green-900">Connection & Credentials</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system integrates with Acumatica ERP through its REST API. Connection credentials are securely stored in the database
                    and environment variables:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>API Endpoint:</strong> Stored in VITE_ACUMATICA_API_URL environment variable</li>
                    <li><strong>Username & Password:</strong> Encrypted and stored in the database sync_config table</li>
                    <li><strong>Company & Branch:</strong> Configured per connection to access specific organizational units</li>
                    <li><strong>Authentication:</strong> Uses Basic Auth with automatic session management</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Credentials are never exposed in the frontend and are only accessed by secure Supabase Edge Functions.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Acumatica credentials are securely stored and managed, with all API calls routed through backend edge functions
                    to maintain security and prevent credential exposure.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-green-900">Customer Synchronization</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system maintains <strong>{stats?.totalCustomers} customer records</strong> synchronized from Acumatica.
                    Customer data includes:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Customer ID:</strong> Unique identifier from Acumatica</li>
                    <li><strong>Customer Name:</strong> Business or individual name</li>
                    <li><strong>Contact Information:</strong> Email, phone, address</li>
                    <li><strong>Account Status:</strong> Active, on hold, inactive</li>
                    <li><strong>Credit Terms:</strong> Payment terms and credit limits</li>
                    <li><strong>Last Modified Date:</strong> Timestamp for incremental sync</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Customer records are stored in the <code className="bg-slate-200 px-2 py-1 rounded">acumatica_customers</code> table
                    and updated through the incremental sync process every 5 minutes.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-green-900">Invoice Synchronization</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system tracks <strong>{stats?.totalInvoices} invoices</strong> with a total value of <strong>{formatCurrency(stats?.totalInvoiceAmount || 0)}</strong>.
                    Currently, <strong>{stats?.unpaidInvoiceCount} invoices remain unpaid</strong> with an outstanding balance of <strong>{formatCurrency(stats?.unpaidBalance || 0)}</strong>.
                  </p>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    Invoice data synchronized from Acumatica includes:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Reference Number:</strong> Invoice identifier (e.g., INV-001234)</li>
                    <li><strong>Customer Details:</strong> Customer ID, name, and relationship</li>
                    <li><strong>Financial Data:</strong> Invoice amount, balance, tax, discounts</li>
                    <li><strong>Dates:</strong> Invoice date, due date, last modified date</li>
                    <li><strong>Status:</strong> Open, paid, partially paid, on hold</li>
                    <li><strong>Line Items:</strong> Individual products/services on the invoice</li>
                    <li><strong>Custom Status:</strong> System-specific status (green, yellow, red) for visual tracking</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Invoices are stored in the <code className="bg-slate-200 px-2 py-1 rounded">acumatica_invoices</code> table.
                    The system tracks invoice status changes and maintains a history of status updates with user attribution.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Invoice synchronization captures comprehensive financial data from Acumatica, tracking {stats?.totalInvoices} invoices
                    worth {formatCurrency(stats?.totalInvoiceAmount || 0)}, with {stats?.unpaidInvoiceCount} unpaid invoices requiring attention.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-green-900">Payment Synchronization</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system monitors <strong>{stats?.totalPayments} payment records</strong> totaling <strong>{formatCurrency(stats?.totalPaymentAmount || 0)}</strong>.
                    Payment data includes:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Payment Reference:</strong> Unique payment identifier</li>
                    <li><strong>Customer Information:</strong> Who made the payment</li>
                    <li><strong>Amount:</strong> Total payment value</li>
                    <li><strong>Payment Date:</strong> When payment was received</li>
                    <li><strong>Payment Method:</strong> Check, ACH, credit card, wire transfer</li>
                    <li><strong>Application History:</strong> Which invoices this payment was applied to</li>
                    <li><strong>Check Images:</strong> Scanned images of physical checks (if applicable)</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Payment application data is tracked in the <code className="bg-slate-200 px-2 py-1 rounded">payment_invoice_applications</code> table,
                    creating a complete audit trail of how payments reduce invoice balances. This relationship allows for detailed cash application reporting
                    and reconciliation.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Payment synchronization tracks {stats?.totalPayments} payments worth {formatCurrency(stats?.totalPaymentAmount || 0)},
                    maintaining detailed records of payment applications to invoices for accurate cash flow tracking and reconciliation.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-green-900">Incremental Sync Process</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system uses an incremental synchronization strategy that runs <strong>every 5 minutes</strong> via a cron job.
                    This approach minimizes API calls and system load while keeping data fresh. The process works as follows:
                  </p>
                  <ol className="list-decimal list-inside space-y-3 ml-4 text-slate-700">
                    <li>
                      <strong>Check Last Sync Time:</strong> The system retrieves the last successful sync timestamp from the
                      <code className="bg-slate-200 px-1 rounded">sync_status</code> table
                    </li>
                    <li>
                      <strong>Query Recent Changes:</strong> API calls to Acumatica request only records modified since the last sync,
                      using the LastModifiedDateTime filter
                    </li>
                    <li>
                      <strong>Fetch Customer Changes:</strong> Downloads customer records updated in the last 5 minutes
                    </li>
                    <li>
                      <strong>Fetch Invoice Changes:</strong> Downloads invoice records with recent modifications
                    </li>
                    <li>
                      <strong>Fetch Payment Changes:</strong> Downloads new or updated payment records
                    </li>
                    <li>
                      <strong>Update Database:</strong> Inserts new records or updates existing ones using upsert operations
                    </li>
                    <li>
                      <strong>Record Sync Status:</strong> Updates the sync_status table with the current timestamp and record counts
                    </li>
                  </ol>
                  <p className="mt-3 text-slate-700">
                    The cron job is defined in the database as:
                  </p>
                  <div className="bg-slate-800 text-slate-100 p-4 rounded-lg mt-2 font-mono text-sm">
                    SELECT cron.schedule('acumatica-master-sync', '*/5 * * * *', ...);
                  </div>
                  <p className="mt-3 text-slate-700">
                    This translates to "every 5 minutes, every hour, every day." The job calls the
                    <code className="bg-slate-200 px-1 rounded">acumatica-master-sync</code> edge function, which orchestrates
                    calls to customer, invoice, and payment sync functions.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Incremental sync runs every 5 minutes, fetching only changed records from Acumatica to keep the system current
                    without overwhelming the API. This efficient approach ensures near-real-time data accuracy with minimal resource usage.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-green-900">Webhook Integration</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    In addition to scheduled sync, the system supports webhook notifications from Acumatica for immediate updates.
                    Three webhook endpoints are available:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Customer Webhook:</strong> /functions/v1/acumatica-customer-webhook</li>
                    <li><strong>Invoice Webhook:</strong> /functions/v1/acumatica-invoice-webhook</li>
                    <li><strong>Payment Webhook:</strong> /functions/v1/acumatica-payment-webhook</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    When configured in Acumatica, these webhooks provide instant notifications of data changes, allowing for
                    real-time synchronization. All webhook events are logged in the <code className="bg-slate-200 px-1 rounded">webhook_logs</code> table
                    for monitoring and debugging.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Webhook integration provides optional real-time sync capabilities, complementing the 5-minute scheduled sync
                    for organizations requiring immediate data updates.
                  </p>
                </div>
              </div>

              <div className="mt-8 p-6 bg-green-50 rounded-lg border-2 border-green-200">
                <h3 className="text-lg font-bold text-green-900 mb-3">Acumatica Integration Complete Summary</h3>
                <p className="text-slate-800 leading-relaxed">
                  The Acumatica integration provides seamless synchronization of {stats?.totalCustomers} customers, {stats?.totalInvoices} invoices
                  worth {formatCurrency(stats?.totalInvoiceAmount || 0)}, and {stats?.totalPayments} payments worth {formatCurrency(stats?.totalPaymentAmount || 0)}.
                  Running every 5 minutes, the incremental sync keeps data fresh while minimizing API load. With {stats?.unpaidInvoiceCount} unpaid
                  invoices totaling {formatCurrency(stats?.unpaidBalance || 0)}, the system provides real-time visibility into accounts receivable,
                  enabling proactive customer communication and cash flow management.
                </p>
              </div>
            </section>

            <section className="border-t-4 border-purple-600 pt-6 print:break-before-page">
              <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="w-8 h-8 text-purple-600" />
                <h2 className="text-3xl font-bold">Analytics & Reporting</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3 text-purple-900">Invoice Analytics Dashboard</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The invoice analytics dashboard provides comprehensive insights into accounts receivable performance:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Unpaid Invoice Statistics:</strong> Real-time count and total value of outstanding invoices</li>
                    <li><strong>Payment Application Charts:</strong> Visual breakdown of how payments are applied across invoices</li>
                    <li><strong>Customer Balance Analysis:</strong> Per-customer outstanding balance reports</li>
                    <li><strong>Aging Reports:</strong> Invoice aging by 30, 60, 90+ day buckets</li>
                    <li><strong>Payment Totals by Type:</strong> Charts showing payment distribution by method (check, ACH, wire, etc.)</li>
                    <li><strong>Status Color System:</strong> Visual indicators (green, yellow, red) for invoice priority</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    The dashboard uses database functions like <code className="bg-slate-200 px-1 rounded">get_unpaid_invoice_stats()</code>
                    and <code className="bg-slate-200 px-1 rounded">get_payment_totals_by_type()</code> to efficiently aggregate data
                    without loading entire tables into memory.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-purple-900">Customer Reports Monthly</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The Customer Reports Monthly system allows for batch invoice statement generation and distribution:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Date Filtering:</strong> Current month, all unpaid, or custom date range</li>
                    <li><strong>Balance Filtering:</strong> Show only customers above a minimum balance threshold</li>
                    <li><strong>Bulk Selection:</strong> Select all, deselect all, or manually choose specific customers</li>
                    <li><strong>PDF Generation:</strong> Create professional invoice statements with customer info and unpaid invoices</li>
                    <li><strong>Batch Download:</strong> Download all generated PDFs at once</li>
                    <li><strong>Email Distribution:</strong> Send PDFs via SendGrid with rate limiting (500ms between sends)</li>
                    <li><strong>Progress Tracking:</strong> Real-time progress display during generation and sending</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Each PDF statement includes customer name, ID, email, total balance, and a detailed list of unpaid invoices
                    with amounts and due dates. The batch process shows "[1/10] Generating..." style progress for full transparency.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-purple-900">Invoice Status Tracking</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system includes a visual status management system for invoices:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Color Statuses:</strong> Green (good standing), Yellow (attention needed), Red (urgent)</li>
                    <li><strong>Status Analytics:</strong> Charts showing distribution of invoices by status color</li>
                    <li><strong>Status History:</strong> Complete audit trail of status changes with timestamps and users</li>
                    <li><strong>Memo System:</strong> Attach notes and file attachments to invoices for internal tracking</li>
                    <li><strong>User Permissions:</strong> Status changes are logged with user attribution for accountability</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Status tracking helps teams prioritize collection efforts and maintain visibility into account health across the organization.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    Analytics and reporting tools provide actionable insights through dashboards, batch reporting, and status tracking,
                    enabling data-driven decision-making for accounts receivable management.
                  </p>
                </div>
              </div>

              <div className="mt-8 p-6 bg-purple-50 rounded-lg border-2 border-purple-200">
                <h3 className="text-lg font-bold text-purple-900 mb-3">Analytics & Reporting Complete Summary</h3>
                <p className="text-slate-800 leading-relaxed">
                  The analytics and reporting suite transforms raw financial data into actionable intelligence. With real-time dashboards
                  showing {stats?.unpaidInvoiceCount} unpaid invoices worth {formatCurrency(stats?.unpaidBalance || 0)}, teams can instantly
                  identify collection priorities. The Customer Reports Monthly tool enables bulk statement generation and distribution,
                  while status tracking and memos provide context for every account. Together, these tools create a comprehensive
                  view of accounts receivable health and streamline customer communication workflows.
                </p>
              </div>
            </section>

            <section className="border-t-4 border-red-600 pt-6 print:break-before-page">
              <div className="flex items-center gap-3 mb-6">
                <Bell className="w-8 h-8 text-red-600" />
                <h2 className="text-3xl font-bold">Reminder & Notification System</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3 text-red-900">Reminder Types</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system supports two types of reminders: invoice-specific and general task reminders.
                    Currently, <strong>{stats?.activeReminders} active reminders</strong> are pending completion.
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Invoice Reminders:</strong> Tied to specific invoices, triggering follow-up actions for unpaid balances</li>
                    <li><strong>General Reminders:</strong> Task-based reminders not linked to invoices (e.g., "Call customer about contract")</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-red-900">Reminder Creation & Management</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    Reminders can be created manually by users or automatically by the system based on invoice due dates. Each reminder includes:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Title:</strong> Brief description of the reminder</li>
                    <li><strong>Due Date & Time:</strong> When the reminder should trigger</li>
                    <li><strong>Priority:</strong> Low, medium, or high urgency</li>
                    <li><strong>Associated Invoice:</strong> Optional link to a specific invoice</li>
                    <li><strong>Email Notification:</strong> Option to send email when reminder is due</li>
                    <li><strong>User Assignment:</strong> Which user the reminder is for</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-red-900">Reminder Popup System</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    When reminders become due, they appear as popup notifications in the user interface. The popup system features:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Automatic Display:</strong> Popups appear immediately when users log in or when reminders become due</li>
                    <li><strong>Snooze Functionality:</strong> Postpone reminders for 30 minutes, 1 hour, 2 hours, or until tomorrow</li>
                    <li><strong>Complete Action:</strong> Mark reminders as completed to remove them from the active list</li>
                    <li><strong>Invoice Link:</strong> Quick navigation to the associated invoice (if applicable)</li>
                    <li><strong>Priority Indicators:</strong> Color-coded badges showing reminder urgency</li>
                  </ul>
                  <p className="mt-3 text-slate-700">
                    Snoozed reminders are temporarily hidden and will reappear after the snooze duration expires. This prevents
                    notification fatigue while ensuring important tasks aren't forgotten.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-red-900">Email Reminder Notifications</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system can send email notifications when reminders become due. A cron job runs every 15 minutes to check for
                    reminders requiring email notification:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 ml-4 text-slate-700">
                    <li>Query the database for reminders that are due and haven't had email notifications sent</li>
                    <li>Retrieve user email addresses from the user_profiles table</li>
                    <li>Format reminder details into an email message</li>
                    <li>Send email via the send-reminder-emails edge function</li>
                    <li>Mark reminders as having email sent to prevent duplicates</li>
                  </ol>
                  <p className="mt-3 text-slate-700">
                    Email reminders include the reminder title, due date, priority, and a link to the system to take action.
                    This ensures users stay informed even when not actively using the application.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-red-900">Automatic Invoice Reminders</h3>
                  <p className="text-slate-700 leading-relaxed mb-3">
                    The system automatically creates reminders for overdue invoices. A cron job runs daily to:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 ml-4 text-slate-700">
                    <li>Identify invoices that are past due with unpaid balances</li>
                    <li>Check if reminders already exist for these invoices</li>
                    <li>Create new reminders for invoices without existing reminders</li>
                    <li>Set reminder priority based on how overdue the invoice is (30+ days = high priority)</li>
                    <li>Assign reminders to appropriate users based on customer assignments</li>
                  </ol>
                  <p className="mt-3 text-slate-700">
                    This automation ensures no overdue invoice falls through the cracks, providing proactive alerts for collection activities.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Summary:</p>
                  <p className="text-sm text-slate-700">
                    The reminder system combines manual and automatic reminder creation, popup notifications, snooze functionality,
                    and email alerts to ensure critical tasks and overdue invoices receive timely attention from the right team members.
                  </p>
                </div>
              </div>

              <div className="mt-8 p-6 bg-red-50 rounded-lg border-2 border-red-200">
                <h3 className="text-lg font-bold text-red-900 mb-3">Reminder System Complete Summary</h3>
                <p className="text-slate-800 leading-relaxed">
                  The reminder and notification system provides a multi-layered approach to task management and follow-up activities.
                  With {stats?.activeReminders} active reminders currently pending, the system uses popup notifications, email alerts,
                  and automatic reminder creation to ensure overdue invoices and critical tasks receive appropriate attention. The snooze
                  functionality provides flexibility, while automatic invoice reminders guarantee no overdue account is overlooked.
                  Combined with the email automation system, reminders drive proactive customer engagement and improve collection efficiency.
                </p>
              </div>
            </section>

            <section className="border-t-4 border-slate-600 pt-6 print:break-before-page">
              <div className="flex items-center gap-3 mb-6">
                <RefreshCw className="w-8 h-8 text-slate-600" />
                <h2 className="text-3xl font-bold">System Architecture & Technology Stack</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-900">Frontend Technology</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>React 18:</strong> Modern UI framework with hooks for component state management</li>
                    <li><strong>TypeScript:</strong> Type-safe development for reduced bugs and better code quality</li>
                    <li><strong>Vite:</strong> Lightning-fast build tool and development server</li>
                    <li><strong>Tailwind CSS:</strong> Utility-first CSS framework for responsive design</li>
                    <li><strong>Lucide React:</strong> Beautiful, consistent icon library</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-900">Backend Technology</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Supabase:</strong> Backend-as-a-service providing database, authentication, and edge functions</li>
                    <li><strong>PostgreSQL:</strong> Robust relational database with advanced features</li>
                    <li><strong>Supabase Edge Functions:</strong> Serverless Deno-based functions for API integrations</li>
                    <li><strong>pg_cron:</strong> PostgreSQL extension for scheduled jobs</li>
                    <li><strong>Row Level Security (RLS):</strong> Database-level access control for data security</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-900">Integration Services</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>Acumatica REST API:</strong> ERP integration for customer, invoice, and payment data</li>
                    <li><strong>SendGrid:</strong> Email delivery service for automated customer communications</li>
                    <li><strong>Webhooks:</strong> Real-time event notifications from Acumatica</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-slate-900">Database Schema</h3>
                  <p className="text-slate-700 mb-3">The database consists of multiple interconnected tables:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li><strong>user_profiles:</strong> User accounts, roles, and permissions</li>
                    <li><strong>acumatica_customers:</strong> Customer master data from ERP</li>
                    <li><strong>acumatica_invoices:</strong> Invoice records with financial details</li>
                    <li><strong>acumatica_payments:</strong> Payment transaction records</li>
                    <li><strong>payment_invoice_applications:</strong> Payment-to-invoice application mapping</li>
                    <li><strong>email_templates:</strong> Reusable email content templates</li>
                    <li><strong>email_formulas:</strong> Business rules for email automation</li>
                    <li><strong>inbound_emails:</strong> Received customer emails with AI analysis</li>
                    <li><strong>outbound_replies:</strong> Sent email log with delivery status</li>
                    <li><strong>reminders:</strong> Task and invoice reminders with due dates</li>
                    <li><strong>invoice_status_history:</strong> Audit trail of status changes</li>
                    <li><strong>invoice_memos:</strong> Notes and attachments for invoices</li>
                    <li><strong>sync_status:</strong> Acumatica synchronization tracking</li>
                    <li><strong>webhook_logs:</strong> Webhook event history</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 p-6 bg-slate-50 rounded-lg border-2 border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 mb-3">Architecture Summary</h3>
                <p className="text-slate-800 leading-relaxed">
                  The system uses a modern, cloud-native architecture with React frontend, Supabase backend, and Deno edge functions.
                  PostgreSQL provides robust data storage with RLS security, while pg_cron enables automated scheduling. External
                  integrations with Acumatica ERP and SendGrid create a complete accounts receivable management platform with
                  automated communication capabilities.
                </p>
              </div>
            </section>

            <section className="border-t-4 border-orange-600 pt-6 print:break-before-page">
              <div className="flex items-center gap-3 mb-6">
                <FileText className="w-8 h-8 text-orange-600" />
                <h2 className="text-3xl font-bold">Next Steps & Future Enhancements</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3 text-orange-900">Short-Term Priorities (2-4 Weeks)</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li>Enhance PDF generation with company logo and custom branding</li>
                    <li>Add email template preview functionality</li>
                    <li>Implement email delivery tracking and open rate analytics</li>
                    <li>Create customer communication history view</li>
                    <li>Add bulk invoice status updates</li>
                    <li>Implement user activity logging and audit trail</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-orange-900">Medium-Term Goals (1-2 Months)</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li>Advanced reporting with custom date ranges and filters</li>
                    <li>Payment prediction models using historical data</li>
                    <li>Customer segmentation for targeted communications</li>
                    <li>Mobile-responsive invoice viewing for customers</li>
                    <li>Integration with additional payment processors</li>
                    <li>Automated dispute management workflow</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3 text-orange-900">Long-Term Vision (3-6 Months)</h3>
                  <ul className="list-disc list-inside space-y-2 ml-4 text-slate-700">
                    <li>AI-powered payment prediction and collection recommendations</li>
                    <li>Customer self-service portal for invoice viewing and payment</li>
                    <li>Multi-currency support for international operations</li>
                    <li>Advanced email A/B testing for optimization</li>
                    <li>Integration with accounting software beyond Acumatica</li>
                    <li>Machine learning for customer risk scoring</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 p-6 bg-orange-50 rounded-lg border-2 border-orange-200">
                <h3 className="text-lg font-bold text-orange-900 mb-3">Development Roadmap Summary</h3>
                <p className="text-slate-800 leading-relaxed">
                  The future development focuses on enhancing user experience, expanding analytics capabilities, and leveraging
                  AI/ML for predictive insights. Short-term improvements will refine existing features, while medium and long-term
                  goals introduce advanced capabilities like customer self-service, multi-currency support, and intelligent
                  collection strategies.
                </p>
              </div>
            </section>

            <section className="border-t-4 border-slate-900 pt-6 mt-12 print:break-before-page">
              <h2 className="text-4xl font-bold text-center mb-8">Complete System Summary</h2>

              <div className="space-y-6 text-slate-700">
                <p className="text-lg leading-relaxed">
                  This accounts receivable management system represents a comprehensive solution for automating customer
                  communications, synchronizing financial data, and providing actionable insights for collection activities.
                </p>

                <div className="bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-lg border-2 border-blue-200">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Email Automation Excellence</h3>
                  <p className="leading-relaxed">
                    With {stats?.emailTemplates} templates and {stats?.emailFormulas} formulas, the system handles all customer
                    email communications automatically. From initial invoices to payment reminders, emails are sent at optimal
                    times based on configurable business rules. The scheduler runs hourly, evaluating conditions and sending
                    emails with appropriate rate limiting via SendGrid.
                  </p>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-purple-50 p-6 rounded-lg border-2 border-green-200">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Real-Time Acumatica Integration</h3>
                  <p className="leading-relaxed">
                    The system maintains {stats?.totalCustomers} customer records, {stats?.totalInvoices} invoices worth {formatCurrency(stats?.totalInvoiceAmount || 0)},
                    and {stats?.totalPayments} payments worth {formatCurrency(stats?.totalPaymentAmount || 0)}. Synchronization
                    occurs every 5 minutes via incremental sync, fetching only changed records to minimize API load. With
                    {stats?.unpaidInvoiceCount} unpaid invoices totaling {formatCurrency(stats?.unpaidBalance || 0)}, teams have
                    real-time visibility into accounts receivable status.
                  </p>
                </div>

                <div className="bg-gradient-to-r from-purple-50 to-red-50 p-6 rounded-lg border-2 border-purple-200">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Proactive Reminder System</h3>
                  <p className="leading-relaxed">
                    {stats?.activeReminders} active reminders ensure critical tasks receive attention. The system automatically
                    creates reminders for overdue invoices, displays popup notifications, supports snooze functionality, and
                    sends email alerts. This multi-layered approach prevents important follow-ups from being overlooked while
                    giving users flexibility in managing their workload.
                  </p>
                </div>

                <div className="bg-gradient-to-r from-red-50 to-orange-50 p-6 rounded-lg border-2 border-red-200">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Customer Reporting Capabilities</h3>
                  <p className="leading-relaxed">
                    The Customer Reports Monthly tool enables bulk invoice statement generation with advanced filtering by date,
                    balance, and customer selection. Generate professional PDFs, download in batch, or send via email with
                    real-time progress tracking. Each statement includes comprehensive customer information, balance details,
                    and unpaid invoice listings for clear communication.
                  </p>
                </div>

                <div className="bg-gradient-to-r from-orange-50 to-slate-50 p-6 rounded-lg border-2 border-orange-200">
                  <h3 className="text-xl font-bold text-slate-900 mb-3">Analytics & Intelligence</h3>
                  <p className="leading-relaxed">
                    Comprehensive dashboards visualize invoice aging, payment applications, customer balances, and collection
                    priorities. The status color system (green, yellow, red) provides instant visual indicators of account health.
                    Detailed charts and graphs transform raw data into actionable insights, enabling data-driven decision-making
                    for accounts receivable management.
                  </p>
                </div>

                <div className="mt-8 p-8 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-lg">
                  <h3 className="text-2xl font-bold mb-4 text-center">Final Summary</h3>
                  <p className="text-lg leading-relaxed text-slate-200">
                    This system combines automated email communications, real-time ERP synchronization, proactive reminders,
                    and powerful analytics to create a complete accounts receivable management platform. By automating routine
                    tasks, providing instant data visibility, and enabling batch operations, the system reduces manual effort
                    while improving collection efficiency. With {stats?.unpaidInvoiceCount} unpaid invoices worth {formatCurrency(stats?.unpaidBalance || 0)}
                    currently tracked, teams have the tools they need to manage cash flow, communicate effectively with customers,
                    and make informed decisions about collection priorities.
                  </p>
                </div>
              </div>
            </section>

            <div className="mt-12 pt-6 border-t border-slate-300 text-center text-slate-500 text-sm">
              <p>System Documentation - Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p className="mt-2">Confidential - Internal Use Only</p>
            </div>
          </div>
        </div>
      </div>

      <style>
        {`
          @media print {
            body {
              background: white !important;
            }
            .print\\:hidden {
              display: none !important;
            }
            .print\\:break-before-page {
              page-break-before: always;
            }
            .print\\:max-w-none {
              max-width: none !important;
            }
            .print\\:rounded-none {
              border-radius: 0 !important;
            }
            .print\\:shadow-none {
              box-shadow: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}
