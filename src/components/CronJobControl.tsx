import { useState, useEffect } from 'react';
import { Power, PowerOff, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  database: string;
}

export default function CronJobControl() {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadCronJobs();
    const interval = setInterval(loadCronJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadCronJobs = async () => {
    try {
      const { data, error } = await supabase.rpc('get_cron_jobs');

      if (error) throw error;

      if (data) {
        setCronJobs(data);
      }
    } catch (err: any) {
      console.error('Error loading cron jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCronJob = async (jobid: number, currentActive: boolean) => {
    setToggling(jobid);
    setMessage('');

    try {
      const { error } = await supabase.rpc('toggle_cron_job', {
        job_id: jobid,
        new_active: !currentActive
      });

      if (error) throw error;

      setMessage(`Cron job ${!currentActive ? 'enabled' : 'disabled'} successfully`);
      await loadCronJobs();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setToggling(null);
    }
  };

  const getScheduleDescription = (schedule: string) => {
    if (schedule === '* * * * *') return 'Every minute';
    if (schedule === '*/5 * * * *') return 'Every 5 minutes';
    if (schedule === '*/15 * * * *') return 'Every 15 minutes';
    if (schedule === '0 * * * *') return 'Hourly';
    return schedule;
  };

  const getJobDescription = (jobname: string) => {
    switch (jobname) {
      case 'acumatica-auto-sync':
        return 'Syncs invoices, payments, and customers from Acumatica';
      case 'auto-red-status-checker':
        return 'Automatically marks overdue invoices as red status';
      case 'check-invoice-reminders-every-minute':
        return 'Checks for due reminders and triggers notifications';
      case 'email-scheduler-job':
        return 'Processes scheduled email formulas';
      case 'send-reminder-emails-every-5-minutes':
        return 'Sends reminder notification emails';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading cron jobs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Scheduled Tasks (Cron Jobs)</h2>
          <p className="text-sm text-gray-600 mt-1">Control automated background tasks</p>
        </div>
        <button
          onClick={loadCronJobs}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.includes('Error')
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          <div className="flex items-start">
            {message.includes('Error') ? (
              <XCircle className="h-5 w-5 mr-2 mt-0.5" />
            ) : (
              <CheckCircle className="h-5 w-5 mr-2 mt-0.5" />
            )}
            <span>{message}</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {cronJobs.map((job) => (
          <div
            key={job.jobid}
            className={`border rounded-lg p-4 transition-colors ${
              job.active
                ? 'border-green-200 bg-green-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
                    job.active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {job.active ? (
                      <>
                        <Power className="h-3 w-3" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <PowerOff className="h-3 w-3" />
                        Disabled
                      </>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900">{job.jobname}</h3>
                </div>

                <p className="text-sm text-gray-600 mb-2">{getJobDescription(job.jobname)}</p>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{getScheduleDescription(job.schedule)}</span>
                  </div>
                  <div>
                    <span className="font-mono">{job.schedule}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleCronJob(job.jobid, job.active)}
                disabled={toggling === job.jobid}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  job.active
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {toggling === job.jobid ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : job.active ? (
                  <>
                    <PowerOff className="h-4 w-4" />
                    <span>Disable</span>
                  </>
                ) : (
                  <>
                    <Power className="h-4 w-4" />
                    <span>Enable</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {cronJobs.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p>No cron jobs found</p>
        </div>
      )}
    </div>
  );
}
