import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw, CheckCircle, XCircle, Loader, Download, Clock, AlertCircle, Settings, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { batchedInQuery } from '../lib/batchedQuery';

interface PaymentAttachmentsBatchFetchProps {
  onBack?: () => void;
}

interface Payment {
  id: string;
  reference_number: string;
  customer_id: string;
  payment_amount: number;
  application_date: string;
  status: string;
}

interface BatchProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  noFiles: number;
  currentPayment: string | null;
  isRunning: boolean;
  isPaused: boolean;
}

interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  filesCount?: number;
}

export default function PaymentAttachmentsBatchFetch({ onBack }: PaymentAttachmentsBatchFetchProps) {
  const [totalPayments, setTotalPayments] = useState(0);
  const [startOffset, setStartOffset] = useState(0);
  const [endOffset, setEndOffset] = useState<number | null>(null);
  const [batchSize, setBatchSize] = useState(100);
  const [concurrentRequests, setConcurrentRequests] = useState(3);
  const [paymentsToProcess, setPaymentsToProcess] = useState<Payment[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [progress, setProgress] = useState<BatchProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    noFiles: 0,
    currentPayment: null,
    isRunning: false,
    isPaused: false
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [shouldStop, setShouldStop] = useState(false);

  useEffect(() => {
    loadTotalPaymentCount();
  }, []);

  const loadTotalPaymentCount = async () => {
    setLoading(true);
    try {
      const { count, error } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      setTotalPayments(count || 0);
      addLog(`Found ${count || 0} total payments in database`, 'info');
    } catch (error) {
      console.error('Error loading payment count:', error);
      addLog(`Error: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAllPayments = async () => {
    setLoading(true);
    try {
      const effectiveEnd = endOffset !== null && endOffset <= totalPayments ? endOffset : totalPayments;

      if (startOffset >= effectiveEnd) {
        addLog('Start offset must be less than end offset', 'error');
        setLoading(false);
        return;
      }

      const paymentsToLoad = effectiveEnd - startOffset;
      addLog(`Loading ${paymentsToLoad.toLocaleString()} payments (from #${startOffset + 1} to #${effectiveEnd})...`, 'info');

      let allPayments: Payment[] = [];
      let currentOffset = startOffset;
      const pageSize = 1000;

      while (currentOffset < effectiveEnd) {
        const rangeEnd = Math.min(currentOffset + pageSize - 1, effectiveEnd - 1);

        const { data, error } = await supabase
          .from('acumatica_payments')
          .select('id, reference_number, customer_id, payment_amount, application_date, status, payment_method, type, description, payment_ref, cash_account')
          .order('application_date', { ascending: false })
          .range(currentOffset, rangeEnd);

        if (error) throw error;

        if (data && data.length > 0) {
          allPayments = [...allPayments, ...data];
          addLog(`Loaded ${data.length} payments (total so far: ${allPayments.length})`, 'info');
          currentOffset += data.length;

          if (data.length < pageSize) {
            break;
          }
        } else {
          break;
        }
      }

      addLog(`Successfully loaded all ${allPayments.length.toLocaleString()} payments`, 'success');
      setPaymentsToProcess(allPayments);
    } catch (error) {
      console.error('Error loading payments:', error);
      addLog(`Error loading payments: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    if (paymentsToProcess.length === 0) {
      addLog('No payments loaded. Load a batch first.', 'error');
      return;
    }

    addLog('Preparing Excel export with attachments and applications...', 'info');

    try {
      const paymentRefs = paymentsToProcess.map(p => p.reference_number);

      const attachments = await batchedInQuery(
        supabase,
        'payment_attachments',
        'payment_reference_number, file_name, file_type, file_size, is_check_image',
        'payment_reference_number',
        paymentRefs
      );

      const applications = await batchedInQuery(
        supabase,
        'payment_invoice_applications',
        'payment_reference_number, invoice_reference_number, amount_paid, doc_type',
        'payment_reference_number',
        paymentRefs
      );

      const attachmentsByPayment = new Map<string, any[]>();
      const applicationsByPayment = new Map<string, any[]>();

      (attachments || []).forEach(att => {
        if (!attachmentsByPayment.has(att.payment_reference_number)) {
          attachmentsByPayment.set(att.payment_reference_number, []);
        }
        attachmentsByPayment.get(att.payment_reference_number)!.push(att);
      });

      (applications || []).forEach(app => {
        if (!applicationsByPayment.has(app.payment_reference_number)) {
          applicationsByPayment.set(app.payment_reference_number, []);
        }
        applicationsByPayment.get(app.payment_reference_number)!.push(app);
      });

      const csvRows = [
        [
          'Reference Number',
          'Customer ID',
          'Amount',
          'Date',
          'Status',
          'Type',
          'Payment Method',
          'Payment Ref',
          'Cash Account',
          'Description',
          'Attachments',
          'Invoices Applied',
          'Credit Memos Applied'
        ].join(',')
      ];

      paymentsToProcess.forEach(payment => {
        const refNum = payment.reference_number;
        const atts = attachmentsByPayment.get(refNum) || [];
        const apps = applicationsByPayment.get(refNum) || [];

        const invoices = apps.filter(a => a.doc_type === 'Invoice' || !a.doc_type);
        const creditMemos = apps.filter(a => a.doc_type === 'Credit Memo');

        const attDetails = atts.map(a =>
          `${a.file_name} (${a.file_type || 'unknown'}, ${(a.file_size / 1024).toFixed(1)}KB${a.is_check_image ? ', Check Image' : ''})`
        ).join(' | ');

        const invoiceDetails = invoices.map(a =>
          `${a.invoice_reference_number}: $${parseFloat(a.amount_paid || 0).toFixed(2)}`
        ).join(' | ');

        const creditMemoDetails = creditMemos.map(a =>
          `${a.invoice_reference_number}: $${parseFloat(a.amount_paid || 0).toFixed(2)}`
        ).join(' | ');

        const row = [
          refNum,
          payment.customer_id || '',
          payment.payment_amount?.toString() || '0',
          payment.application_date || '',
          payment.status || '',
          (payment as any).type || 'Payment',
          (payment as any).payment_method || '',
          (payment as any).payment_ref || '',
          (payment as any).cash_account || '',
          `"${((payment as any).description || '').replace(/"/g, '""')}"`,
          `"${attDetails}"`,
          `"${invoiceDetails}"`,
          `"${creditMemoDetails}"`
        ];

        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `payments_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addLog(`Exported ${paymentsToProcess.length} payments with attachments and applications`, 'success');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      addLog(`Export failed: ${error}`, 'error');
    }
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning', filesCount?: number) => {
    setLogs(prev => [...prev, { timestamp: new Date(), message, type, filesCount }]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getLogIcon = (type: 'info' | 'success' | 'error' | 'warning') => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Clock className="w-4 h-4 text-blue-600" />;
    }
  };

  const getLogColor = (type: 'info' | 'success' | 'error' | 'warning') => {
    switch (type) {
      case 'success':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const fetchAttachmentsForPayment = async (payment: Payment): Promise<{ success: boolean; filesCount: number }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-payment-attachments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            paymentRefNumber: payment.reference_number,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch attachments');
      }

      return { success: true, filesCount: result.filesCount || 0 };
    } catch (error) {
      return { success: false, filesCount: 0 };
    }
  };

  const startBatchFetch = async () => {
    if (paymentsToProcess.length === 0) {
      addLog('No payments loaded. Please load payments first.', 'error');
      return;
    }

    const startTime = Date.now();
    setShouldStop(false);

    setProgress({
      total: paymentsToProcess.length,
      processed: 0,
      successful: 0,
      failed: 0,
      noFiles: 0,
      currentPayment: null,
      isRunning: true,
      isPaused: false
    });

    addLog(`Starting batch fetch for ${paymentsToProcess.length.toLocaleString()} payments (${concurrentRequests} concurrent requests)`, 'info');

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let noFilesCount = 0;

    for (let i = 0; i < paymentsToProcess.length; i += concurrentRequests) {
      if (shouldStop) {
        addLog('Processing stopped by user', 'warning');
        break;
      }

      const batch = paymentsToProcess.slice(i, i + concurrentRequests);

      const promises = batch.map(async (payment) => {
        if (shouldStop) return { success: false, filesCount: 0, payment };

        setProgress(prev => ({
          ...prev,
          currentPayment: payment.reference_number
        }));

        const { success, filesCount } = await fetchAttachmentsForPayment(payment);

        return { success, filesCount, payment };
      });

      const results = await Promise.all(promises);

      for (const result of results) {
        if (shouldStop) break;

        processedCount++;

        if (result.success) {
          if (result.filesCount > 0) {
            successCount++;
            addLog(`✓ ${result.payment.reference_number}: Found ${result.filesCount} file(s)`, 'success', result.filesCount);
          } else {
            noFilesCount++;
            addLog(`○ ${result.payment.reference_number}: No files found`, 'warning');
          }
        } else {
          failedCount++;
          addLog(`✗ ${result.payment.reference_number}: Failed to fetch attachments`, 'error');
        }

        setProgress(prev => ({
          ...prev,
          processed: processedCount,
          successful: successCount,
          failed: failedCount,
          noFiles: noFilesCount
        }));
      }

      if (!shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;
    const durationSeconds = (duration / 1000).toFixed(1);

    setProgress(prev => ({
      ...prev,
      isRunning: false,
      currentPayment: null
    }));

    if (!shouldStop) {
      addLog(
        `Batch complete in ${durationSeconds}s! With Files: ${successCount}, No Files: ${noFilesCount}, Failed: ${failedCount}`,
        'success'
      );
    } else {
      addLog(
        `Stopped after ${durationSeconds}s. Processed: ${processedCount}, With Files: ${successCount}, No Files: ${noFilesCount}, Failed: ${failedCount}`,
        'warning'
      );
    }
  };

  const stopBatchFetch = () => {
    setShouldStop(true);
    addLog('Stopping batch processing...', 'warning');
  };

  const resetBatchFetch = () => {
    setShouldStop(false);
    setProgress({
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      noFiles: 0,
      currentPayment: null,
      isRunning: false,
      isPaused: false
    });
    setLogs([]);
    setSkippedCount(0);
    setPaymentsToProcess([]);
  };

  const exportLogs = () => {
    const logText = logs.map(log =>
      `[${formatTime(log.timestamp)}] ${log.type.toUpperCase()}: ${log.message}${log.filesCount ? ` (${log.filesCount} files)` : ''}`
    ).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attachment-batch-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Batch Fetch Payment Attachments</h1>
              <p className="text-gray-600 mt-1">Configure starting point and batch fetch attachments</p>
            </div>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="bg-white border border-gray-300 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-gray-700" />
            <h2 className="text-xl font-bold text-gray-900">Batch Configuration</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Payments in Database</p>
              <p className="text-3xl font-bold text-gray-900">{totalPayments.toLocaleString()}</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Payments Ready for Processing</p>
              <p className="text-3xl font-bold text-blue-600">{paymentsToProcess.length}</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Skipped (Already Have Attachments)</p>
              <p className="text-3xl font-bold text-green-600">{skippedCount}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start From Payment #
              </label>
              <input
                type="number"
                min="0"
                max={totalPayments - 1}
                value={startOffset}
                onChange={(e) => setStartOffset(Math.max(0, Math.min(parseInt(e.target.value) || 0, totalPayments - 1)))}
                disabled={progress.isRunning || loading}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End At Payment # (Optional)
              </label>
              <input
                type="number"
                min={startOffset + 1}
                max={totalPayments}
                value={endOffset ?? ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setEndOffset(isNaN(val) ? null : Math.max(startOffset + 1, Math.min(val, totalPayments)));
                }}
                disabled={progress.isRunning || loading}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
                placeholder={`${totalPayments} (all)`}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Concurrent Requests
              </label>
              <select
                value={concurrentRequests}
                onChange={(e) => setConcurrentRequests(Number(e.target.value))}
                disabled={progress.isRunning}
                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
              >
                <option value={1}>1 (Sequential)</option>
                <option value={2}>2 at once</option>
                <option value={3}>3 at once</option>
                <option value={5}>5 at once</option>
                <option value={10}>10 at once</option>
              </select>
            </div>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-900">
              {startOffset === 0 && endOffset === null ? (
                <>
                  Will load <strong>all {totalPayments.toLocaleString()}</strong> payments from the beginning
                </>
              ) : endOffset !== null ? (
                <>
                  Will load <strong>{(Math.min(endOffset, totalPayments) - startOffset).toLocaleString()}</strong> payments
                  (from payment #{startOffset + 1} to #{Math.min(endOffset, totalPayments)})
                </>
              ) : (
                <>
                  Will load <strong>{(totalPayments - startOffset).toLocaleString()}</strong> payments
                  (from payment #{startOffset + 1} to end)
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadAllPayments}
              disabled={loading || progress.isRunning}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Load Payments
                </>
              )}
            </button>

            {paymentsToProcess.length > 0 && !progress.isRunning && (
              <button
                onClick={startBatchFetch}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                <Play className="w-5 h-5" />
                Start Fetching
              </button>
            )}

            {progress.isRunning && (
              <button
                onClick={stopBatchFetch}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                <Pause className="w-5 h-5" />
                Stop
              </button>
            )}

            {paymentsToProcess.length > 0 && !progress.isRunning && (
              <button
                onClick={resetBatchFetch}
                className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                Reset
              </button>
            )}

            {paymentsToProcess.length > 0 && (
              <button
                onClick={exportToExcel}
                disabled={loading || progress.isRunning}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5" />
                Export to CSV
              </button>
            )}
          </div>
        </div>


        {/* Progress Section */}
        {progress.total > 0 && (
          <div className="bg-white border border-gray-300 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Batch Progress</h2>

            <div className="grid md:grid-cols-5 gap-4 mb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm mb-1">Total</p>
                <p className="text-2xl font-bold text-gray-900">{progress.total}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm mb-1">Processed</p>
                <p className="text-2xl font-bold text-blue-600">{progress.processed}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm mb-1">With Files</p>
                <p className="text-2xl font-bold text-green-600">{progress.successful}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm mb-1">No Files</p>
                <p className="text-2xl font-bold text-yellow-600">{progress.noFiles}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-600 text-sm mb-1">Failed</p>
                <p className="text-2xl font-bold text-red-600">{progress.failed}</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Progress</span>
                <span className="text-sm text-gray-900 font-semibold">
                  {progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 to-green-600 h-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
                />
              </div>
              {progress.currentPayment && (
                <p className="text-sm text-gray-700 mt-2 flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing: {progress.currentPayment}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Logs Section */}
        <div className="bg-white border border-gray-300 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Processing Log</h2>
            <div className="flex items-center gap-3">
              <span className="text-gray-600 text-sm">{logs.length} entries</span>
              {logs.length > 0 && (
                <button
                  onClick={exportLogs}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export Logs
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No logs yet. Load payments and start processing to see activity.</p>
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
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatTime(log.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
