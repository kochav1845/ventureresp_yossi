import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, CheckCircle, Clock, XCircle, RefreshCw, Play, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SyncLog {
  id: string;
  entity_type: string;
  sync_started_at: string;
  sync_completed_at: string | null;
  status: string;
  records_synced: number;
  duration_ms: number | null;
}

interface SyncStatus {
  entity_type: string;
  last_successful_sync: string | null;
  status: string;
  records_synced: number;
  lookback_minutes: number;
  last_error: string | null;
}

const SyncHealthDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [stuckSyncs, setStuckSyncs] = useState<SyncLog[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);

  const loadData = async () => {
    setLoading(true);

    // Get sync status
    const { data: statuses } = await supabase
      .from('sync_status')
      .select('*')
      .order('entity_type');

    if (statuses) {
      setSyncStatuses(statuses);
    }

    // Get stuck syncs (running for more than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from('sync_logs')
      .select('*')
      .eq('status', 'running')
      .lt('sync_started_at', tenMinutesAgo)
      .order('sync_started_at', { ascending: false })
      .limit(50);

    if (stuck) {
      setStuckSyncs(stuck);
    }

    // Get recent syncs
    const { data: recent } = await supabase
      .from('sync_logs')
      .select('*')
      .order('sync_started_at', { ascending: false })
      .limit(20);

    if (recent) {
      setRecentSyncs(recent);
    }

    setLoading(false);
  };

  const fixStuckSyncs = async () => {
    if (!confirm(`This will mark ${stuckSyncs.length} stuck syncs as failed. Continue?`)) {
      return;
    }

    setFixing(true);

    try {
      // Mark all stuck syncs as failed
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          sync_completed_at: new Date().toISOString(),
          errors: ['Sync timed out or crashed - marked as failed by health dashboard']
        })
        .eq('status', 'running')
        .lt('sync_started_at', tenMinutesAgo);

      // Reset sync_status table for any stuck syncs
      await supabase
        .from('sync_status')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('status', 'running');

      alert('Successfully fixed stuck syncs!');
      await loadData();
    } catch (error: any) {
      alert(`Error fixing syncs: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  const triggerSync = async () => {
    if (!confirm('Trigger a manual sync now?')) {
      return;
    }

    setFixing(true);

    try {
      const { data, error } = await supabase.functions.invoke('acumatica-master-sync');

      if (error) {
        throw error;
      }

      alert('Sync triggered successfully! Check recent syncs below.');
      await loadData();
    } catch (error: any) {
      alert(`Error triggering sync: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getTimeSince = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      return `${Math.floor(hours / 24)} days ago`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ago`;
    } else {
      return `${minutes}m ago`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Sync Health Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={triggerSync}
            disabled={fixing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Trigger Sync
          </button>
        </div>
      </div>

      {/* Sync Status Overview */}
      <div className="grid grid-cols-3 gap-4">
        {syncStatuses.map((status) => (
          <div key={status.entity_type} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 capitalize">{status.entity_type}</h3>
              {status.status === 'running' ? (
                <Clock className="w-5 h-5 text-yellow-500 animate-spin" />
              ) : status.status === 'failed' ? (
                <XCircle className="w-5 h-5 text-red-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-gray-600">
                Last sync: <span className="font-medium">{getTimeSince(status.last_successful_sync)}</span>
              </p>
              <p className="text-gray-600">
                Records: <span className="font-medium">{status.records_synced}</span>
              </p>
              <p className="text-gray-600">
                Lookback: <span className="font-medium">{status.lookback_minutes} minutes</span>
              </p>
              {status.last_error && (
                <p className="text-red-600 text-xs mt-2">
                  Error: {status.last_error.substring(0, 100)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Stuck Syncs Alert */}
      {stuckSyncs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">
                {stuckSyncs.length} Stuck Syncs Detected!
              </h3>
              <p className="text-red-800 text-sm mb-3">
                These syncs have been running for more than 10 minutes and are likely crashed or timed out.
                This prevents new syncs from starting.
              </p>
              <button
                onClick={fixStuckSyncs}
                disabled={fixing}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
              >
                {fixing ? 'Fixing...' : 'Fix Stuck Syncs Now'}
              </button>
              <div className="mt-4 space-y-2">
                {stuckSyncs.slice(0, 5).map((sync) => (
                  <div key={sync.id} className="text-sm text-red-800 bg-red-100 rounded p-2">
                    <span className="font-medium capitalize">{sync.entity_type}</span> -
                    Started {getTimeSince(sync.sync_started_at)} -
                    Still running
                  </div>
                ))}
                {stuckSyncs.length > 5 && (
                  <p className="text-sm text-red-700">
                    ...and {stuckSyncs.length - 5} more stuck syncs
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sync History */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Recent Sync History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentSyncs.map((sync) => (
                <tr key={sync.id}>
                  <td className="px-4 py-3 text-sm capitalize">{sync.entity_type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(sync.sync_started_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {sync.sync_completed_at ? new Date(sync.sync_completed_at).toLocaleString() : 'Still running'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {sync.duration_ms ? `${(sync.duration_ms / 1000).toFixed(1)}s` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">{sync.records_synced}</td>
                  <td className="px-4 py-3 text-sm">
                    {sync.status === 'running' ? (
                      <span className="flex items-center gap-1 text-yellow-600">
                        <Clock className="w-4 h-4" />
                        Running
                      </span>
                    ) : sync.status === 'failed' ? (
                      <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="w-4 h-4" />
                        Failed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        Completed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SyncHealthDashboard;
