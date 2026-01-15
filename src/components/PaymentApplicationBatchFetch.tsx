import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw, CheckCircle, XCircle, Loader, Download, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PaymentApplicationBatchFetchProps {
  onBack?: () => void;
}

interface Payment {
  id: string;
  reference_number: string;
  customer_id: string;
  payment_amount: number;
  application_date: string;
  status: string;
  balance?: number;
}

interface BatchProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentPayment: string | null;
  isRunning: boolean;
  isPaused: boolean;
}

export default function PaymentApplicationBatchFetch({ onBack }: PaymentApplicationBatchFetchProps) {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [batchSize, setBatchSize] = useState(200);
  const [concurrentRequests, setConcurrentRequests] = useState(5);
  const [progress, setProgress] = useState<BatchProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    currentPayment: null,
    isRunning: false,
    isPaused: false
  });
  const [logs, setLogs] = useState<Array<{ timestamp: Date; message: string; type: 'info' | 'success' | 'error' }>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showBalancedOnly, setShowBalancedOnly] = useState(false);
  const [fetchLimit, setFetchLimit] = useState<number>(5000);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadPaymentsWithoutApplications();
  }, []);

  const loadPaymentsWithoutApplications = async () => {
    setLoading(true);
    try {
      let logMessage = 'Loading payments without applications';
      const filters = [];
      if (dateFrom || dateTo) {
        filters.push(`${dateFrom || 'any'} to ${dateTo || 'any'}`);
      }
      if (showBalancedOnly) {
        filters.push('balanced only');
      }
      if (filters.length > 0) {
        logMessage += ` (${filters.join(', ')})`;
      }
      addLog(logMessage + '...', 'info');

      const { data, error } = await supabase
        .rpc('get_payment_ids_with_applications');

      if (error) throw error;

      const paymentsWithApps = new Set(data?.map((p: any) => p.id) || []);
      addLog(`Found ${paymentsWithApps.size} payments that already have applications (skipping these)`, 'info');

      let query = supabase
        .from('acumatica_payments')
        .select('id, reference_number, customer_id, payment_amount, application_date, status, balance')
        .order('application_date', { ascending: false })
        .limit(fetchLimit);

      if (dateFrom) {
        query = query.gte('application_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('application_date', dateTo);
      }
      if (showBalancedOnly) {
        query = query.eq('balance', 0);
      }

      const { data: allPayments, error: paymentsError } = await query;

      if (paymentsError) throw paymentsError;

      const paymentsWithoutApps = (allPayments || []).filter(
        p => !paymentsWithApps.has(p.id)
      );

      setPayments(paymentsWithoutApps);
      addLog(`Found ${paymentsWithoutApps.length} payments without applications (out of ${allPayments?.length || 0} total)`, 'success');
    } catch (error) {
      console.error('Error loading payments:', error);
      addLog(`Error: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error') => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type }]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLogIcon = (type: 'info' | 'success' | 'error') => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-blue-400" />;
    }
  };

  const getLogColor = (type: 'info' | 'success' | 'error') => {
    switch (type) {
      case 'success':
        return 'text-green-300 bg-green-900/20 border-green-700';
      case 'error':
        return 'text-red-300 bg-red-900/20 border-red-700';
      default:
        return 'text-slate-300 bg-slate-800/50 border-slate-700';
    }
  };

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPayments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    const filtered = getFilteredPayments();
    setSelectedPayments(new Set(filtered.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedPayments(new Set());
  };

  const selectFirstN = (n: number) => {
    const filtered = getFilteredPayments();
    setSelectedPayments(new Set(filtered.slice(0, n).map(p => p.id)));
  };

  const getFilteredPayments = () => {
    if (!searchTerm.trim()) return payments;
    const term = searchTerm.toLowerCase();
    return payments.filter(p =>
      p.reference_number.toLowerCase().includes(term) ||
      p.customer_id?.toLowerCase().includes(term)
    );
  };

  const fetchApplicationsForPayment = async (paymentId: string, referenceNumber: string, payment: Payment): Promise<boolean> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      addLog(`🔄 Fetching applications for payment: ${referenceNumber} (Customer: ${payment.customer_id}, Amount: $${payment.payment_amount})`, 'info');

      const response = await fetch(
        `${supabaseUrl}/functions/v1/fetch-payment-applications?paymentRef=${encodeURIComponent(referenceNumber)}`,
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

      if (result.applications && result.applications.length > 0) {
        addLog(`✓ ${referenceNumber}: Fetched ${result.applications.length} applications`, 'success');

        result.applications.forEach((app: any, index: number) => {
          addLog(
            `  └─ App ${index + 1}: Invoice ${app.RefNbr || app.invoice_ref || 'N/A'} | ` +
            `Amount: $${app.AmountPaid || app.amount_paid || 0} | ` +
            `Balance: $${app.Balance || app.balance || 0} | ` +
            `Doc Type: ${app.DocType || app.doc_type || 'N/A'}`,
            'info'
          );
        });

        return true;
      } else {
        addLog(`○ ${referenceNumber}: No applications found`, 'info');
        return true;
      }
    } catch (error) {
      addLog(`✗ ${referenceNumber}: ${error}`, 'error');
      return false;
    }
  };

  const startBatchFetch = async () => {
    const selectedPaymentsList = Array.from(selectedPayments)
      .map(id => payments.find(p => p.id === id))
      .filter(Boolean) as Payment[];

    if (selectedPaymentsList.length === 0) {
      alert('Please select at least one payment');
      return;
    }

    const startTime = Date.now();

    setProgress({
      total: selectedPaymentsList.length,
      processed: 0,
      successful: 0,
      failed: 0,
      currentPayment: null,
      isRunning: true,
      isPaused: false
    });

    setLogs([]);
    addLog(`Starting batch fetch for ${selectedPaymentsList.length} payments (${batchSize} at a time, ${concurrentRequests} concurrent requests)`, 'info');

    for (let i = 0; i < selectedPaymentsList.length; i += batchSize) {
      if (progress.isPaused) {
        addLog('Batch paused by user', 'info');
        break;
      }

      const batch = selectedPaymentsList.slice(i, i + batchSize);
      addLog(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(selectedPaymentsList.length / batchSize)} (${batch.length} payments)`, 'info');

      for (let j = 0; j < batch.length; j += concurrentRequests) {
        if (progress.isPaused) break;

        const concurrentBatch = batch.slice(j, j + concurrentRequests);

        const promises = concurrentBatch.map(async (payment) => {
          setProgress(prev => ({
            ...prev,
            currentPayment: payment.reference_number
          }));

          const success = await fetchApplicationsForPayment(payment.id, payment.reference_number, payment);

          setProgress(prev => ({
            ...prev,
            processed: prev.processed + 1,
            successful: prev.successful + (success ? 1 : 0),
            failed: prev.failed + (success ? 0 : 1)
          }));

          return success;
        });

        await Promise.all(promises);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (i + batchSize < selectedPaymentsList.length && !progress.isPaused) {
        addLog(`Waiting 200ms before next batch...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    const duration = Date.now() - startTime;
    const durationSeconds = (duration / 1000).toFixed(1);
    const paymentsPerSecond = (selectedPaymentsList.length / (duration / 1000)).toFixed(1);

    setProgress(prev => ({
      ...prev,
      isRunning: false,
      currentPayment: null
    }));

    addLog(`Batch fetch completed in ${durationSeconds}s! Success: ${progress.successful}, Failed: ${progress.failed} | Speed: ${paymentsPerSecond} payments/sec`, 'success');
  };

  const pauseBatchFetch = () => {
    setProgress(prev => ({
      ...prev,
      isPaused: true,
      isRunning: false
    }));
    addLog('Batch paused', 'info');
  };

  const resetBatchFetch = () => {
    setProgress({
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      currentPayment: null,
      isRunning: false,
      isPaused: false
    });
    setLogs([]);
  };

  const exportLogs = () => {
    const logText = logs.map(log => `[${formatTime(log.timestamp)}] ${log.type.toUpperCase()}: ${log.message}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-fetch-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredPayments = getFilteredPayments();

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
              <h1 className="text-3xl font-bold text-white">Batch Fetch Payment Applications</h1>
              <p className="text-slate-400 mt-1">Select payments and fetch applications in batches</p>
            </div>
          </div>
        </div>

        {/* Date Filter */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Filters</h3>
          <div className="grid md:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                disabled={progress.isRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                disabled={progress.isRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Fetch Limit</label>
              <select
                value={fetchLimit}
                onChange={(e) => setFetchLimit(Number(e.target.value))}
                disabled={progress.isRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value={100}>100 payments</option>
                <option value={500}>500 payments</option>
                <option value={1000}>1000 payments</option>
                <option value={2000}>2000 payments</option>
                <option value={5000}>5000 payments</option>
                <option value={10000}>10000 payments</option>
                <option value={20000}>20000 payments</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Balance Filter</label>
              <label className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg cursor-pointer hover:border-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={showBalancedOnly}
                  onChange={(e) => setShowBalancedOnly(e.target.checked)}
                  disabled={progress.isRunning}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span className="text-white text-sm">Balanced only (0)</span>
              </label>
            </div>
            <div className="flex items-end">
              <button
                onClick={loadPaymentsWithoutApplications}
                disabled={progress.isRunning || loading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply Filters
              </button>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            Fetching up to <span className="text-white font-semibold">{fetchLimit.toLocaleString()}</span> payments
            {dateFrom || dateTo || showBalancedOnly ? (
              <>
                {' • '}Filtering:
                {(dateFrom || dateTo) && (
                  <> from <span className="text-white font-semibold">{dateFrom || 'any date'}</span> to <span className="text-white font-semibold">{dateTo || 'any date'}</span></>
                )}
                {showBalancedOnly && (
                  <span className="text-green-400 font-semibold"> • Balanced payments only (balance = 0)</span>
                )}
              </>
            ) : (
              ''
            )}
          </p>
        </div>

        {/* Batch Configuration */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Batch Configuration</h3>
          <div className="grid md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Batch Size</label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                disabled={progress.isRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value={10}>10 payments</option>
                <option value={25}>25 payments</option>
                <option value={50}>50 payments</option>
                <option value={100}>100 payments</option>
                <option value={200}>200 payments</option>
                <option value={500}>500 payments</option>
                <option value={1000}>1000 payments</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Concurrent Requests</label>
              <select
                value={concurrentRequests}
                onChange={(e) => setConcurrentRequests(Number(e.target.value))}
                disabled={progress.isRunning}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value={1}>1 (Sequential)</option>
                <option value={3}>3 at once</option>
                <option value={5}>5 at once</option>
                <option value={10}>10 at once</option>
                <option value={15}>15 at once</option>
                <option value={20}>20 at once</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => selectFirstN(batchSize)}
                disabled={progress.isRunning}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Select First {batchSize}
              </button>
            </div>

            <div className="flex items-end">
              <button
                onClick={selectAll}
                disabled={progress.isRunning}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Select All
              </button>
            </div>

            <div className="flex items-end">
              <button
                onClick={deselectAll}
                disabled={progress.isRunning}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-slate-300">
              Selected: <span className="font-bold text-white">{selectedPayments.size}</span> payments |
              Processing <span className="font-bold text-blue-400">{concurrentRequests}</span> at once =
              <span className="font-bold text-green-400"> {concurrentRequests}x faster</span>
            </p>
          </div>
        </div>

        {/* Progress Section */}
        {progress.total > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Batch Progress</h2>
              <div className="flex gap-2">
                {!progress.isRunning && progress.processed < progress.total && (
                  <button
                    onClick={startBatchFetch}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    {progress.processed === 0 ? 'Start' : 'Resume'}
                  </button>
                )}
                {progress.isRunning && (
                  <button
                    onClick={pauseBatchFetch}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                )}
                <button
                  onClick={resetBatchFetch}
                  disabled={progress.isRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-4 mb-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Total</p>
                <p className="text-2xl font-bold text-white">{progress.total}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Processed</p>
                <p className="text-2xl font-bold text-blue-400">{progress.processed}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Successful</p>
                <p className="text-2xl font-bold text-green-400">{progress.successful}</p>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Failed</p>
                <p className="text-2xl font-bold text-red-400">{progress.failed}</p>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Progress</span>
                <span className="text-sm text-white font-semibold">
                  {progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
                />
              </div>
              {progress.currentPayment && (
                <p className="text-sm text-slate-300 mt-2 flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing: {progress.currentPayment}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Control Panel */}
        {selectedPayments.size > 0 && !progress.isRunning && progress.processed === 0 && (
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 border border-green-500 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Ready to Start</h3>
                <p className="text-green-100">
                  {selectedPayments.size} payment{selectedPayments.size !== 1 ? 's' : ''} selected, will process {batchSize} at a time with {concurrentRequests} concurrent requests (up to {concurrentRequests}x faster!)
                </p>
              </div>
              <button
                onClick={startBatchFetch}
                className="flex items-center gap-2 px-6 py-3 bg-white text-green-700 font-bold rounded-lg hover:bg-green-50 transition-colors shadow-lg"
              >
                <Play className="w-5 h-5" />
                Start Batch Fetch
              </button>
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Processing Log</h2>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">{logs.length} entries</span>
              {logs.length > 0 && (
                <button
                  onClick={exportLogs}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export Logs
                </button>
              )}
            </div>
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

        {/* Payment List */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">
              Payments Without Applications ({loading ? '...' : payments.length})
            </h2>
            <input
              type="text"
              placeholder="Search payments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {loading ? (
            <div className="text-center text-slate-400 py-12">
              <Loader className="w-8 h-8 animate-spin mx-auto mb-4" />
              Loading payments...
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredPayments.map((payment) => (
                <label
                  key={payment.id}
                  className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
                    selectedPayments.has(payment.id)
                      ? 'bg-blue-600/20 border-2 border-blue-500'
                      : 'bg-slate-900/50 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPayments.has(payment.id)}
                    onChange={() => togglePaymentSelection(payment.id)}
                    disabled={progress.isRunning}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-white font-semibold">{payment.reference_number}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        payment.status === 'Open' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        payment.status === 'Closed' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      }`}>
                        {payment.status}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm text-slate-400">
                      <span>Customer: {payment.customer_id}</span>
                      <span>Amount: ${payment.payment_amount?.toLocaleString()}</span>
                      <span>Balance: <span className={payment.balance === 0 ? 'text-green-400 font-semibold' : 'text-yellow-400'}>${payment.balance?.toLocaleString() ?? 'N/A'}</span></span>
                      <span>Date: {new Date(payment.application_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
