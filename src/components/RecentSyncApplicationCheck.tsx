import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface Props {
  onBack?: () => void;
}

interface SyncChangeLog {
  id: string;
  sync_type: string;
  action_type: string;
  entity_reference: string;
  entity_name: string;
  change_summary: string;
  change_details: any;
  created_at: string;
}

export default function RecentSyncApplicationCheck({ onBack }: Props) {
  const [logs, setLogs] = useState<SyncChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    paymentsCreated: 0,
    paymentsUpdated: 0,
    applicationsSynced: 0,
    applicationsFailed: 0,
    applicationsSkipped: 0,
  });

  useEffect(() => {
    loadRecentSyncLogs();
  }, []);

  const loadRecentSyncLogs = async () => {
    setLoading(true);
    try {
      // Get logs from the last hour
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const { data, error } = await supabase
        .from('sync_change_logs')
        .select('*')
        .eq('sync_type', 'payment')
        .gte('created_at', oneHourAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLogs(data || []);

      // Calculate summary
      let paymentsCreated = 0;
      let paymentsUpdated = 0;
      let applicationsSynced = 0;
      let applicationsFailed = 0;
      let applicationsSkipped = 0;

      data?.forEach(log => {
        if (log.action_type === 'created') paymentsCreated++;
        if (log.action_type === 'updated') paymentsUpdated++;
        if (log.action_type === 'application_synced') {
          applicationsSynced++;
        }
        if (log.action_type === 'application_sync_failed') applicationsFailed++;
        if (log.action_type === 'application_sync_skipped') applicationsSkipped++;
      });

      setSummary({
        paymentsCreated,
        paymentsUpdated,
        applicationsSynced,
        applicationsFailed,
        applicationsSkipped,
      });
    } catch (err) {
      console.error('Error loading sync logs:', err);
    } finally {
      setLoading(false);
    }
  };


  const getActionIcon = (actionType: string) => {
    if (actionType === 'application_synced') return <CheckCircle className="text-green-400" size={18} />;
    if (actionType === 'application_sync_failed') return <XCircle className="text-red-400" size={18} />;
    if (actionType === 'application_sync_skipped') return <AlertTriangle className="text-yellow-400" size={18} />;
    return <FileText className="text-blue-400" size={18} />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="text-slate-400" size={24} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">Recent Payment Sync - Application Check</h1>
                <p className="text-sm text-slate-400">See if applications were fetched in the recent sync</p>
              </div>
            </div>
            <button
              onClick={loadRecentSyncLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Payments Created</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{summary.paymentsCreated}</p>
              </div>
              <CheckCircle className="text-green-400" size={32} />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Payments Updated</p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{summary.paymentsUpdated}</p>
              </div>
              <RefreshCw className="text-blue-400" size={32} />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Apps Synced</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{summary.applicationsSynced}</p>
              </div>
              <CheckCircle className="text-green-400" size={32} />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Apps Failed</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{summary.applicationsFailed}</p>
              </div>
              <XCircle className="text-red-400" size={32} />
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Apps Skipped</p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{summary.applicationsSkipped}</p>
              </div>
              <AlertTriangle className="text-yellow-400" size={32} />
            </div>
          </div>
        </div>

        {/* Detailed Logs */}
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
            <p className="text-slate-400">Loading sync logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-12 text-center">
            <FileText className="text-slate-600 mx-auto mb-4" size={48} />
            <p className="text-slate-400">No payment sync logs found in the last hour</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white mb-4">Detailed Sync Logs (Last Hour)</h2>
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getActionIcon(log.action_type)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-white font-semibold">{log.entity_name}</h3>
                        <p className="text-sm text-slate-400">{log.change_summary}</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTimeUtil(log.created_at)}</span>
                    </div>

                    {log.change_details && (
                      <div className="mt-3 p-3 bg-slate-900/50 rounded-lg">
                        <pre className="text-xs text-slate-300 overflow-x-auto">
                          {JSON.stringify(log.change_details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
