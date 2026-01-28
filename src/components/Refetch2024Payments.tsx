import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, PlayCircle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BatchProgress {
  batchNumber: number;
  processed: number;
  succeeded: number;
  failed: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export default function Refetch2024Payments() {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [batches, setBatches] = useState<BatchProgress[]>([]);
  const [overallProgress, setOverallProgress] = useState({ processed: 0, succeeded: 0, failed: 0 });
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const getPaymentsWithoutApplications = async () => {
    addLog('Querying 2024 payments without applications...');

    const { data: payments, error } = await supabase
      .from('acumatica_payments')
      .select('payment_reference_number, application_date')
      .gte('application_date', '2024-01-01')
      .lte('application_date', '2024-12-31')
      .order('application_date', { ascending: true });

    if (error) {
      addLog(`Error querying payments: ${error.message}`);
      throw error;
    }

    if (!payments || payments.length === 0) {
      addLog('No 2024 payments found');
      return [];
    }

    const { data: paymentsWithApps, error: appsError } = await supabase
      .from('payment_invoice_applications')
      .select('payment_reference_number')
      .gte('application_date', '2024-01-01')
      .lte('application_date', '2024-12-31');

    if (appsError) {
      addLog(`Error querying applications: ${appsError.message}`);
      throw appsError;
    }

    const paymentsWithAppsSet = new Set(
      paymentsWithApps?.map(p => p.payment_reference_number) || []
    );

    const paymentsWithoutApps = payments.filter(
      p => !paymentsWithAppsSet.has(p.payment_reference_number)
    );

    addLog(`Found ${payments.length} total 2024 payments`);
    addLog(`Found ${paymentsWithAppsSet.size} payments with applications`);
    addLog(`Found ${paymentsWithoutApps.length} payments WITHOUT applications`);

    return paymentsWithoutApps;
  };

  const fetchApplicationsForPayment = async (paymentRefNumber: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-payment-applications`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentRefNumber }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    return await response.json();
  };

  const processBatch = async (payments: any[], batchNumber: number) => {
    const batchIndex = batchNumber - 1;

    setBatches(prev => {
      const updated = [...prev];
      updated[batchIndex].status = 'processing';
      return updated;
    });

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];

      try {
        await fetchApplicationsForPayment(payment.payment_reference_number);
        succeeded++;
        addLog(`✓ ${payment.payment_reference_number} (${i + 1}/${payments.length})`);
      } catch (error) {
        failed++;
        addLog(`✗ ${payment.payment_reference_number}: ${error instanceof Error ? error.message : 'Failed'}`);
      }

      setBatches(prev => {
        const updated = [...prev];
        updated[batchIndex].processed = i + 1;
        updated[batchIndex].succeeded = succeeded;
        updated[batchIndex].failed = failed;
        return updated;
      });

      setOverallProgress(prev => ({
        processed: prev.processed + 1,
        succeeded: prev.succeeded + (succeeded > prev.succeeded ? 1 : 0),
        failed: prev.failed + (failed > prev.failed ? 1 : 0),
      }));
    }

    setBatches(prev => {
      const updated = [...prev];
      updated[batchIndex].status = 'completed';
      return updated;
    });

    addLog(`Batch ${batchNumber} completed: ${succeeded} succeeded, ${failed} failed`);
  };

  const startRefetch = async () => {
    setIsRunning(true);
    setCurrentBatch(0);
    setBatches([]);
    setOverallProgress({ processed: 0, succeeded: 0, failed: 0 });
    setLogs([]);

    try {
      const paymentsToFetch = await getPaymentsWithoutApplications();

      if (paymentsToFetch.length === 0) {
        addLog('No payments to fetch. All 2024 payments already have applications!');
        setIsRunning(false);
        return;
      }

      setTotalPayments(paymentsToFetch.length);

      const batchSize = 100;
      const numBatches = Math.ceil(paymentsToFetch.length / batchSize);

      const initialBatches: BatchProgress[] = Array.from({ length: numBatches }, (_, i) => ({
        batchNumber: i + 1,
        processed: 0,
        succeeded: 0,
        failed: 0,
        status: 'pending' as const,
      }));

      setBatches(initialBatches);
      addLog(`Starting to process ${numBatches} batches of up to 100 payments each...`);

      for (let i = 0; i < numBatches; i++) {
        setCurrentBatch(i + 1);
        const start = i * batchSize;
        const end = Math.min(start + batchSize, paymentsToFetch.length);
        const batch = paymentsToFetch.slice(start, end);

        addLog(`\n=== Processing Batch ${i + 1}/${numBatches} (${batch.length} payments) ===`);
        await processBatch(batch, i + 1);
      }

      addLog('\n✓ All batches completed!');
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Refetch 2024 Payment Applications
          </h1>
          <p className="text-slate-600 mb-6">
            Automatically fetch payment applications for all 2024 payments in batches of 100
          </p>

          <button
            onClick={startRefetch}
            disabled={isRunning}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <PlayCircle className="w-5 h-5" />
                Start Refetch
              </>
            )}
          </button>

          {totalPayments > 0 && (
            <div className="mt-6 p-4 bg-slate-50 rounded-lg">
              <h3 className="font-semibold text-slate-900 mb-2">Overall Progress</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total Payments:</span>
                  <span className="font-semibold">{totalPayments}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Processed:</span>
                  <span className="font-semibold">{overallProgress.processed} / {totalPayments}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Succeeded:</span>
                  <span className="font-semibold text-green-600">{overallProgress.succeeded}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Failed:</span>
                  <span className="font-semibold text-red-600">{overallProgress.failed}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(overallProgress.processed / totalPayments) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {batches.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Batch Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {batches.map((batch) => (
                <div
                  key={batch.batchNumber}
                  className={`p-4 rounded-lg border-2 ${
                    batch.status === 'completed'
                      ? 'border-green-500 bg-green-50'
                      : batch.status === 'processing'
                      ? 'border-blue-500 bg-blue-50'
                      : batch.status === 'error'
                      ? 'border-red-500 bg-red-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-slate-900">
                      Batch {batch.batchNumber}
                    </h3>
                    {batch.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    {batch.status === 'processing' && (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    )}
                    {batch.status === 'error' && (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Processed:</span>
                      <span className="font-semibold">{batch.processed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">Succeeded:</span>
                      <span className="font-semibold">{batch.succeeded}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">Failed:</span>
                      <span className="font-semibold">{batch.failed}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Activity Log</h2>
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
