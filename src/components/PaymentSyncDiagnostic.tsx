import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, AlertTriangle, Play, Database, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DiagnosticResult {
  check: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

export default function PaymentSyncDiagnostic({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [fixing, setFixing] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    setLoading(true);
    const results: DiagnosticResult[] = [];

    try {
      // Check 1: Verify sync_status table exists and has payment entries
      const { data: syncStatus, error: syncError } = await supabase
        .from('sync_status')
        .select('*')
        .eq('entity_type', 'payment')
        .maybeSingle();

      if (syncError) {
        results.push({
          check: 'Sync Status Table',
          status: 'error',
          message: 'Failed to query sync_status table',
          details: syncError.message
        });
      } else if (!syncStatus) {
        results.push({
          check: 'Payment Sync Entry',
          status: 'error',
          message: 'No sync_status entry found for payments',
          details: 'Need to create entry in sync_status table'
        });
      } else {
        results.push({
          check: 'Payment Sync Entry',
          status: 'success',
          message: `Found payment sync entry (${syncStatus.sync_enabled ? 'enabled' : 'disabled'})`,
          details: syncStatus
        });
      }

      // Check 2: Verify acumatica_sync_credentials table has active credentials
      const { data: credentials, error: credError } = await supabase
        .from('acumatica_sync_credentials')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      if (credError) {
        results.push({
          check: 'Acumatica Credentials',
          status: 'error',
          message: 'Failed to query credentials',
          details: credError.message
        });
      } else if (!credentials) {
        results.push({
          check: 'Acumatica Credentials',
          status: 'error',
          message: 'No active credentials found',
          details: 'Need to set up credentials in Sync Configuration'
        });
      } else {
        const hasAllFields = credentials.supabase_url && credentials.supabase_anon_key &&
                            credentials.acumatica_url && credentials.username && credentials.password;
        results.push({
          check: 'Acumatica Credentials',
          status: hasAllFields ? 'success' : 'warning',
          message: hasAllFields ? 'All credentials configured' : 'Missing some credential fields',
          details: {
            has_supabase_url: !!credentials.supabase_url,
            has_anon_key: !!credentials.supabase_anon_key,
            has_acumatica_url: !!credentials.acumatica_url,
            has_username: !!credentials.username,
            has_password: !!credentials.password
          }
        });
      }

      // Check 3: Check if cron job exists
      const { data: cronJobs, error: cronError } = await supabase
        .rpc('get_cron_jobs')
        .then(res => res)
        .catch(() => ({ data: null, error: { message: 'Function not available' } }));

      if (cronError && cronError.message !== 'Function not available') {
        results.push({
          check: 'Cron Job',
          status: 'warning',
          message: 'Could not check cron job status',
          details: cronError.message
        });
      } else if (cronJobs && Array.isArray(cronJobs)) {
        const syncJob = cronJobs.find((job: any) => job.jobname === 'acumatica-auto-sync');
        if (syncJob) {
          results.push({
            check: 'Cron Job',
            status: 'success',
            message: 'Sync cron job is scheduled',
            details: syncJob
          });
        } else {
          results.push({
            check: 'Cron Job',
            status: 'error',
            message: 'Sync cron job not found',
            details: 'The acumatica-auto-sync cron job is not scheduled'
          });
        }
      }

      // Check 4: Check recent sync activity
      const { data: recentSyncs, error: syncLogError } = await supabase
        .from('sync_change_logs')
        .select('*')
        .eq('sync_type', 'payment')
        .order('created_at', { ascending: false })
        .limit(5);

      if (syncLogError) {
        results.push({
          check: 'Recent Sync Activity',
          status: 'warning',
          message: 'Could not check recent sync logs',
          details: syncLogError.message
        });
      } else if (!recentSyncs || recentSyncs.length === 0) {
        results.push({
          check: 'Recent Sync Activity',
          status: 'warning',
          message: 'No recent payment sync activity found',
          details: 'Sync may not have run yet'
        });
      } else {
        const lastSync = recentSyncs[0];
        const timeSince = new Date().getTime() - new Date(lastSync.created_at).getTime();
        const minutesSince = Math.floor(timeSince / 60000);
        results.push({
          check: 'Recent Sync Activity',
          status: minutesSince < 10 ? 'success' : 'warning',
          message: `Last sync ${minutesSince} minutes ago`,
          details: lastSync
        });
      }

      // Check 5: Check scheduler_logs for errors
      const { data: schedulerLogs, error: schedulerError } = await supabase
        .from('scheduler_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!schedulerError && schedulerLogs && schedulerLogs.length > 0) {
        const errors = schedulerLogs.filter(log => log.status === 'error' || log.error_message);
        if (errors.length > 0) {
          results.push({
            check: 'Scheduler Errors',
            status: 'warning',
            message: `Found ${errors.length} recent errors`,
            details: errors
          });
        } else {
          results.push({
            check: 'Scheduler Errors',
            status: 'success',
            message: 'No recent scheduler errors',
            details: null
          });
        }
      }

    } catch (error: any) {
      results.push({
        check: 'General',
        status: 'error',
        message: 'Diagnostic failed',
        details: error.message
      });
    }

    setDiagnostics(results);
    setLoading(false);
  };

  const autoFixIssues = async () => {
    setFixing(true);
    try {
      // Fix 1: Ensure payment sync entry exists and is enabled
      const { data: existing } = await supabase
        .from('sync_status')
        .select('*')
        .eq('entity_type', 'payments')
        .maybeSingle();

      if (!existing) {
        await supabase.from('sync_status').insert({
          entity_type: 'payments',
          sync_enabled: true,
          sync_interval_minutes: 5,
          lookback_minutes: 60,
          status: 'idle'
        });
      } else if (!existing.sync_enabled) {
        await supabase
          .from('sync_status')
          .update({ sync_enabled: true })
          .eq('entity_type', 'payments');
      }

      alert('Auto-fix completed! Re-running diagnostics...');
      await runDiagnostics();
    } catch (error: any) {
      alert('Auto-fix failed: ' + error.message);
    } finally {
      setFixing(false);
    }
  };

  const triggerManualSync = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('acumatica-payment-incremental-sync');

      if (error) {
        alert('Manual sync failed: ' + error.message);
      } else {
        alert('Manual sync triggered successfully! Check the sync logs.');
        await runDiagnostics();
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const hasErrors = diagnostics.some(d => d.status === 'error');
  const hasWarnings = diagnostics.some(d => d.status === 'warning');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Database className="w-8 h-8" />
                Payment Sync Diagnostic
              </h1>
              <p className="text-gray-600 mt-2">
                Check and fix payment synchronization issues
              </p>
            </div>
            <button
              onClick={runDiagnostics}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Re-run Diagnostics
            </button>
          </div>
        </div>

        {!loading && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold mb-2">Overall Status</h2>
                <p className="text-gray-600">
                  {hasErrors && 'Critical issues found that need attention'}
                  {!hasErrors && hasWarnings && 'Some warnings detected'}
                  {!hasErrors && !hasWarnings && 'All checks passed successfully'}
                </p>
              </div>
              <div className="flex gap-3">
                {(hasErrors || hasWarnings) && (
                  <button
                    onClick={autoFixIssues}
                    disabled={fixing}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <Settings className={`w-5 h-5 ${fixing ? 'animate-spin' : ''}`} />
                    Auto-Fix Issues
                  </button>
                )}
                <button
                  onClick={triggerManualSync}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  <Play className={`w-5 h-5 ${testing ? 'animate-spin' : ''}`} />
                  Test Manual Sync
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Running diagnostics...</p>
            </div>
          ) : (
            diagnostics.map((diagnostic, index) => (
              <div
                key={index}
                className={`border rounded-lg p-6 ${getStatusColor(diagnostic.status)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(diagnostic.status)}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {diagnostic.check}
                      </h3>
                      <p className="text-gray-700 mb-2">{diagnostic.message}</p>
                      {diagnostic.details && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                            View Details
                          </summary>
                          <pre className="mt-2 p-3 bg-white rounded text-xs overflow-auto max-h-48">
                            {JSON.stringify(diagnostic.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Quick Fixes</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• Make sure Acumatica credentials are configured in Sync Configuration</li>
            <li>• Ensure the payment sync is enabled in sync_status table</li>
            <li>• Check that the cron job is scheduled (every 5 minutes)</li>
            <li>• Verify Supabase URL and Anon Key are set in credentials</li>
            <li>• Try triggering a manual sync to test the connection</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
