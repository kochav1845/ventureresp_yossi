import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, RefreshCw, Clock, CheckCircle, XCircle, Activity, PlayCircle, AlertTriangle } from 'lucide-react';
import { formatDate as formatDateUtil, formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface CronLog {
  id: string;
  job_name: string;
  executed_at: string;
  status: 'success' | 'failed';
  response_data: any;
  error_message: string | null;
  execution_time_ms: number;
}

interface Props {
  onBack?: () => void;
}

export default function CronMonitor({ onBack }: Props) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastRun, setLastRun] = useState<CronLog | null>(null);
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0 });

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cron_job_logs')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setLogs(data || []);

      if (data && data.length > 0) {
        setLastRun(data[0]);

        const total = data.length;
        const success = data.filter(log => log.status === 'success').length;
        const failed = data.filter(log => log.status === 'failed').length;
        setStats({ total, success, failed });
      }
    } catch (error) {
      console.error('Error loading cron logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerManually = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.rpc('trigger_email_scheduler_manually');

      if (error) throw error;

      setTimeout(() => {
        loadLogs();
      }, 2000);
    } catch (error) {
      console.error('Error triggering scheduler:', error);
      alert('Failed to trigger scheduler. Check console for details.');
    } finally {
      setTriggering(false);
    }
  };


  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
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
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-2 rounded-lg">
                  <Activity size={24} className="text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Email Scheduler Monitor</h1>
                  <p className="text-sm text-slate-400">Real-time cron job monitoring</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={triggerManually}
                disabled={triggering}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors"
              >
                <PlayCircle size={18} className={triggering ? 'animate-spin' : ''} />
                {triggering ? 'Triggering...' : 'Run Now'}
              </button>
              <button
                onClick={loadLogs}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-lg">
                <Activity className="text-blue-400" size={24} />
              </div>
              <div>
                <p className="text-slate-400 text-sm">Total Executions</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <CheckCircle className="text-green-400" size={24} />
              </div>
              <div>
                <p className="text-slate-400 text-sm">Successful</p>
                <p className="text-2xl font-bold text-white">{stats.success}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/20 rounded-lg">
                <XCircle className="text-red-400" size={24} />
              </div>
              <div>
                <p className="text-slate-400 text-sm">Failed</p>
                <p className="text-2xl font-bold text-white">{stats.failed}</p>
              </div>
            </div>
          </div>
        </div>

        {lastRun && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700 p-6 mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="text-blue-400" size={20} />
              Last Execution
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-slate-400 text-sm mb-1">Status</p>
                <div className="flex items-center gap-2">
                  {lastRun.status === 'success' ? (
                    <CheckCircle className="text-green-400" size={20} />
                  ) : (
                    <XCircle className="text-red-400" size={20} />
                  )}
                  <span className={`font-medium ${lastRun.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {lastRun.status === 'success' ? 'Success' : 'Failed'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">Executed At</p>
                <p className="text-white font-medium">{formatDateTimeUtil(lastRun.executed_at)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">Execution Time</p>
                <p className="text-white font-medium">{formatExecutionTime(lastRun.execution_time_ms)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">Emails Processed</p>
                <p className="text-white font-medium">
                  {lastRun.response_data?.emailsProcessed || 0}
                </p>
              </div>
            </div>
            {lastRun.status === 'success' && lastRun.response_data && (
              <div className="mt-4 p-4 bg-slate-700/30 rounded-lg">
                <p className="text-slate-300 text-sm">
                  {lastRun.response_data.message || 'No message available'}
                </p>
                {lastRun.response_data.testMode && (
                  <div className="mt-2 flex items-center gap-2 text-amber-400">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-medium">Running in TEST MODE (no emails actually sent)</span>
                  </div>
                )}
              </div>
            )}
            {lastRun.error_message && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-300 text-sm font-mono">{lastRun.error_message}</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700">
          <div className="p-6 border-b border-slate-700">
            <h2 className="text-xl font-semibold text-white">Execution History</h2>
            <p className="text-slate-400 text-sm mt-1">Last 50 executions</p>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
                <p className="text-slate-400">Loading logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="text-slate-600 mx-auto mb-4" size={48} />
                <p className="text-slate-400">No execution logs found</p>
                <p className="text-slate-500 text-sm mt-2">The scheduler will run every minute automatically</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Status</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Executed At</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Time</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Processed</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Sent</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Failed</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {log.status === 'success' ? (
                              <CheckCircle className="text-green-400" size={18} />
                            ) : (
                              <XCircle className="text-red-400" size={18} />
                            )}
                            <span className={`text-sm font-medium ${log.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                              {log.status === 'success' ? 'Success' : 'Failed'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-slate-300 text-sm">{formatDateTimeUtil(log.executed_at)}</td>
                        <td className="py-4 px-4 text-slate-300 text-sm">{formatExecutionTime(log.execution_time_ms)}</td>
                        <td className="py-4 px-4 text-slate-300 text-sm">
                          {log.response_data?.emailsProcessed || 0}
                        </td>
                        <td className="py-4 px-4 text-green-400 text-sm font-medium">
                          {log.response_data?.emailsSent || 0}
                        </td>
                        <td className="py-4 px-4 text-red-400 text-sm font-medium">
                          {log.response_data?.emailsFailed || 0}
                        </td>
                        <td className="py-4 px-4">
                          {log.error_message ? (
                            <span className="text-red-300 text-sm font-mono truncate max-w-xs block">
                              {log.error_message}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-sm">
                              {log.response_data?.message || '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
