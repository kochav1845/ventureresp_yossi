import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, DollarSign, Users, FileText, TrendingUp, Mail,
  Activity, CreditCard, ArrowRight, Target, RefreshCw, Lock,
  Sparkles, TrendingDown, CheckCircle2, Clock, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';

interface ComprehensiveAdminDashboardProps {
  onNavigate?: (view: string) => void;
}

interface DashboardMetrics {
  collectorPerformance: {
    totalCollectors: number;
    activeCollectors: number;
    totalTickets: number;
  };
  revenue: {
    totalRevenue: number;
    paymentsCount: number;
    averagePayment: number;
  };
  customers: {
    totalCustomers: number;
    activeCustomers: number;
    outstandingBalance: number;
  };
  invoices: {
    totalInvoices: number;
    openInvoices: number;
    paidInvoices: number;
  };
  payments: {
    totalPayments: number;
    totalAmount: number;
    withApplications: number;
  };
  userActivity: {
    totalUsers: number;
    activeToday: number;
    totalLogins: number;
  };
  emails: {
    totalSent: number;
    censusEmails: number;
    reportEmails: number;
  };
  stripe: {
    totalPayments: number;
    successful: number;
    revenue: number;
  };
  cronJobs: {
    totalFailures: number;
    failedJobs: Array<{
      job_name: string;
      error_message: string;
      executed_at: string;
    }>;
    totalExecutions: number;
    successfulExecutions: number;
    successRate: number;
    hasErrors: boolean;
  };
}

export default function ComprehensiveAdminDashboard({ onNavigate }: ComprehensiveAdminDashboardProps) {
  const navigate = useNavigate();
  const { hasPermission, userRole } = useUserPermissions();
  const hasAccess = userRole === 'admin' || userRole === 'manager' || hasPermission(PERMISSION_KEYS.ADMIN_DASHBOARD, 'view');

  const handleNavigate = (view: string) => {
    if (onNavigate) {
      onNavigate(view);
    } else {
      const routeMap: Record<string, string> = {
        'user-approval': '/user-approval',
        'collector-monitoring': '/collector-monitoring',
        'collector-performance': '/collector-performance',
        'revenue-analytics': '/revenue-analytics',
        'customer-analytics': '/customer-analytics',
        'invoice-analytics': '/invoice-status-analytics',
        'payment-analytics': '/payment-analytics',
        'user-activity': '/user-activity',
        'email-analytics': '/email-analytics',
        'stripe-analytics': '/stripe-analytics',
        'recent-sync-app-check': '/recent-sync-app-check',
        'auto-ticket-rules': '/admin-dashboard'
      };
      navigate(routeMap[view] || '/dashboard');
    }
  };

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    collectorPerformance: { totalCollectors: 0, activeCollectors: 0, totalTickets: 0 },
    revenue: { totalRevenue: 0, paymentsCount: 0, averagePayment: 0 },
    customers: { totalCustomers: 0, activeCustomers: 0, outstandingBalance: 0 },
    invoices: { totalInvoices: 0, openInvoices: 0, paidInvoices: 0 },
    payments: { totalPayments: 0, totalAmount: 0, withApplications: 0 },
    userActivity: { totalUsers: 0, activeToday: 0, totalLogins: 0 },
    emails: { totalSent: 0, censusEmails: 0, reportEmails: 0 },
    stripe: { totalPayments: 0, successful: 0, revenue: 0 },
    cronJobs: { totalFailures: 0, failedJobs: [], totalExecutions: 0, successfulExecutions: 0, successRate: 100, hasErrors: false }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllMetrics();
  }, []);

  const loadAllMetrics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_dashboard_metrics');

      if (error) throw error;

      if (data) {
        setMetrics(data);
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const analyticsCards = [
    {
      title: 'User Approval',
      subtitle: 'Manage pending accounts',
      icon: Users,
      metrics: [
        { label: 'Pending Accounts', value: '...' },
        { label: 'Approve/Reject', value: '→' }
      ],
      gradient: 'from-violet-500 via-purple-500 to-purple-600',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600',
      view: 'user-approval'
    },
    {
      title: 'Collector Monitoring',
      subtitle: 'Track collector activities',
      icon: Target,
      metrics: [
        { label: 'Total Collectors', value: formatNumber(metrics.collectorPerformance.totalCollectors), icon: Users },
        { label: 'Active This Week', value: formatNumber(metrics.collectorPerformance.activeCollectors), icon: Activity }
      ],
      gradient: 'from-blue-500 via-blue-600 to-indigo-600',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
      view: 'collector-monitoring'
    },
    {
      title: 'Collector Performance',
      subtitle: 'Performance metrics',
      icon: TrendingUp,
      metrics: [
        { label: 'Total Collectors', value: formatNumber(metrics.collectorPerformance.totalCollectors), icon: Users },
        { label: 'Total Tickets', value: formatNumber(metrics.collectorPerformance.totalTickets), icon: CheckCircle2 }
      ],
      gradient: 'from-cyan-500 via-sky-500 to-blue-500',
      iconBg: 'bg-cyan-500/10',
      iconColor: 'text-cyan-600',
      view: 'collector-performance'
    },
    {
      title: 'Revenue Analytics',
      subtitle: 'Financial overview',
      icon: DollarSign,
      metrics: [
        { label: 'Total Revenue (12mo)', value: formatCurrency(metrics.revenue.totalRevenue), icon: TrendingUp },
        { label: 'Avg Payment', value: formatCurrency(metrics.revenue.averagePayment), icon: DollarSign }
      ],
      gradient: 'from-emerald-500 via-green-500 to-teal-600',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
      view: 'revenue-analytics',
      highlight: true
    },
    {
      title: 'Customer Analytics',
      subtitle: 'Customer insights',
      icon: Users,
      metrics: [
        { label: 'Total Customers', value: formatNumber(metrics.customers.totalCustomers), icon: Users },
        { label: 'Outstanding', value: formatCurrency(metrics.customers.outstandingBalance), icon: AlertCircle }
      ],
      gradient: 'from-orange-500 via-amber-500 to-yellow-500',
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-600',
      view: 'customer-analytics'
    },
    {
      title: 'Invoice Analytics',
      subtitle: 'Invoice tracking',
      icon: FileText,
      metrics: [
        { label: 'Total Invoices', value: formatNumber(metrics.invoices.totalInvoices), icon: FileText },
        { label: 'Open', value: formatNumber(metrics.invoices.openInvoices), icon: Clock }
      ],
      gradient: 'from-pink-500 via-rose-500 to-red-500',
      iconBg: 'bg-pink-500/10',
      iconColor: 'text-pink-600',
      view: 'invoice-analytics'
    },
    {
      title: 'Payment Analytics',
      subtitle: 'Payment processing',
      icon: CreditCard,
      metrics: [
        { label: 'Total Payments', value: formatNumber(metrics.payments.totalPayments), icon: CreditCard },
        { label: 'Total Amount', value: formatCurrency(metrics.payments.totalAmount), icon: DollarSign }
      ],
      gradient: 'from-teal-500 via-cyan-500 to-sky-500',
      iconBg: 'bg-teal-500/10',
      iconColor: 'text-teal-600',
      view: 'payment-analytics'
    },
    {
      title: 'User Activity',
      subtitle: 'User engagement',
      icon: Activity,
      metrics: [
        { label: 'Total Users', value: formatNumber(metrics.userActivity.totalUsers), icon: Users },
        { label: 'Active Today', value: formatNumber(metrics.userActivity.activeToday), icon: Activity }
      ],
      gradient: 'from-fuchsia-500 via-purple-500 to-violet-500',
      iconBg: 'bg-fuchsia-500/10',
      iconColor: 'text-fuchsia-600',
      view: 'user-activity'
    },
    {
      title: 'Email Analytics',
      subtitle: 'Email campaigns',
      icon: Mail,
      metrics: [
        { label: 'Total Sent', value: formatNumber(metrics.emails.totalSent), icon: Mail },
        { label: 'Census', value: formatNumber(metrics.emails.censusEmails), icon: CheckCircle2 }
      ],
      gradient: 'from-sky-500 via-blue-500 to-indigo-500',
      iconBg: 'bg-sky-500/10',
      iconColor: 'text-sky-600',
      view: 'email-analytics'
    },
    {
      title: 'Stripe Payments',
      subtitle: 'Payment processing',
      icon: CreditCard,
      metrics: [
        { label: 'Total Payments', value: formatNumber(metrics.stripe.totalPayments), icon: CreditCard },
        { label: 'Revenue', value: formatCurrency(metrics.stripe.revenue / 100), icon: DollarSign }
      ],
      gradient: 'from-indigo-500 via-purple-600 to-pink-500',
      iconBg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-600',
      view: 'stripe-analytics'
    },
    {
      title: 'Sync Status',
      subtitle: 'Verify sync operations',
      icon: RefreshCw,
      metrics: [
        { label: 'Check Applications', value: '→' },
        { label: 'Verify Status', value: '...' }
      ],
      gradient: 'from-lime-500 via-green-500 to-emerald-500',
      iconBg: 'bg-lime-500/10',
      iconColor: 'text-lime-600',
      view: 'recent-sync-app-check'
    },
    {
      title: 'System Health',
      subtitle: 'Cron job monitoring',
      icon: Activity,
      metrics: [
        {
          label: 'Success Rate (24h)',
          value: `${metrics.cronJobs.successRate}%`,
          icon: metrics.cronJobs.hasErrors ? AlertCircle : CheckCircle2
        },
        {
          label: 'Failed Jobs',
          value: metrics.cronJobs.totalFailures,
          icon: metrics.cronJobs.hasErrors ? AlertCircle : CheckCircle2
        }
      ],
      gradient: metrics.cronJobs.hasErrors
        ? 'from-red-500 via-rose-500 to-pink-500'
        : 'from-green-500 via-emerald-500 to-teal-500',
      iconBg: metrics.cronJobs.hasErrors ? 'bg-red-500/10' : 'bg-green-500/10',
      iconColor: metrics.cronJobs.hasErrors ? 'text-red-600' : 'text-green-600',
      view: 'logs'
    },
    {
      title: 'Auto-Ticket Rules',
      subtitle: 'Automated ticketing',
      icon: Clock,
      metrics: [
        { label: 'Manage Rules', value: '→' },
        { label: 'Daily @ 6 AM', value: '⏰' }
      ],
      gradient: 'from-amber-500 via-orange-500 to-red-500',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-600',
      view: 'auto-ticket-rules'
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
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
    <div className="min-h-screen bg-white">
      {/* Cron Job Error Alert Banner */}
      {metrics.cronJobs.hasErrors && (
        <div className="bg-red-600 border-b-4 border-red-700">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="p-2 bg-white/20 rounded-lg">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-1">
                  System Alert: {metrics.cronJobs.totalFailures} Cron Job{metrics.cronJobs.totalFailures !== 1 ? 's' : ''} Failed (Last 24 Hours)
                </h3>
                <p className="text-red-100 text-sm mb-3">
                  Success Rate: {metrics.cronJobs.successRate}% ({metrics.cronJobs.successfulExecutions}/{metrics.cronJobs.totalExecutions} executions)
                </p>
                <div className="space-y-2">
                  {metrics.cronJobs.failedJobs.slice(0, 3).map((job, idx) => (
                    <div key={idx} className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-semibold text-white text-sm">{job.job_name}</p>
                          <p className="text-red-100 text-xs mt-1">{job.error_message}</p>
                        </div>
                        <span className="text-xs text-red-200 whitespace-nowrap">
                          {new Date(job.executed_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {metrics.cronJobs.failedJobs.length > 3 && (
                  <p className="text-red-100 text-sm mt-2">
                    +{metrics.cronJobs.failedJobs.length - 3} more failed job{metrics.cronJobs.failedJobs.length - 3 !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
              <p className="text-gray-600 text-lg mt-1">Comprehensive analytics and performance metrics</p>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Revenue (12mo)</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(metrics.revenue.totalRevenue)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Customers</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(metrics.customers.totalCustomers)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Open Invoices</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(metrics.invoices.openInvoices)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Activity className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wide">Active Today</p>
                  <p className="text-xl font-bold text-gray-900">{formatNumber(metrics.userActivity.activeToday)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Cards Grid */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {analyticsCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="group bg-white rounded-2xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer animate-fade-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleNavigate(card.view)}
              >
                {/* Card Header with Gradient */}
                <div className={`bg-gradient-to-br ${card.gradient} p-6 relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full -ml-12 -mb-12"></div>
                  <div className="relative flex items-start justify-between">
                    <div className="flex-1">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl mb-3">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-1">{card.title}</h3>
                      <p className="text-white/80 text-sm font-medium">{card.subtitle}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" />
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 bg-white">
                  <div className="space-y-4">
                    {card.metrics.map((metric, idx) => {
                      const MetricIcon = metric.icon;
                      return (
                        <div key={idx} className="flex items-center justify-between group/metric">
                          <div className="flex items-center gap-2">
                            {MetricIcon && (
                              <div className="p-1.5 bg-gray-100 rounded-lg group-hover/metric:bg-gray-200 transition-colors">
                                <MetricIcon className="w-4 h-4 text-gray-600" />
                              </div>
                            )}
                            <span className="text-sm text-gray-600 font-medium">{metric.label}</span>
                          </div>
                          <span className="text-base font-bold text-gray-900">{metric.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                  <button className="w-full text-sm font-semibold text-gray-700 group-hover:text-gray-900 flex items-center justify-center gap-2 transition-colors">
                    View Details
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Refresh Button */}
        <div className="mt-12 flex justify-center">
          <button
            onClick={loadAllMetrics}
            disabled={loading}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
