import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle, PlayCircle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  onBack?: () => void;
}

export default function SyncDiagnostic({ onBack }: Props) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [loading, setLoading] = useState(true);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [fixing, setFixing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    runDiagnostic();
  }, []);

  const runDiagnostic = async () => {
    setLoading(true);
    setMessage('');
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Check sync status
      const { data: syncStatus } = await supabase
        .from('sync_status')
        .select('*')
        .order('entity_type');

      // Check recent sync logs
      const { data: recentLogs } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      // Check for stuck running syncs
      const { data: stuckSyncs } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('status', 'running')
        .lt('sync_started_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString());

      // Check recent invoices
      const { data: recentInvoices, count: invoiceCount } = await supabase
        .from('acumatica_invoices')
        .select('*', { count: 'exact', head: false })
        .gte('date', yesterday.toISOString().split('T')[0])
        .limit(5);

      // Check recent payments
      const { data: recentPayments, count: paymentCount } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: false })
        .gte('date', yesterday.toISOString().split('T')[0])
        .limit(5);

      // Check invoices from 2 days ago
      const { count: invoicesYesterday } = await supabase
        .from('acumatica_invoices')
        .select('*', { count: 'exact', head: true })
        .gte('date', yesterday.toISOString().split('T')[0])
        .lt('date', now.toISOString().split('T')[0]);

      const { count: invoicesTwoDaysAgo } = await supabase
        .from('acumatica_invoices')
        .select('*', { count: 'exact', head: true })
        .gte('date', twoDaysAgo.toISOString().split('T')[0])
        .lt('date', yesterday.toISOString().split('T')[0]);

      // Check payments from 2 days ago
      const { count: paymentsYesterday } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true })
        .gte('date', yesterday.toISOString().split('T')[0])
        .lt('date', now.toISOString().split('T')[0]);

      const { count: paymentsTwoDaysAgo } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true })
        .gte('date', twoDaysAgo.toISOString().split('T')[0])
        .lt('date', yesterday.toISOString().split('T')[0]);

      // Check cron job
      const { data: cronConfig } = await supabase.rpc('get_cron_jobs');

      setDiagnostic({
        syncStatus,
        recentLogs,
        stuckSyncs,
        recentInvoices,
        recentPayments,
        invoiceCount,
        paymentCount,
        invoicesYesterday,
        invoicesTwoDaysAgo,
        paymentsYesterday,
        paymentsTwoDaysAgo,
        cronConfig,
        timestamp: now.toISOString(),
      });
    } catch (err: any) {
      console.error('Diagnostic error:', err);
      setMessage(`Error running diagnostic: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fixStuckSyncs = async () => {
    setFixing(true);
    setMessage('');
    try {
      // Reset stuck sync logs
      const { error: logError } = await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          sync_completed_at: new Date().toISOString(),
          errors: ['Sync was stuck and automatically reset']
        })
        .eq('status', 'running')
        .lt('sync_started_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

      if (logError) throw logError;

      // Reset sync status
      const { error: statusError } = await supabase
        .from('sync_status')
        .update({
          status: 'idle',
          updated_at: new Date().toISOString()
        })
        .eq('status', 'running');

      if (statusError) throw statusError;

      setMessage('Successfully reset stuck syncs. You can now trigger a manual sync.');
      await runDiagnostic();
    } catch (err: any) {
      setMessage(`Error fixing syncs: ${err.message}`);
    } finally {
      setFixing(false);
    }
  };

  const triggerSync = async () => {
    setFixing(true);
    setMessage('Triggering manual sync...');

    try {
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
        setMessage(`Sync completed! Created: ${result.summary.totalCreated}, Updated: ${result.summary.totalUpdated}`);
        setTimeout(() => runDiagnostic(), 2000);
      } else {
        setMessage(`Sync failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setFixing(false);
    }
  };

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="flex items-center justify-center">
          <RefreshCw className="animate-spin text-blue-400 mr-3" size={24} />
          <span className="text-white">Running diagnostic...</span>
        </div>
      </div>
    );
  }

  const hasIssues =
    diagnostic?.stuckSyncs?.length > 0 ||
    diagnostic?.invoiceCount === 0 ||
    diagnostic?.paymentCount === 0 ||
    diagnostic?.syncStatus?.some((s: any) => s.status === 'failed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {hasIssues ? (
              <div className="p-3 bg-red-500/20 rounded-lg">
                <AlertTriangle className="text-red-400" size={32} />
              </div>
            ) : (
              <div className="p-3 bg-green-500/20 rounded-lg">
                <CheckCircle className="text-green-400" size={32} />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-white">Sync Diagnostic</h1>
              <p className="text-slate-400">
                {hasIssues ? 'Issues detected with sync' : 'Sync appears healthy'}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={runDiagnostic}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Re-run Diagnostic
            </button>
            {diagnostic?.stuckSyncs?.length > 0 && (
              <button
                onClick={fixStuckSyncs}
                disabled={fixing}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
                Fix Stuck Syncs
              </button>
            )}
            <button
              onClick={triggerSync}
              disabled={fixing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <PlayCircle className="w-5 h-5" />
              Trigger Sync Now
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('Error') || message.includes('failed')
              ? 'bg-red-900/20 border border-red-700 text-red-400'
              : 'bg-green-900/20 border border-green-700 text-green-400'
          }`}>
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Invoices</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Today</span>
                <span className={`font-bold ${diagnostic.invoiceCount === 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {diagnostic.invoiceCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Yesterday</span>
                <span className="text-white">{diagnostic.invoicesYesterday || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">2 Days Ago</span>
                <span className="text-white">{diagnostic.invoicesTwoDaysAgo || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Recent Payments</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Today</span>
                <span className={`font-bold ${diagnostic.paymentCount === 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {diagnostic.paymentCount || 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Yesterday</span>
                <span className="text-white">{diagnostic.paymentsYesterday || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">2 Days Ago</span>
                <span className="text-white">{diagnostic.paymentsTwoDaysAgo || 0}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Stuck Syncs</h3>
            {diagnostic.stuckSyncs?.length > 0 ? (
              <div className="space-y-2">
                {diagnostic.stuckSyncs.map((sync: any) => (
                  <div key={sync.id} className="text-red-400">
                    <div className="font-medium">{sync.entity_type}</div>
                    <div className="text-xs text-slate-400">
                      Started: {formatTime(sync.sync_started_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-green-400 flex items-center gap-2">
                <CheckCircle size={20} />
                No stuck syncs
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-semibold text-white mb-4">Sync Status</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-3 text-slate-400">Entity</th>
                  <th className="text-left p-3 text-slate-400">Status</th>
                  <th className="text-left p-3 text-slate-400">Enabled</th>
                  <th className="text-left p-3 text-slate-400">Last Sync</th>
                  <th className="text-left p-3 text-slate-400">Records</th>
                  <th className="text-left p-3 text-slate-400">Error</th>
                </tr>
              </thead>
              <tbody>
                {diagnostic.syncStatus?.map((status: any) => (
                  <tr key={status.id} className="border-b border-slate-700/50">
                    <td className="p-3 text-white capitalize font-medium">{status.entity_type}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                        status.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                        status.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                        status.status === 'running' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {status.status}
                      </span>
                    </td>
                    <td className="p-3">
                      {status.sync_enabled ? (
                        <CheckCircle className="text-green-400" size={20} />
                      ) : (
                        <XCircle className="text-red-400" size={20} />
                      )}
                    </td>
                    <td className="p-3 text-slate-400 text-sm">{formatTime(status.last_successful_sync)}</td>
                    <td className="p-3 text-white">{status.records_synced}</td>
                    <td className="p-3 text-red-400 text-xs max-w-xs truncate">
                      {status.last_error || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Recent Sync Logs</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-3 text-slate-400">Entity</th>
                  <th className="text-left p-3 text-slate-400">Status</th>
                  <th className="text-left p-3 text-slate-400">Started</th>
                  <th className="text-left p-3 text-slate-400">Completed</th>
                  <th className="text-right p-3 text-slate-400">Records</th>
                  <th className="text-right p-3 text-slate-400">Duration</th>
                </tr>
              </thead>
              <tbody>
                {diagnostic.recentLogs?.map((log: any) => (
                  <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="p-3 text-white capitalize">{log.entity_type}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                        log.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                        log.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                        'bg-blue-900/30 text-blue-400'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-xs">{formatTime(log.sync_started_at)}</td>
                    <td className="p-3 text-slate-400 text-xs">{formatTime(log.sync_completed_at)}</td>
                    <td className="p-3 text-right text-white">{log.records_synced || 0}</td>
                    <td className="p-3 text-right text-slate-400 text-xs">
                      {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(2)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
