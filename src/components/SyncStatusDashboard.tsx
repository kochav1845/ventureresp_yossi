import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Activity, CheckCircle, XCircle, Clock, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CronJobControl from './CronJobControl';

interface SyncStatusDashboardProps {
  onBack?: () => void;
}

interface SyncStatus {
  id: string;
  entity_type: string;
  last_successful_sync: string | null;
  status: string;
  records_synced: number;
  records_created: number;
  records_updated: number;
  sync_duration_ms: number;
  last_error: string | null;
  retry_count: number;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  lookback_minutes: number;
}

interface SyncLog {
  id: string;
  entity_type: string;
  sync_started_at: string;
  sync_completed_at: string | null;
  status: string;
  records_synced: number;
  records_created: number;
  records_updated: number;
  duration_ms: number | null;
  errors: any[];
}

export default function SyncStatusDashboard({ onBack }: SyncStatusDashboardProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [syncingApplications, setSyncingApplications] = useState(false);
  const [syncingEntity, setSyncingEntity] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const recordsPerPage = 50;

  useEffect(() => {
    loadSyncData();
  }, [currentPage]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentPage === 1) {
        loadSyncData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const loadSyncData = async () => {
    try {
      const { data: statuses } = await supabase
        .from('sync_status')
        .select('*')
        .order('entity_type');

      // Get total count
      const { count } = await supabase
        .from('sync_logs')
        .select('*', { count: 'exact', head: true });

      const from = (currentPage - 1) * recordsPerPage;
      const to = from + recordsPerPage - 1;

      const { data: logs } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (statuses) setSyncStatuses(statuses);
      if (logs) setSyncLogs(logs);
      if (count !== null) setTotalRecords(count);
    } catch (err) {
      console.error('Error loading sync data:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerManualSync = async () => {
    setTriggering(true);
    setMessage('');

    try {
      // SECURITY: Credentials are handled server-side
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-master-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage(`Sync completed! Created: ${result.summary.totalCreated}, Updated: ${result.summary.totalUpdated}, Total: ${result.summary.totalFetched}`);
        loadSyncData();
      } else {
        setMessage(`Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setTriggering(false);
    }
  };

  const syncPaymentApplications = async () => {
    setSyncingApplications(true);
    setMessage('Extracting payment-to-invoice links from payment history...');

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-invoice-links-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage(`✅ Payment applications synced! ${result.total_links_created} invoice applications extracted from ${result.total_payments_processed} payments.`);
      } else {
        setMessage(`❌ Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setSyncingApplications(false);
    }
  };

  const syncIndividualEntity = async (entityType: string) => {
    setSyncingEntity(entityType);
    setMessage(`Syncing ${entityType}...`);

    try {
      const functionName = `acumatica-${entityType}-incremental-sync`;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage(`${entityType} synced! Created: ${result.created || 0}, Updated: ${result.updated || 0}, Total: ${result.fetched || 0}`);
        loadSyncData();
      } else {
        setMessage(`${entityType} sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setMessage(`Error syncing ${entityType}: ${err.message}`);
    } finally {
      setSyncingEntity(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const getEntityLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1) + 's';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="text-white">Loading sync status...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Sync Status Dashboard</h1>
            <p className="text-slate-400">Monitor real-time synchronization with Acumatica</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={syncPaymentApplications}
              disabled={syncingApplications}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              {syncingApplications ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  Sync Payment Apps
                </>
              )}
            </button>
            <button
              onClick={triggerManualSync}
              disabled={triggering}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              {triggering ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Trigger Sync Now
                </>
              )}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.includes('failed') || message.includes('Error') ? 'bg-red-900/20 border border-red-700 text-red-400' : 'bg-green-900/20 border border-green-700 text-green-400'}`}>
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {syncStatuses.map((status) => (
            <div
              key={status.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">
                  {getEntityLabel(status.entity_type)}
                </h3>
                {getStatusIcon(status.status)}
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-slate-400">Status</div>
                  <div className="text-white font-medium capitalize">{status.status}</div>
                </div>

                <div>
                  <div className="text-slate-400">Last Sync</div>
                  <div className="text-white text-xs">{formatTime(status.last_successful_sync)}</div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-slate-400">Total</div>
                    <div className="text-white font-bold">{status.records_synced}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Created</div>
                    <div className="text-green-400 font-bold">{status.records_created}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Updated</div>
                    <div className="text-blue-400 font-bold">{status.records_updated}</div>
                  </div>
                </div>

                {status.sync_duration_ms > 0 && (
                  <div>
                    <div className="text-slate-400">Duration</div>
                    <div className="text-white">{formatDuration(status.sync_duration_ms)}</div>
                  </div>
                )}

                {status.last_error && (
                  <div>
                    <div className="text-red-400">Last Error</div>
                    <div className="text-red-300 text-xs">{status.last_error}</div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Auto-Sync</span>
                    <span className={`font-medium ${status.sync_enabled ? 'text-green-400' : 'text-red-400'}`}>
                      {status.sync_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  {status.sync_enabled && (
                    <div className="text-xs text-slate-500 mt-1">
                      Every {status.sync_interval_minutes} min, lookback {status.lookback_minutes} min
                    </div>
                  )}
                </div>

                <button
                  onClick={() => syncIndividualEntity(status.entity_type)}
                  disabled={syncingEntity === status.entity_type}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {syncingEntity === status.entity_type ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Sync Now
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <CronJobControl />
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Recent Sync History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-3 text-slate-400 font-medium">Entity</th>
                  <th className="text-left p-3 text-slate-400 font-medium">Started</th>
                  <th className="text-left p-3 text-slate-400 font-medium">Completed</th>
                  <th className="text-left p-3 text-slate-400 font-medium">Status</th>
                  <th className="text-right p-3 text-slate-400 font-medium">Records</th>
                  <th className="text-right p-3 text-slate-400 font-medium">Created</th>
                  <th className="text-right p-3 text-slate-400 font-medium">Updated</th>
                  <th className="text-right p-3 text-slate-400 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="p-3 text-white capitalize">{log.entity_type}</td>
                    <td className="p-3 text-slate-400 text-xs">{formatTime(log.sync_started_at)}</td>
                    <td className="p-3 text-slate-400 text-xs">{formatTime(log.sync_completed_at)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        log.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                        log.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                        'bg-blue-900/30 text-blue-400'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-right text-white">{log.records_synced}</td>
                    <td className="p-3 text-right text-green-400">{log.records_created}</td>
                    <td className="p-3 text-right text-blue-400">{log.records_updated}</td>
                    <td className="p-3 text-right text-slate-400 text-xs">
                      {log.duration_ms ? formatDuration(log.duration_ms) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {syncLogs.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                No sync history yet. Trigger a manual sync to get started.
              </div>
            )}
          </div>

          {totalRecords > recordsPerPage && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-700">
              <div className="text-slate-400 text-sm">
                Showing {((currentPage - 1) * recordsPerPage) + 1} - {Math.min(currentPage * recordsPerPage, totalRecords)} of {totalRecords} records
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-white px-4">
                  Page {currentPage} of {Math.ceil(totalRecords / recordsPerPage)}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalRecords / recordsPerPage), p + 1))}
                  disabled={currentPage >= Math.ceil(totalRecords / recordsPerPage)}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
