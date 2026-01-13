import { useState, useRef } from 'react';
import { ArrowLeft, Play, Pause, RotateCcw, CheckCircle, AlertCircle, Loader2, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResyncResult {
  success: boolean;
  message?: string;
  processed?: number;
  totalApplications?: number;
  breakdown?: {
    invoices: number;
    creditMemos: number;
    other: number;
  };
  totalPayments?: number;
  remaining?: number;
  nextSkip?: number;
  complete?: boolean;
  durationMs?: number;
  errors?: string[];
  error?: string;
}

interface BatchLog {
  batch: number;
  skip: number;
  processed: number;
  applications: number;
  duration: number;
  timestamp: Date;
}

export default function PaymentApplicationResync({ onBack }: { onBack: () => void }) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSkip, setCurrentSkip] = useState(0);
  const [batchSize, setBatchSize] = useState(50);
  const [clearFirst, setClearFirst] = useState(true);
  const [progress, setProgress] = useState<ResyncResult | null>(null);
  const [batchLogs, setBatchLogs] = useState<BatchLog[]>([]);
  const [totalStats, setTotalStats] = useState({
    processed: 0,
    applications: 0,
    invoices: 0,
    creditMemos: 0,
    other: 0,
    errors: 0
  });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const batchCountRef = useRef(0);

  const runBatch = async (skip: number, shouldClear: boolean): Promise<ResyncResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resync-all-payment-applications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          batchSize,
          skip,
          clearFirst: shouldClear && skip === 0
        })
      }
    );

    return response.json();
  };

  const startResync = async () => {
    setIsRunning(true);
    setIsPaused(false);
    setError(null);
    abortRef.current = false;
    batchCountRef.current = 0;

    if (currentSkip === 0) {
      setBatchLogs([]);
      setTotalStats({
        processed: 0,
        applications: 0,
        invoices: 0,
        creditMemos: 0,
        other: 0,
        errors: 0
      });
    }

    let skip = currentSkip;
    let isFirstBatch = skip === 0;

    try {
      while (!abortRef.current) {
        batchCountRef.current++;
        const result = await runBatch(skip, isFirstBatch && clearFirst);
        isFirstBatch = false;

        if (!result.success) {
          setError(result.error || 'Unknown error');
          break;
        }

        setProgress(result);
        setCurrentSkip(result.nextSkip || skip + batchSize);

        const log: BatchLog = {
          batch: batchCountRef.current,
          skip,
          processed: result.processed || 0,
          applications: result.totalApplications || 0,
          duration: result.durationMs || 0,
          timestamp: new Date()
        };
        setBatchLogs(prev => [...prev, log]);

        setTotalStats(prev => ({
          processed: prev.processed + (result.processed || 0),
          applications: prev.applications + (result.totalApplications || 0),
          invoices: prev.invoices + (result.breakdown?.invoices || 0),
          creditMemos: prev.creditMemos + (result.breakdown?.creditMemos || 0),
          other: prev.other + (result.breakdown?.other || 0),
          errors: prev.errors + (result.errors?.length || 0)
        }));

        if (result.complete) {
          break;
        }

        skip = result.nextSkip || skip + batchSize;

        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const pauseResync = () => {
    abortRef.current = true;
    setIsPaused(true);
  };

  const resetResync = () => {
    abortRef.current = true;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentSkip(0);
    setProgress(null);
    setBatchLogs([]);
    setTotalStats({
      processed: 0,
      applications: 0,
      invoices: 0,
      creditMemos: 0,
      other: 0,
      errors: 0
    });
    setError(null);
  };

  const progressPercent = progress?.totalPayments
    ? Math.round(((progress.totalPayments - (progress.remaining || 0)) / progress.totalPayments) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Re-sync Payment Applications</h1>
            <p className="text-sm text-gray-500">Re-fetch all ApplicationHistory data from Acumatica</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">What this does:</p>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                <li>Fetches ApplicationHistory for each payment from Acumatica</li>
                <li>Includes ALL doc types (invoices, credit memos, reversals)</li>
                <li>Preserves exact signed amounts from Acumatica</li>
                <li>Stores doc_type field for each application</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Configuration</h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Batch Size
              </label>
              <input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value) || 50))}
                disabled={isRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                min={1}
                max={100}
              />
              <p className="text-xs text-gray-500 mt-1">Payments per batch (1-100)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Starting Offset
              </label>
              <input
                type="number"
                value={currentSkip}
                onChange={(e) => setCurrentSkip(Math.max(0, parseInt(e.target.value) || 0))}
                disabled={isRunning}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                min={0}
              />
              <p className="text-xs text-gray-500 mt-1">Skip first N payments</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={clearFirst}
                onChange={(e) => setClearFirst(e.target.checked)}
                disabled={isRunning || currentSkip > 0}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Clear existing applications before syncing</span>
            </label>
            <p className="text-xs text-gray-500 ml-6 mt-1">Recommended for a clean re-sync</p>
          </div>

          <div className="flex gap-3">
            {!isRunning ? (
              <button
                onClick={startResync}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Play className="w-4 h-4" />
                {isPaused ? 'Resume' : 'Start Re-sync'}
              </button>
            ) : (
              <button
                onClick={pauseResync}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}

            <button
              onClick={resetResync}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>

        {(isRunning || progress) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              {isRunning && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
              {progress?.complete && <CheckCircle className="w-5 h-5 text-green-600" />}
              Progress
            </h2>

            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  {progress?.totalPayments
                    ? `${(progress.totalPayments - (progress.remaining || 0)).toLocaleString()} of ${progress.totalPayments.toLocaleString()} payments`
                    : 'Starting...'}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    progress?.complete ? 'bg-green-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-gray-900">
                  {totalStats.processed.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Payments Processed</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-600">
                  {totalStats.applications.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Applications Found</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">
                  {totalStats.invoices.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Invoices</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-600">
                  {totalStats.creditMemos.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Credit Memos</div>
              </div>
            </div>

            {totalStats.other > 0 && (
              <div className="mt-3 text-sm text-gray-600">
                Other doc types: {totalStats.other.toLocaleString()}
              </div>
            )}

            {totalStats.errors > 0 && (
              <div className="mt-3 text-sm text-amber-600">
                Errors encountered: {totalStats.errors}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {batchLogs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-gray-400" />
              Batch Log
            </h2>

            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600">Batch</th>
                    <th className="px-3 py-2 text-left text-gray-600">Offset</th>
                    <th className="px-3 py-2 text-left text-gray-600">Processed</th>
                    <th className="px-3 py-2 text-left text-gray-600">Applications</th>
                    <th className="px-3 py-2 text-left text-gray-600">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batchLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">#{log.batch}</td>
                      <td className="px-3 py-2 text-gray-600">{log.skip}</td>
                      <td className="px-3 py-2 text-gray-600">{log.processed}</td>
                      <td className="px-3 py-2 text-blue-600 font-medium">{log.applications}</td>
                      <td className="px-3 py-2 text-gray-500">{(log.duration / 1000).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {progress?.complete && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">Re-sync Complete</p>
                <p className="text-sm text-green-700 mt-1">
                  Successfully processed {totalStats.processed.toLocaleString()} payments and found {totalStats.applications.toLocaleString()} applications.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
