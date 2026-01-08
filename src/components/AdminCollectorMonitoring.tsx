import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Search, Users, Activity, FileText, Mail,
  TrendingUp, Eye, Calendar, Filter, ChevronDown, ChevronUp
} from 'lucide-react';

interface Collector {
  collector_id: string;
  collector_email: string;
  assigned_customers: number;
  invoices_modified: number;
  payments_modified: number;
  emails_scheduled: number;
  emails_sent: number;
  last_activity_at: string | null;
}

interface CollectorActivity {
  activity_date: string;
  invoices_modified: number;
  payments_modified: number;
  emails_sent: number;
  customers_contacted: number;
}

interface ChangeLog {
  changed_at: string;
  changed_by_email: string;
  change_type: string;
  field_name: string;
  old_value: string;
  new_value: string;
  invoice_reference_number?: string;
  payment_reference_number?: string;
}

export default function AdminCollectorMonitoring({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<string | null>(null);
  const [collectorActivity, setCollectorActivity] = useState<CollectorActivity[]>([]);
  const [recentChanges, setRecentChanges] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'detailed'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState(30);
  const [expandedCollector, setExpandedCollector] = useState<string | null>(null);

  useEffect(() => {
    loadCollectors();
  }, []);

  useEffect(() => {
    if (selectedCollector) {
      loadCollectorDetails(selectedCollector);
    }
  }, [selectedCollector, dateRange]);

  const loadCollectors = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('collector_activity_summary')
      .select('*')
      .order('last_activity_at', { ascending: false });

    if (data) {
      setCollectors(data);
    }
    setLoading(false);
  };

  const loadCollectorDetails = async (collectorId: string) => {
    const { data: activityData } = await supabase
      .rpc('get_collector_activity', {
        p_collector_id: collectorId,
        p_days_back: dateRange
      });

    if (activityData) {
      setCollectorActivity(activityData);
    }

    const { data: invoiceChanges } = await supabase
      .from('invoice_change_log')
      .select('*')
      .eq('changed_by', collectorId)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: paymentChanges } = await supabase
      .from('payment_change_log')
      .select('*')
      .eq('changed_by', collectorId)
      .order('created_at', { ascending: false })
      .limit(50);

    const combined: ChangeLog[] = [
      ...(invoiceChanges || []).map(c => ({
        changed_at: c.created_at,
        changed_by_email: '',
        change_type: c.change_type,
        field_name: c.field_name,
        old_value: c.old_value,
        new_value: c.new_value,
        invoice_reference_number: c.invoice_reference_number
      })),
      ...(paymentChanges || []).map(c => ({
        changed_at: c.created_at,
        changed_by_email: '',
        change_type: c.change_type,
        field_name: c.field_name,
        old_value: c.old_value,
        new_value: c.new_value,
        payment_reference_number: c.payment_reference_number
      }))
    ].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

    setRecentChanges(combined);
  };

  const getInvoiceChangeHistory = async (invoiceRef: string) => {
    const { data } = await supabase
      .rpc('get_invoice_change_history', {
        p_invoice_ref: invoiceRef
      });

    return data || [];
  };

  const filteredCollectors = collectors.filter(c =>
    c.collector_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTotalStats = () => {
    return {
      totalCollectors: collectors.length,
      totalInvoicesModified: collectors.reduce((sum, c) => sum + (c.invoices_modified || 0), 0),
      totalPaymentsModified: collectors.reduce((sum, c) => sum + (c.payments_modified || 0), 0),
      totalEmailsSent: collectors.reduce((sum, c) => sum + (c.emails_sent || 0), 0),
      activeToday: collectors.filter(c => {
        if (!c.last_activity_at) return false;
        const lastActivity = new Date(c.last_activity_at);
        const today = new Date();
        return lastActivity.toDateString() === today.toDateString();
      }).length
    };
  };

  const stats = getTotalStats();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center text-white hover:text-blue-100 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Admin Dashboard
          </button>
          <h1 className="text-3xl font-bold">Collector Monitoring & Oversight</h1>
          <p className="text-blue-100 mt-2">Monitor collector activities, track changes, and ensure accountability</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Collectors</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalCollectors}</p>
              </div>
              <Users className="w-10 h-10 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Today</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{stats.activeToday}</p>
              </div>
              <Activity className="w-10 h-10 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Invoices Modified</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalInvoicesModified}</p>
              </div>
              <FileText className="w-10 h-10 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Payments Modified</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalPaymentsModified}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Emails Sent</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalEmailsSent}</p>
              </div>
              <Mail className="w-10 h-10 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search collectors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setActiveView(activeView === 'overview' ? 'detailed' : 'overview')}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                {activeView === 'overview' ? 'Detailed View' : 'Overview'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredCollectors.map((collector) => (
              <div key={collector.collector_id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                        {collector.collector_email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{collector.collector_email}</h3>
                        <p className="text-sm text-gray-600">
                          {collector.assigned_customers} customers assigned
                          {collector.last_activity_at && (
                            <span className="ml-3">
                              Last active: {new Date(collector.last_activity_at).toLocaleString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{collector.invoices_modified}</p>
                      <p className="text-xs text-gray-600">Invoices</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{collector.payments_modified}</p>
                      <p className="text-xs text-gray-600">Payments</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{collector.emails_sent}/{collector.emails_scheduled}</p>
                      <p className="text-xs text-gray-600">Emails</p>
                    </div>
                    <button
                      onClick={() => {
                        if (expandedCollector === collector.collector_id) {
                          setExpandedCollector(null);
                          setSelectedCollector(null);
                        } else {
                          setExpandedCollector(collector.collector_id);
                          setSelectedCollector(collector.collector_id);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                      {expandedCollector === collector.collector_id ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          View Details
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {expandedCollector === collector.collector_id && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex gap-4 mb-6">
                      <select
                        value={dateRange}
                        onChange={(e) => setDateRange(Number(e.target.value))}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-lg mb-4">Activity Timeline</h4>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {collectorActivity.map((activity, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                              <Calendar className="w-5 h-5 text-gray-400" />
                              <div className="flex-1">
                                <p className="text-sm font-medium">{new Date(activity.activity_date).toLocaleDateString()}</p>
                                <p className="text-xs text-gray-600">
                                  {activity.invoices_modified} invoices, {activity.payments_modified} payments, {activity.emails_sent} emails
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-lg mb-4">Recent Changes</h4>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {recentChanges.slice(0, 20).map((change, idx) => (
                            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-blue-600">
                                  {change.invoice_reference_number || change.payment_reference_number}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(change.changed_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm">
                                <span className="font-medium">{change.field_name}</span>:
                                <span className="text-red-600 mx-1">{change.old_value}</span>
                                →
                                <span className="text-green-600 mx-1">{change.new_value}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
