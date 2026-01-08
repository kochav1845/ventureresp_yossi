import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Filter, RefreshCw, Clock, Database, User, FileText, DollarSign, AlertCircle, CheckCircle, Activity } from 'lucide-react';
import { formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface SyncChangeLog {
  id: string;
  sync_type: string;
  action_type: string;
  entity_id: string | null;
  entity_reference: string;
  entity_name: string | null;
  change_summary: string;
  change_details: any;
  sync_source: string;
  created_at: string;
  user_id: string | null;
}

interface Props {
  onBack?: () => void;
}

export default function SyncChangeLogsViewer({ onBack }: Props) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [logs, setLogs] = useState<SyncChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SyncChangeLog | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');

  useEffect(() => {
    loadLogs();
  }, [filterType, filterAction, filterSource]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('sync_change_logs')
        .select('*')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false });

      if (filterType !== 'all') {
        query = query.eq('sync_type', filterType);
      }
      if (filterAction !== 'all') {
        query = query.eq('action_type', filterAction);
      }
      if (filterSource !== 'all') {
        query = query.eq('sync_source', filterSource);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error loading sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'customer': return <User className="w-4 h-4" />;
      case 'invoice': return <FileText className="w-4 h-4" />;
      case 'payment': return <DollarSign className="w-4 h-4" />;
      default: return <Database className="w-4 h-4" />;
    }
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      'created': 'bg-green-500/20 text-green-400 border-green-500/30',
      'updated': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'closed': 'bg-red-500/20 text-red-400 border-red-500/30',
      'reopened': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'paid': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      'status_changed': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium border ${colors[action] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
        {action.replace('_', ' ')}
      </span>
    );
  };

  const getSourceBadge = (source: string) => {
    const icons: Record<string, any> = {
      'webhook': <Activity className="w-3 h-3" />,
      'scheduled_sync': <Clock className="w-3 h-3" />,
      'manual_sync': <User className="w-3 h-3" />,
      'bulk_fetch': <Database className="w-3 h-3" />,
      'batch_processing': <RefreshCw className="w-3 h-3" />,
    };

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-slate-700/50 text-slate-300">
        {icons[source]}
        {source.replace('_', ' ')}
      </span>
    );
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Sync Change Logs</h1>
              <p className="text-slate-400 text-sm">Last 24 hours of changes from Acumatica syncs</p>
            </div>
          </div>
          <button
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-white">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Entity Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Types</option>
                <option value="customer">Customers</option>
                <option value="invoice">Invoices</option>
                <option value="payment">Payments</option>
                <option value="payment_application">Payment Applications</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Action</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Actions</option>
                <option value="created">Created</option>
                <option value="updated">Updated</option>
                <option value="closed">Closed</option>
                <option value="reopened">Reopened</option>
                <option value="status_changed">Status Changed</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Source</label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Sources</option>
                <option value="webhook">Webhook</option>
                <option value="scheduled_sync">Scheduled Sync</option>
                <option value="manual_sync">Manual Sync</option>
                <option value="bulk_fetch">Bulk Fetch</option>
                <option value="batch_processing">Batch Processing</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-2">
              <div className="text-slate-400 text-sm mb-4">
                Showing {logs.length} changes from last 24 hours
              </div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`bg-slate-800/50 backdrop-blur-sm border rounded-xl p-4 cursor-pointer transition-all hover:bg-slate-700/50 ${
                    selectedLog?.id === log.id ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 bg-slate-700/50 rounded-lg mt-1">
                        {getTypeIcon(log.sync_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-white font-medium">{log.entity_reference}</span>
                          {getActionBadge(log.action_type)}
                        </div>
                        <p className="text-slate-300 text-sm mb-2">{log.change_summary}</p>
                        <div className="flex items-center gap-3 text-xs">
                          {getSourceBadge(log.sync_source)}
                          <span className="text-slate-500">{formatDateTimeUtil(log.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {logs.length === 0 && (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No sync logs found with the selected filters</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              {selectedLog ? (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 sticky top-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Change Details</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-500 uppercase">Entity</label>
                      <div className="flex items-center gap-2 mt-1">
                        {getTypeIcon(selectedLog.sync_type)}
                        <span className="text-white font-medium capitalize">{selectedLog.sync_type}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 uppercase">Reference</label>
                      <p className="text-white mt-1">{selectedLog.entity_reference}</p>
                    </div>

                    {selectedLog.entity_name && (
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Name</label>
                        <p className="text-white mt-1">{selectedLog.entity_name}</p>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-slate-500 uppercase">Action</label>
                      <div className="mt-1">{getActionBadge(selectedLog.action_type)}</div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 uppercase">Summary</label>
                      <p className="text-slate-300 mt-1 text-sm">{selectedLog.change_summary}</p>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 uppercase">Source</label>
                      <div className="mt-1">{getSourceBadge(selectedLog.sync_source)}</div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 uppercase">Timestamp</label>
                      <p className="text-slate-300 mt-1 text-sm">{formatDateTimeUtil(selectedLog.created_at)}</p>
                    </div>

                    {selectedLog.change_details && Object.keys(selectedLog.change_details).length > 0 && (
                      <div>
                        <label className="text-xs text-slate-500 uppercase mb-2 block">Additional Details</label>
                        <div className="bg-slate-900/50 rounded-lg p-3 space-y-2">
                          {Object.entries(selectedLog.change_details).map(([key, value]) => (
                            <div key={key} className="flex justify-between text-sm">
                              <span className="text-slate-400 capitalize">{key.replace('_', ' ')}:</span>
                              <span className="text-white font-medium">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 sticky top-6">
                  <div className="text-center py-12">
                    <CheckCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Select a log entry to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
