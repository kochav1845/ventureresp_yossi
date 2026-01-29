import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, Mail, Users, FileText, CheckCircle, Clock, AlertCircle, BarChart3, DollarSign } from 'lucide-react';

interface DashboardProps {
  onNavigate?: (view: string) => void;
}

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  totalEmails: number;
  unreadEmails: number;
  processedEmails: number;
  emailsThisMonth: number;
  respondedThisMonth: number;
  filesUploaded: number;
}

interface EmailChartData {
  week: number;
  month: number;
  year: number;
}

type TimeFrame = 'week' | 'month' | 'year';

export default function Dashboard({ onNavigate }: DashboardProps = {}) {
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    activeCustomers: 0,
    totalEmails: 0,
    unreadEmails: 0,
    processedEmails: 0,
    emailsThisMonth: 0,
    respondedThisMonth: 0,
    filesUploaded: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailChartData, setEmailChartData] = useState<EmailChartData>({ week: 0, month: 0, year: 0 });
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrame>('week');

  useEffect(() => {
    loadStats();
    loadEmailChartData();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [customersRes, activeCustomersRes, emailsRes, unreadRes, processedRes, monthEmailsRes, respondedRes, filesRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }),
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('is_read', false),
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('processing_status', 'processed'),
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).gte('received_at', startOfMonth),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('responded_this_month', true),
        supabase.from('customer_files').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalCustomers: customersRes.count || 0,
        activeCustomers: activeCustomersRes.count || 0,
        totalEmails: emailsRes.count || 0,
        unreadEmails: unreadRes.count || 0,
        processedEmails: processedRes.count || 0,
        emailsThisMonth: monthEmailsRes.count || 0,
        respondedThisMonth: respondedRes.count || 0,
        filesUploaded: filesRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      setError('Failed to load dashboard statistics. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const loadEmailChartData = async () => {
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

      const [weekRes, monthRes, yearRes] = await Promise.all([
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).gte('received_at', weekAgo),
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).gte('received_at', monthAgo),
        supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).gte('received_at', yearAgo),
      ]);

      setEmailChartData({
        week: weekRes.count || 0,
        month: monthRes.count || 0,
        year: yearRes.count || 0,
      });
    } catch (error) {
      console.error('Error loading email chart data:', error);
    }
  };

  const responseRate = stats.totalCustomers > 0
    ? Math.round((stats.respondedThisMonth / stats.totalCustomers) * 100)
    : 0;

  const processingRate = stats.totalEmails > 0
    ? Math.round((stats.processedEmails / stats.totalEmails) * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-blue-600">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-900 font-semibold mb-1">Error Loading Dashboard</h3>
              <p className="text-red-700 text-sm">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  loadStats();
                  loadEmailChartData();
                }}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-blue-900 mb-2">Dashboard</h2>
        <p className="text-blue-600">Overview of your email automation system</p>
      </div>

      {onNavigate && (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 shadow-lg">
          <h3 className="text-xl font-bold text-white mb-4">Analytics & Reporting</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => onNavigate('collector-performance')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Collector Performance</span>
            </button>
            <button
              onClick={() => onNavigate('revenue-analytics')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <TrendingUp className="w-5 h-5" />
              <span className="font-medium">Revenue Analytics</span>
            </button>
            <button
              onClick={() => onNavigate('customer-analytics')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Customer Analytics</span>
            </button>
            <button
              onClick={() => onNavigate('invoice-analytics')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium">Invoice Analytics</span>
            </button>
            <button
              onClick={() => onNavigate('payment-analytics')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <DollarSign className="w-5 h-5" />
              <span className="font-medium">Payment Analytics</span>
            </button>
            <button
              onClick={() => onNavigate('user-activity')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">User Activity</span>
            </button>
            <button
              onClick={() => onNavigate('email-analytics')}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              <Mail className="w-5 h-5" />
              <span className="font-medium">Email Analytics</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <div className="space-y-1">
            <p className="text-blue-600 text-sm">Total Customers</p>
            <p className="text-3xl font-bold text-blue-900">{stats.totalCustomers}</p>
            <p className="text-green-600 text-sm">{stats.activeCustomers} active</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Mail className="text-blue-600" size={24} />
            </div>
            <Clock className="text-blue-500" size={20} />
          </div>
          <div className="space-y-1">
            <p className="text-blue-600 text-sm">Total Emails</p>
            <p className="text-3xl font-bold text-blue-900">{stats.totalEmails}</p>
            <p className="text-blue-500 text-sm">{stats.unreadEmails} unread</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <CheckCircle className="text-blue-600" size={24} />
            </div>
            <BarChart3 className="text-blue-600" size={20} />
          </div>
          <div className="space-y-1">
            <p className="text-blue-600 text-sm">Emails This Month</p>
            <p className="text-3xl font-bold text-blue-900">{stats.emailsThisMonth}</p>
            <p className="text-green-600 text-sm">{stats.processedEmails} processed</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <FileText className="text-blue-600" size={24} />
            </div>
            <TrendingUp className="text-green-600" size={20} />
          </div>
          <div className="space-y-1">
            <p className="text-blue-600 text-sm">Files Uploaded</p>
            <p className="text-3xl font-bold text-blue-900">{stats.filesUploaded}</p>
            <p className="text-blue-600 text-sm">Total attachments</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-blue-900 mb-6">Response Rate</h3>
          <div className="relative h-48 flex items-center justify-center">
            <svg className="transform -rotate-90" width="200" height="200">
              <circle
                cx="100"
                cy="100"
                r="80"
                stroke="#dbeafe"
                strokeWidth="20"
                fill="none"
              />
              <circle
                cx="100"
                cy="100"
                r="80"
                stroke="#2563eb"
                strokeWidth="20"
                fill="none"
                strokeDasharray={`${(responseRate / 100) * 502.65} 502.65`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-5xl font-bold text-blue-900">{responseRate}%</span>
              <span className="text-blue-600 text-sm mt-2">Responded</span>
            </div>
          </div>
          <div className="mt-6 text-center">
            <p className="text-blue-600">
              {stats.respondedThisMonth} of {stats.totalCustomers} customers responded this month
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-blue-900 mb-6">Email Processing</h3>
          <div className="relative h-48 flex items-center justify-center">
            <svg className="transform -rotate-90" width="200" height="200">
              <circle
                cx="100"
                cy="100"
                r="80"
                stroke="#dbeafe"
                strokeWidth="20"
                fill="none"
              />
              <circle
                cx="100"
                cy="100"
                r="80"
                stroke="#10b981"
                strokeWidth="20"
                fill="none"
                strokeDasharray={`${(processingRate / 100) * 502.65} 502.65`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-5xl font-bold text-blue-900">{processingRate}%</span>
              <span className="text-blue-600 text-sm mt-2">Processed</span>
            </div>
          </div>
          <div className="mt-6 text-center">
            <p className="text-blue-600">
              {stats.processedEmails} of {stats.totalEmails} emails successfully processed
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-blue-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-blue-900">Email Volume</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedTimeFrame('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTimeFrame === 'week'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setSelectedTimeFrame('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTimeFrame === 'month'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setSelectedTimeFrame('year')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTimeFrame === 'year'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              Year
            </button>
          </div>
        </div>

        <div className="flex items-end justify-center gap-8 h-64">
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-32">
              <div
                className="bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all duration-500"
                style={{
                  height: `${Math.max((emailChartData[selectedTimeFrame] / Math.max(emailChartData.week, emailChartData.month, emailChartData.year, 1)) * 200, 20)}px`,
                }}
              >
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-900 text-white px-3 py-1 rounded-lg text-sm font-bold">
                  {emailChartData[selectedTimeFrame]}
                </div>
              </div>
            </div>
            <p className="text-blue-900 font-medium capitalize mt-2">{selectedTimeFrame}</p>
            <p className="text-blue-600 text-sm">
              {selectedTimeFrame === 'week' ? 'Last 7 days' : selectedTimeFrame === 'month' ? 'Last 30 days' : 'Last 365 days'}
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            <div className="p-4 bg-blue-100 rounded-xl">
              <BarChart3 className="text-blue-600" size={48} />
            </div>
            <div>
              <p className="text-blue-900 font-semibold text-lg">Total Emails Received</p>
              <p className="text-blue-600 text-sm mt-1">Including inbound and system emails</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-blue-900">{emailChartData.week}</p>
            <p className="text-blue-600 text-sm mt-1">Past Week</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-blue-900">{emailChartData.month}</p>
            <p className="text-blue-600 text-sm mt-1">Past Month</p>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-blue-900">{emailChartData.year}</p>
            <p className="text-blue-600 text-sm mt-1">Past Year</p>
          </div>
        </div>
      </div>

    </div>
  );
}
