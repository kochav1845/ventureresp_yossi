import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SyncProgress {
  sync_id: string;
  operation_type: string;
  total_items: number;
  processed_items: number;
  current_item: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  last_updated_at: string;
  error_message: string | null;
  metadata: any;
}

export default function LiveSyncMonitor() {
  const navigate = useNavigate();
  const [activeSyncs, setActiveSyncs] = useState<SyncProgress[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<SyncProgress[]>([]);

  useEffect(() => {
    const fetchProgress = async () => {
      const { data: active } = await supabase
        .from('sync_progress')
        .select('*')
        .eq('status', 'running')
        .order('started_at', { ascending: false });

      const { data: completed } = await supabase
        .from('sync_progress')
        .select('*')
        .in('status', ['completed', 'failed'])
        .gte('completed_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .order('completed_at', { ascending: false })
        .limit(10);

      setActiveSyncs(active || []);
      setRecentCompleted(completed || []);
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (start: string, end?: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const seconds = Math.floor((endTime - startTime) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Live Sync Monitor</h1>
          <p className="text-gray-600 mt-2">Real-time monitoring of all sync operations</p>
        </div>

        {activeSyncs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <RefreshCw className="w-5 h-5 mr-2 animate-spin text-blue-600" />
              Active Syncs ({activeSyncs.length})
            </h2>
            <div className="space-y-4">
              {activeSyncs.map((sync) => (
                <div key={sync.sync_id} className="bg-white border border-blue-200 rounded-lg p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{sync.operation_type}</h3>
                      <p className="text-sm text-gray-500">Started {formatDuration(sync.started_at)} ago</p>
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                      Running
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">
                        Progress: {sync.processed_items} / {sync.total_items} items
                      </span>
                      <span className="text-gray-500">
                        {Math.round((sync.processed_items / sync.total_items) * 100)}%
                      </span>
                    </div>

                    <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all duration-300"
                        style={{ width: `${(sync.processed_items / sync.total_items) * 100}%` }}
                      />
                    </div>

                    {sync.current_item && (
                      <p className="text-sm text-gray-600 font-mono mt-2">
                        Currently processing: <span className="font-semibold text-blue-600">{sync.current_item}</span>
                      </p>
                    )}

                    {sync.metadata && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500">
                          {sync.metadata.startDate && sync.metadata.endDate && (
                            <>Date Range: {sync.metadata.startDate} to {sync.metadata.endDate}</>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSyncs.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center mb-8">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No active syncs running</p>
          </div>
        )}

        {recentCompleted.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Recent Completions (Last 5 minutes)
            </h2>
            <div className="space-y-3">
              {recentCompleted.map((sync) => (
                <div
                  key={sync.sync_id}
                  className={`border rounded-lg p-4 ${
                    sync.status === 'completed'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {sync.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 mr-3" />
                      )}
                      <div>
                        <h3 className="font-medium text-gray-900">{sync.operation_type}</h3>
                        <p className="text-sm text-gray-600">
                          {sync.processed_items} / {sync.total_items} items
                          {sync.completed_at && ` in ${formatDuration(sync.started_at, sync.completed_at)}`}
                        </p>
                        {sync.error_message && (
                          <p className="text-sm text-red-600 mt-1">{sync.error_message}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        sync.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {sync.status === 'completed' ? 'Completed' : 'Failed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
