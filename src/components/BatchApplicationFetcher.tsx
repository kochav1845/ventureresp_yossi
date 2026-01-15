import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RefreshCw, CheckCircle, AlertCircle, Clock, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BatchApplicationFetcherProps {
  onBack?: () => void;
}

interface Payment {
  id: string;
  reference_number: string;
  type: string;
  customer_id: string;
  payment_amount: number;
}

interface BatchStats {
  totalPayments: number;
  processedPayments: number;
  successfulFetches: number;
  failedFetches: number;
  currentBatch: number;
  totalBatches: number;
  currentMilestone: number;
  milestonesCompleted: number;
}

interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'milestone';
}

export default function BatchApplicationFetcher({ onBack }: BatchApplicationFetcherProps) {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startFromIndex, setStartFromIndex] = useState(0);
  const [endAtIndex, setEndAtIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<BatchStats>({
    totalPayments: 0,
    processedPayments: 0,
    successfulFetches: 0,
    failedFetches: 0,
    currentBatch: 0,
    totalBatches: 0,
    currentMilestone: 0,
    milestonesCompleted: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [shouldStop, setShouldStop] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const BATCH_SIZE = 10;
  const MILESTONE_SIZE = 5000;
  const BATCH_DELAY = 500;
  const REQUEST_DELAY = 100;

  useEffect(() => {
    loadPayments();
  }, []);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  const loadPayments = async () => {
    setLoading(true);
    try {
      addLog('Loading ALL payments from database...', 'info');

      let allPayments: Payment[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('acumatica_payments')
          .select('id, reference_number, type, customer_id, payment_amount')
          .order('reference_number', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allPayments = [...allPayments, ...data];
          addLog(`Loaded ${data.length} payments (page ${page + 1}, total so far: ${allPayments.length})`, 'info');
          page++;

          if (data.length < pageSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      setPayments(allPayments);
      const totalBatches = Math.ceil(allPayments.length / BATCH_SIZE);
      setStats(prev => ({
        ...prev,
        totalPayments: allPayments.length,
        totalBatches,
      }));
      addLog(`✅ Successfully loaded ALL ${allPayments.length.toLocaleString()} payments (${totalBatches.toLocaleString()} batches of ${BATCH_SIZE})`, 'success');
    } catch (error) {
      console.error('Error loading payments:', error);
      addLog(`Error loading payments: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchApplicationsForPayment = async (payment: Payment): Promise<boolean> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/fetch-payment-applications?paymentRef=${encodeURIComponent(payment.reference_number)}&type=${encodeURIComponent(payment.type)}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Log the raw result for debugging
      console.log(`Payment ${payment.reference_number} result:`, JSON.stringify(result, null, 2));

      if (result.applications && result.applications.length > 0) {
        addLog(`    → Found ${result.applications.length} application(s)`, 'info');
        result.applications.forEach((app: any, index: number) => {
          const invoiceRef = app.refNbr || app.RefNbr || 'N/A';
          const amountPaid = app.amountPaid || app.AmountPaid || 0;
          const docType = app.docType || app.DocType || 'N/A';
          const balance = app.balance || app.Balance || 0;

          addLog(
            `      ${index + 1}. Invoice: ${invoiceRef} | Doc Type: ${docType} | Amount: $${amountPaid.toFixed(2)} | Balance: $${balance.toFixed(2)}`,
            'info'
          );
        });
      } else {
        addLog(`    → No applications found (apps: ${result.applications?.length || 0})`, 'info');
      }

      return result.success || false;
    } catch (error) {
      console.error(`Error fetching applications for ${payment.reference_number}:`, error);
      return false;
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const startBatchProcessing = async () => {
    if (payments.length === 0) {
      addLog('No payments to process', 'error');
      return;
    }

    if (startFromIndex >= payments.length) {
      addLog('Start index is beyond payment list length', 'error');
      return;
    }

    const effectiveEndIndex = endAtIndex !== null && endAtIndex < payments.length ? endAtIndex : payments.length;

    if (startFromIndex >= effectiveEndIndex) {
      addLog('Start index must be less than end index', 'error');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    setShouldStop(false);

    if (startFromIndex > 0 || endAtIndex !== null) {
      const rangeText = endAtIndex !== null
        ? `from payment #${startFromIndex + 1} to #${effectiveEndIndex}`
        : `from payment #${startFromIndex + 1}`;
      addLog(`🚀 Starting batch processing ${rangeText}...`, 'info');
    } else {
      addLog('🚀 Starting batch processing...', 'info');
    }

    let processedCount = 0;
    let successCount = 0;
    let failCount = 0;
    let currentMilestone = Math.floor(startFromIndex / MILESTONE_SIZE);

    for (let i = startFromIndex; i < effectiveEndIndex; i += BATCH_SIZE) {
      if (shouldStop) {
        addLog('⏹️ Processing stopped by user', 'info');
        break;
      }

      const absoluteIndex = startFromIndex + processedCount;
      if (processedCount > 0 && absoluteIndex % MILESTONE_SIZE === 0) {
        currentMilestone++;
        setStats(prev => ({
          ...prev,
          milestonesCompleted: currentMilestone,
        }));
        addLog(`🎯 MILESTONE REACHED: ${absoluteIndex} total payments processed (${processedCount} in this session)`, 'milestone');
        addLog(`✋ Pausing at milestone. Click "Resume" to continue to next ${MILESTONE_SIZE}...`, 'milestone');
        setIsPaused(true);

        while (isPaused && !shouldStop) {
          await sleep(100);
        }

        if (shouldStop) {
          addLog('⏹️ Processing stopped by user', 'info');
          break;
        }

        addLog('▶️ Resuming processing...', 'info');
      }

      const batchEnd = Math.min(i + BATCH_SIZE, effectiveEndIndex);
      const batch = payments.slice(i, batchEnd);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(payments.length / BATCH_SIZE);

      setStats(prev => ({
        ...prev,
        currentBatch: batchNumber,
        currentMilestone: Math.floor((startFromIndex + processedCount) / MILESTONE_SIZE),
      }));

      const paymentsInRange = effectiveEndIndex - startFromIndex;
      const remainingBatches = Math.ceil(paymentsInRange / BATCH_SIZE);
      const currentBatchInSession = Math.floor((i - startFromIndex) / BATCH_SIZE) + 1;

      addLog(`📦 Processing batch ${currentBatchInSession}/${remainingBatches} (absolute batch ${batchNumber}/${totalBatches}, ${batch.length} payments in parallel)...`, 'info');

      let batchSuccess = 0;
      let batchFail = 0;

      const batchPromises = batch.map(async (payment, j) => {
        if (shouldStop) return { success: false, payment };

        if (j > 0 && REQUEST_DELAY > 0) {
          await sleep(REQUEST_DELAY * j);
        }

        const paymentNumber = i + j + 1;
        addLog(`  Processing #${paymentNumber}/${payments.length}: ${payment.reference_number}...`, 'info');

        const success = await fetchApplicationsForPayment(payment);
        return { success, payment };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result.success) {
          batchSuccess++;
          successCount++;
          addLog(`  ✓ ${result.payment.reference_number} completed`, 'success');
        } else {
          batchFail++;
          failCount++;
          addLog(`  ✗ ${result.payment.reference_number} failed`, 'error');
        }

        processedCount++;

        setStats(prev => ({
          ...prev,
          processedPayments: processedCount,
          successfulFetches: successCount,
          failedFetches: failCount,
        }));
      }

      addLog(`✅ Batch ${batchNumber} completed: ${batchSuccess} success, ${batchFail} failed`, 'success');

      if (i + BATCH_SIZE < effectiveEndIndex && !shouldStop) {
        addLog(`⏳ Waiting ${BATCH_DELAY / 1000} seconds before next batch...`, 'info');
        await sleep(BATCH_DELAY);
      }
    }

    if (!shouldStop) {
      addLog(`🎉 Processing complete! Total: ${processedCount} payments, ${successCount} successful, ${failCount} failed`, 'success');
    }

    setIsRunning(false);
    setIsPaused(false);
  };

  const handleStop = () => {
    setShouldStop(true);
    setIsPaused(false);
    addLog('Stopping batch processing...', 'info');
  };

  const handleResume = () => {
    setIsPaused(false);
    addLog('Resuming from milestone...', 'info');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'milestone':
        return <Zap className="w-4 h-4 text-yellow-400" />;
      default:
        return <Clock className="w-4 h-4 text-blue-400" />;
    }
  };

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-300 bg-green-900/20 border-green-700';
      case 'error':
        return 'text-red-300 bg-red-900/20 border-red-700';
      case 'milestone':
        return 'text-yellow-300 bg-yellow-900/20 border-yellow-700';
      default:
        return 'text-slate-300 bg-slate-800/50 border-slate-700';
    }
  };

  const effectiveEndIndex = endAtIndex !== null && endAtIndex < payments.length ? endAtIndex : payments.length;
  const remainingPayments = effectiveEndIndex - startFromIndex;
  const progressPercentage = remainingPayments > 0
    ? Math.round((stats.processedPayments / remainingPayments) * 100)
    : 0;

  const absoluteProgress = startFromIndex + stats.processedPayments;
  const currentMilestoneProgress = absoluteProgress % MILESTONE_SIZE;
  const milestonePercentage = Math.round((currentMilestoneProgress / MILESTONE_SIZE) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white">Batch Application Fetcher</h1>
              <p className="text-slate-400 mt-1">Fetch payment applications in batches with automatic pausing</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-400 text-sm font-medium">Total Progress</h3>
              <span className="text-2xl font-bold text-blue-400">{progressPercentage}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
              <div
                className="bg-gradient-to-r from-blue-600 to-cyan-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <p className="text-slate-400 text-sm">
              {stats.processedPayments.toLocaleString()} / {remainingPayments.toLocaleString()} payments
              {startFromIndex > 0 && (
                <span className="text-slate-500"> (started at #{startFromIndex + 1})</span>
              )}
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-400 text-sm font-medium">Milestone Progress</h3>
              <span className="text-2xl font-bold text-yellow-400">{milestonePercentage}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-3 mb-2">
              <div
                className="bg-gradient-to-r from-yellow-600 to-orange-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${milestonePercentage}%` }}
              ></div>
            </div>
            <p className="text-slate-400 text-sm">
              {currentMilestoneProgress.toLocaleString()} / {MILESTONE_SIZE.toLocaleString()} in milestone {stats.currentMilestone + 1}
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-3">Batch Status</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Current Batch:</span>
                <span className="text-white font-semibold">{stats.currentBatch} / {stats.totalBatches}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Milestones Completed:</span>
                <span className="text-yellow-400 font-semibold">{stats.milestonesCompleted}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white">
            <h3 className="text-blue-200 text-sm font-medium mb-2">
              {startFromIndex > 0 ? 'Remaining Payments' : 'Total Payments'}
            </h3>
            <p className="text-4xl font-bold">{startFromIndex > 0 ? remainingPayments.toLocaleString() : stats.totalPayments.toLocaleString()}</p>
            {startFromIndex > 0 && (
              <p className="text-blue-200 text-xs mt-1">of {stats.totalPayments.toLocaleString()} total</p>
            )}
          </div>

          <div className="bg-gradient-to-br from-cyan-600 to-cyan-700 rounded-xl p-6 text-white">
            <h3 className="text-cyan-200 text-sm font-medium mb-2">Processed</h3>
            <p className="text-4xl font-bold">{stats.processedPayments.toLocaleString()}</p>
          </div>

          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-6 text-white">
            <h3 className="text-green-200 text-sm font-medium mb-2">Successful</h3>
            <p className="text-4xl font-bold">{stats.successfulFetches.toLocaleString()}</p>
          </div>

          <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl p-6 text-white">
            <h3 className="text-red-200 text-sm font-medium mb-2">Failed</h3>
            <p className="text-4xl font-bold">{stats.failedFetches.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">Batch Configuration</h2>
            <p className="text-slate-400 text-sm">
              Processes <span className="text-green-400 font-semibold">{BATCH_SIZE} payments in parallel</span> per batch with {REQUEST_DELAY}ms staggered starts.
              {BATCH_DELAY / 1000}s delay between batches. Pauses every {MILESTONE_SIZE.toLocaleString()} payments.
              <span className="text-blue-400"> 🔐 Uses session caching to avoid rate limits!</span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Start From Payment # (Optional)
              </label>
              <input
                type="number"
                min="0"
                max={Math.max(0, payments.length - 1)}
                value={startFromIndex}
                onChange={(e) => setStartFromIndex(Math.max(0, Math.min(parseInt(e.target.value) || 0, payments.length - 1)))}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                End At Payment # (Optional)
              </label>
              <input
                type="number"
                min={startFromIndex + 1}
                max={payments.length}
                value={endAtIndex ?? ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setEndAtIndex(isNaN(val) ? null : Math.max(startFromIndex + 1, Math.min(val, payments.length)));
                }}
                disabled={isRunning}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={`${payments.length} (all)`}
              />
            </div>
          </div>

          <div className="mb-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <div className="text-slate-300 text-sm">
              {startFromIndex === 0 && endAtIndex === null ? (
                <>
                  Will process <span className="text-white font-semibold">all {payments.length.toLocaleString()}</span> payments from the beginning
                </>
              ) : endAtIndex !== null ? (
                <>
                  Will process <span className="text-white font-semibold">{(effectiveEndIndex - startFromIndex).toLocaleString()}</span> payments
                  (from payment #{startFromIndex + 1} to #{effectiveEndIndex})
                </>
              ) : (
                <>
                  Will process <span className="text-white font-semibold">{(payments.length - startFromIndex).toLocaleString()}</span> payments
                  (from payment #{startFromIndex + 1} to end)
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end">
            <div className="flex gap-3">
              {!isRunning ? (
                <button
                  onClick={startBatchProcessing}
                  disabled={loading || payments.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-5 h-5" />
                  Start Processing
                </button>
              ) : isPaused ? (
                <>
                  <button
                    onClick={handleResume}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
                  >
                    <Play className="w-5 h-5" />
                    Resume
                  </button>
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
                  >
                    <Pause className="w-5 h-5" />
                    Stop
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
                >
                  <Pause className="w-5 h-5" />
                  Stop
                </button>
              )}
              <button
                onClick={loadPayments}
                disabled={isRunning}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-5 h-5" />
                Reload
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Processing Log</h2>
            <span className="text-slate-400 text-sm">{logs.length} entries</span>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No logs yet. Start processing to see activity.</p>
            ) : (
              logs.slice().reverse().map((log, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${getLogColor(log.type)}`}
                >
                  {getLogIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono break-words">{log.message}</p>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{formatTime(log.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
