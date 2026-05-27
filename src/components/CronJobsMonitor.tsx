import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Play, Pause, Timer } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
}

interface JobRun {
  runid: number;
  jobid: number;
  jobname: string;
  status: string;
  return_message: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
}

const JOB_DESCRIPTIONS: Record<string, string> = {
  'acumatica-auto-sync': 'Triggers the main Acumatica data sync (invoices, payments, customers) every 5 minutes',
  'auto-close-paid-tickets': 'Automatically closes collection tickets where all invoices have been paid',
  'auto-red-status-checker': 'Checks invoices past their red threshold and updates color status to red',
  'check-invoice-reminders-every-minute': 'Checks for invoice reminders that are due and triggers notifications',
  'cleanup-old-sync-logs': 'Cleans up sync log entries older than 30 days to prevent table bloat',
  'email-scheduler-job': 'Processes the email formula schedule queue and sends pending emails',
  'payment-sync-health-check-daily': 'Runs a daily health check comparing payment data between Acumatica and database',
  'process-auto-ticket-rules-daily': 'Evaluates auto-ticket rules and creates tickets for matching conditions',
  'reconcile-balanced-invoices-daily': 'Reconciles invoices that show zero balance with their actual payment status',
  'reconcile-invoice-statuses-daily': 'Full reconciliation of invoice statuses against Acumatica source data',
  'refresh-customer-stats': 'Refreshes the cached customer statistics and balance calculations',
  'refresh-invoice-analytics': 'Refreshes the cached invoice analytics aggregations (monthly/yearly)',
  'refresh-invoice-month-summary-hourly': 'Refreshes the invoice month summary materialized view',
  'refresh-payment-analytics-hourly': 'Refreshes the cached payment analytics data',
  'refresh-payment-month-summary': 'Refreshes the payment month summary materialized view',
  'send-reminder-emails-every-5-minutes': 'Sends email notifications for triggered reminders',
  'send-sync-report-evening': 'Sends the evening sync status report to configured recipients',
  'send-sync-report-morning': 'Sends the morning sync status report to configured recipients',
};

function parseSchedule(schedule: string): string {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, mon, dow] = parts;

  if (min === '*' && hour === '*') return 'Every minute';
  if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`;
  if (hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`;
  if (min === '0' && hour === '*') return 'Every hour (on the hour)';
  if (min !== '*' && hour === '*') return `Hourly at :${min.padStart(2, '0')}`;
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
  }
  return schedule;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'succeeded') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3" /> Succeeded
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      <AlertTriangle className="w-3 h-3" /> {status}
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
}

export default function CronJobsMonitor() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [filter, setFilter] = useState<'all' | 'failed' | 'succeeded'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [jobsRes, runsRes] = await Promise.all([
        supabase.rpc('get_cron_jobs'),
        supabase.rpc('get_cron_job_run_history', { p_limit: 100 })
      ]);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (runsRes.data) setRuns(runsRes.data);
    } catch (error) {
      console.error('Error loading cron data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobRuns = async (jobId: number) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
      return;
    }
    setExpandedJob(jobId);
    setLoadingRuns(true);
    try {
      const { data, error } = await supabase.rpc('get_cron_job_run_history', {
        p_job_id: jobId,
        p_limit: 50
      });
      if (!error && data) setJobRuns(data);
    } catch (error) {
      console.error('Error loading job runs:', error);
    } finally {
      setLoadingRuns(false);
    }
  };

  const getJobStats = (jobId: number) => {
    const jobSpecificRuns = runs.filter(r => r.jobid === jobId);
    const total = jobSpecificRuns.length;
    const failed = jobSpecificRuns.filter(r => r.status === 'failed').length;
    const lastRun = jobSpecificRuns[0];
    return { total, failed, lastRun };
  };

  const filteredRuns = filter === 'all' ? runs : runs.filter(r => r.status === filter);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Timer className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Cron Jobs Monitor</h1>
              <p className="text-sm text-gray-500">{jobs.length} registered jobs</p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Job Cards */}
        <div className="space-y-3 mb-8">
          {jobs.map(job => {
            const stats = getJobStats(job.jobid);
            const isExpanded = expandedJob === job.jobid;
            return (
              <div key={job.jobid} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => loadJobRuns(job.jobid)}
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-1.5 rounded ${job.active ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {job.active ? <Play className="w-4 h-4 text-green-600" /> : <Pause className="w-4 h-4 text-gray-400" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 truncate">{job.jobname}</h3>
                          {stats.failed > 0 && (
                            <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              {stats.failed} failed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {JOB_DESCRIPTIONS[job.jobname] || 'No description available'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          {parseSchedule(job.schedule)}
                        </div>
                        {stats.lastRun && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            Last: {formatTime(stats.lastRun.start_time)}
                          </div>
                        )}
                      </div>
                      {stats.lastRun && <StatusBadge status={stats.lastRun.status} />}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <div className="mb-3">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Command</span>
                      <pre className="mt-1 text-xs bg-gray-800 text-green-300 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {job.command.trim()}
                      </pre>
                    </div>

                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Run History (last 50)</span>
                    </div>

                    {loadingRuns ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      </div>
                    ) : jobRuns.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">No run history available</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-100 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Start Time</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Duration</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Return Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {jobRuns.map(run => (
                              <tr key={run.runid} className={run.status === 'failed' ? 'bg-red-50' : ''}>
                                <td className="px-3 py-2">
                                  <StatusBadge status={run.status} />
                                </td>
                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                  {formatTime(run.start_time)}
                                </td>
                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                  {formatDuration(run.duration_ms)}
                                </td>
                                <td className="px-3 py-2 text-gray-600 max-w-md">
                                  <div className="truncate" title={run.return_message || ''}>
                                    {run.return_message || '-'}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Global Run Log */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Runs (All Jobs)</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                All ({runs.length})
              </button>
              <button
                onClick={() => setFilter('succeeded')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === 'succeeded' ? 'bg-green-700 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
              >
                Succeeded ({runs.filter(r => r.status === 'succeeded').length})
              </button>
              <button
                onClick={() => setFilter('failed')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === 'failed' ? 'bg-red-700 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
              >
                Failed ({runs.filter(r => r.status === 'failed').length})
              </button>
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Job</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Started</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Duration</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRuns.map(run => (
                  <tr key={run.runid} className={`${run.status === 'failed' ? 'bg-red-50' : 'hover:bg-gray-50'} transition-colors`}>
                    <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap text-xs">
                      {run.jobname}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-xs">
                      {formatTime(run.start_time)}
                    </td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap text-xs">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs max-w-xs">
                      <div className="truncate" title={run.return_message || ''}>
                        {run.return_message || '-'}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRuns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No runs found with the current filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
