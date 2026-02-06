import { useState, useEffect } from 'react';
import { ArrowLeft, Mail, Eye, MousePointerClick, AlertCircle, CheckCircle, Clock, Search, Filter, TrendingUp, Users, BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CustomerEmailTrackingProps {
  onBack?: () => void;
}

interface EmailLog {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  template_name: string;
  subject: string;
  sent_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  bounce_reason: string | null;
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  error_message: string | null;
  invoice_count: number;
  total_balance: number;
}

interface EmailStats {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  unique_recipients: number;
  average_open_rate: number;
  average_click_rate: number;
}

export default function CustomerEmailTracking({ onBack }: CustomerEmailTrackingProps) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [startDate, endDate]);

  const loadData = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('customer_email_logs')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(200);

      if (startDate) {
        query = query.gte('sent_at', new Date(startDate).toISOString());
      }
      if (endDate) {
        query = query.lte('sent_at', new Date(endDate).toISOString());
      }

      const { data: logsData, error: logsError } = await query;

      if (logsError) throw logsError;

      setLogs(logsData || []);

      const { data: statsData, error: statsError } = await supabase.rpc('get_email_statistics', {
        p_start_date: startDate ? new Date(startDate).toISOString() : null,
        p_end_date: endDate ? new Date(endDate).toISOString() : null,
      });

      if (statsError) throw statsError;

      if (statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }
    } catch (error) {
      console.error('Error loading email tracking data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch = searchTerm === '' ||
      log.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.subject.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const badges = {
      sent: { bg: 'bg-slate-100', text: 'text-slate-700', icon: Mail, label: 'Sent' },
      delivered: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle, label: 'Delivered' },
      opened: { bg: 'bg-green-100', text: 'text-green-700', icon: Eye, label: 'Opened' },
      clicked: { bg: 'bg-purple-100', text: 'text-purple-700', icon: MousePointerClick, label: 'Clicked' },
      bounced: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle, label: 'Bounced' },
      failed: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle, label: 'Failed' },
    };

    const badge = badges[status as keyof typeof badges] || badges.sent;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Email Tracking Dashboard</h1>
            <p className="text-sm text-slate-600 mt-1">
              Track customer email engagement and delivery status
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Sent</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total_sent}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {stats.unique_recipients} unique recipients
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Delivered</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total_delivered}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {stats.total_sent > 0 ? ((stats.total_delivered / stats.total_sent) * 100).toFixed(1) : 0}% delivery rate
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Opened</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total_opened}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Eye className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {stats.average_open_rate.toFixed(1)}% open rate
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Clicked</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{stats.total_clicked}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <MousePointerClick className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {stats.average_click_rate.toFixed(1)}% click rate
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search customers or emails..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="w-48">
            <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="opened">Opened</option>
              <option value="clicked">Clicked</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="w-48">
            <label className="block text-sm font-medium text-slate-700 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="w-48">
            <label className="block text-sm font-medium text-slate-700 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Template
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Sent
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Opened
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No emails found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{log.customer_name}</div>
                      <div className="text-sm text-slate-500">{log.customer_email}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-slate-900 max-w-xs truncate">{log.subject}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {log.invoice_count} invoices • {formatCurrency(log.total_balance)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-slate-700">{log.template_name}</div>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(log.status)}
                      {log.bounce_reason && (
                        <div className="text-xs text-red-600 mt-1" title={log.bounce_reason}>
                          {log.bounce_reason.substring(0, 30)}...
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {formatDate(log.sent_at)}
                    </td>
                    <td className="px-4 py-4">
                      {log.opened_at ? (
                        <div>
                          <div className="text-sm text-slate-900">{formatDate(log.opened_at)}</div>
                          {log.open_count > 1 && (
                            <div className="text-xs text-slate-500 mt-1">
                              {log.open_count} times • Last: {formatDate(log.last_opened_at)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Not opened</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2 text-xs">
                        {log.delivered_at && (
                          <span className="flex items-center gap-1 text-green-600" title={`Delivered at ${formatDate(log.delivered_at)}`}>
                            <CheckCircle className="w-3 h-3" />
                          </span>
                        )}
                        {log.clicked_at && (
                          <span className="flex items-center gap-1 text-purple-600" title={`Clicked ${log.click_count} times`}>
                            <MousePointerClick className="w-3 h-3" />
                            {log.click_count}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (
          <div className="mt-4 text-sm text-slate-600">
            Showing {filteredLogs.length} of {logs.length} emails
          </div>
        )}
      </div>
    </div>
  );
}
