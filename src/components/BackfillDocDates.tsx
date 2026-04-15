import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, PlayCircle, Loader2, CheckCircle, XCircle, Calendar, StopCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface JobProgress {
  updated: number;
  failed: number;
  processed: number;
  total: number;
  errors: string[];
}

interface Job {
  id: string;
  status: string;
  progress: JobProgress | null;
  error_message: string | null;
  completed_at: string | null;
}

export default function BackfillDocDates() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2025-12-31');
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkMissingCount = useCallback(async () => {
    setLoadingCount(true);
    const { count } = await supabase
      .from('acumatica_payments')
      .select('*', { count: 'exact', head: true })
      .is('doc_date', null)
      .gte('application_date', `${startDate}T00:00:00`)
      .lte('application_date', `${endDate}T23:59:59`);
    setMissingCount(count ?? 0);
    setLoadingCount(false);
  }, [startDate, endDate]);

  useEffect(() => {
    checkMissingCount();
  }, [checkMissingCount]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const pollJob = useCallback(async (id: string) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-payment-doc-dates`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ jobId: id, pollStatus: true }),
    });
    const data = await resp.json();
    if (data.job) {
      setJob(data.job);
      if (data.job.status === 'completed' || data.job.status === 'failed') {
        setIsRunning(false);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        checkMissingCount();
      }
    }
  }, [checkMissingCount]);

  const startBackfill = async () => {
    setIsRunning(true);
    setJob(null);

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-payment-doc-dates`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ startDate, endDate }),
    });

    const data = await resp.json();

    if (data.jobId) {
      setJobId(data.jobId);
      pollRef.current = setInterval(() => pollJob(data.jobId), 3000);
    } else if (data.message) {
      setIsRunning(false);
      setJob({ id: '', status: 'completed', progress: { updated: 0, failed: 0, processed: 0, total: 0, errors: [] }, error_message: null, completed_at: new Date().toISOString() });
    } else {
      setIsRunning(false);
    }
  };

  const cancelJob = async () => {
    if (!jobId) return;
    await supabase
      .from('async_sync_jobs')
      .update({ status: 'failed', error_message: 'Cancelled by user', completed_at: new Date().toISOString() })
      .eq('id', jobId);
    setIsRunning(false);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const progress = job?.progress;
  const pct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-6 py-5">
            <div className="flex items-center gap-3">
              <Calendar className="w-7 h-7 text-white" />
              <div>
                <h1 className="text-2xl font-bold text-white">Backfill Payment Doc Dates</h1>
                <p className="text-amber-100 text-sm mt-1">
                  Re-fetch doc_date from Acumatica for payments missing this field
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 text-sm">
                This will query each payment individually from Acumatica to retrieve the document creation date (DocDate).
                Payments are categorized by DocDate for accurate analytics instead of the application date.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
              <div>
                <p className="text-sm text-gray-600">Payments missing doc_date in range</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loadingCount ? (
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  ) : (
                    missingCount?.toLocaleString() ?? '...'
                  )}
                </p>
              </div>
              <button
                onClick={checkMissingCount}
                disabled={loadingCount}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                Refresh count
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={startBackfill}
                disabled={isRunning || missingCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                {isRunning ? 'Running...' : 'Start Backfill'}
              </button>
              {isRunning && (
                <button
                  onClick={cancelJob}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                >
                  <StopCircle className="w-4 h-4" />
                  Cancel
                </button>
              )}
            </div>

            {job && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {job.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : job.status === 'failed' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                  )}
                  <span className="font-medium text-gray-900 capitalize">{job.status}</span>
                  {job.error_message && (
                    <span className="text-sm text-red-600 ml-2">{job.error_message}</span>
                  )}
                </div>

                {progress && progress.total > 0 && (
                  <>
                    <div>
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()} processed</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-amber-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-700">{progress.updated.toLocaleString()}</p>
                        <p className="text-xs text-green-600">Updated</p>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-700">{progress.failed.toLocaleString()}</p>
                        <p className="text-xs text-red-600">Failed</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-blue-700">{(progress.total - progress.processed).toLocaleString()}</p>
                        <p className="text-xs text-blue-600">Remaining</p>
                      </div>
                    </div>

                    {progress.errors && progress.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-red-800 mb-2">Recent Errors</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {progress.errors.map((err, i) => (
                            <p key={i} className="text-xs text-red-700 font-mono">{err}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
