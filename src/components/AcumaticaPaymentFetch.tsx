import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, AlertCircle, CheckCircle, RefreshCw, Database, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AcumaticaPaymentFetchProps {
  onBack?: () => void;
}

export default function AcumaticaPaymentFetch({ onBack }: AcumaticaPaymentFetchProps) {
  const navigate = useNavigate();

  const [batchSize, setBatchSize] = useState(50);
  const [startFrom, setStartFrom] = useState(0);
  const [totalToFetch, setTotalToFetch] = useState(200);
  const [docType, setDocType] = useState<'Payment' | 'Credit Memo'>('Payment');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [syncingLinks, setSyncingLinks] = useState(false);
  const [fetchingMissing, setFetchingMissing] = useState(false);
  const [fetchingPrepayments, setFetchingPrepayments] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleBulkFetch = async () => {
    setLoading(true);
    setError('');
    setLogs([]);
    addLog('Starting payment fetch...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      let totalFetched = 0;
      let totalSaved = 0;
      let totalInvoiceLinks = 0;
      let skip = startFrom;
      const batchCount = Math.ceil(totalToFetch / batchSize);

      for (let i = 0; i < batchCount; i++) {
        const currentBatch = i + 1;
        const count = Math.min(batchSize, totalToFetch - totalFetched);

        setProgress(`Batch ${currentBatch}/${batchCount}: Fetching ${count} payments (skip: ${skip})...`);
        addLog(`Fetching batch ${currentBatch}/${batchCount}: ${count} payments starting at ${skip}`);

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-payment-bulk-fetch`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                count,
                skip,
                docType,
                fetchNewestFirst: true,
                fetchApplicationHistory: true,
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            addLog(`❌ Error: ${errorData.error || 'Failed to fetch'}`);
            if (errorData.details) {
              console.error('Error details:', errorData.details);
            }
            throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch payments`);
          }

          const result = await response.json();

          if (!result.success) {
            addLog(`❌ Batch failed: ${result.error}`);
            throw new Error(result.error || 'Batch processing failed');
          }

          totalFetched += result.totalFetched;
          const savedCount = (result.created || 0) + (result.updated || 0);
          totalSaved += savedCount;
          totalInvoiceLinks += result.invoiceLinksCreated || 0;

          addLog(`✅ Batch ${currentBatch} complete: Saved ${savedCount} payments (${result.created || 0} created, ${result.updated || 0} updated), Created ${result.invoiceLinksCreated || 0} invoice links (${(result.durationMs / 1000).toFixed(1)}s)`);

          if (result.errors && result.errors.length > 0) {
            addLog(`⚠️ Warnings: ${result.errors.join(', ')}`);
          }

          if (result.totalFetched < count) {
            addLog('📍 No more payments available');
            break;
          }

          skip += count;

          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (batchError: any) {
          addLog(`❌ Batch ${currentBatch} failed: ${batchError.message}`);
          throw batchError;
        }
      }

      setProgress('');
      addLog(`✨ Complete! Fetched ${totalFetched} payments, Saved ${totalSaved}, Created ${totalInvoiceLinks} invoice links`);

    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching payments');
      addLog(`🔴 Fatal error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncApplicationHistory = async () => {
    setSyncingLinks(true);
    setError('');
    addLog('Starting application history sync from existing payments...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-invoice-links-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to sync`);
      }

      const result = await response.json();

      if (result.success) {
        addLog(`✨ Successfully synced! Created ${result.total_links_created} invoice links from ${result.total_payments_processed} payments`);
      } else {
        throw new Error(result.error || 'Sync failed');
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred while syncing application history');
      addLog(`🔴 Error: ${err.message}`);
    } finally {
      setSyncingLinks(false);
    }
  };

  const handleFetchMissingHistory = async () => {
    setFetchingMissing(true);
    setError('');
    addLog('Fetching missing application history from Acumatica...');
    addLog('⚠️ This may take several minutes for large datasets');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resync-payments-without-applications`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch`);
      }

      const result = await response.json();

      if (result.success) {
        addLog(`✨ ${result.message}`);
        addLog(`📊 Processed ${result.payments_processed} payments, created ${result.applications_created} invoice links`);
      } else {
        throw new Error(result.error || 'Fetch failed');
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching missing application history');
      addLog(`🔴 Error: ${err.message}`);
    } finally {
      setFetchingMissing(false);
    }
  };

  const handleFetchAllPrepayments = async () => {
    setFetchingPrepayments(true);
    setError('');
    addLog('Fetching ALL prepayments from Acumatica...');
    addLog('⚠️ This may take several minutes depending on the number of prepayments');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-all-prepayments`;
      addLog(`📡 Calling: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch prepayments`);
      }

      const result = await response.json();

      if (result.success) {
        addLog(`✨ Prepayment fetch complete!`);
        addLog(`📊 Total fetched: ${result.totalFetched}, Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`);
        if (result.totalErrors > 0) {
          addLog(`⚠️ ${result.totalErrors} errors occurred`);
        }
        addLog(`⏱️ Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
      } else {
        throw new Error(result.error || 'Fetch failed');
      }

    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching prepayments');
      addLog(`🔴 Error: ${err.message}`);
    } finally {
      setFetchingPrepayments(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Payments
        </button>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
          <h1 className="text-2xl font-bold text-white mb-6">Bulk Fetch Acumatica Payments</h1>

          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-blue-400 text-sm">
                <strong>🔒 Secure:</strong> Acumatica credentials are stored securely on the server and never exposed to the browser.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as 'Payment' | 'Credit Memo')}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  disabled={loading}
                >
                  <option value="Payment">Payment</option>
                  <option value="Credit Memo">Credit Memo</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Batch Size
                </label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.min(50, parseInt(e.target.value) || 50))}
                  min="10"
                  max="50"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Start From (Skip)
                </label>
                <input
                  type="number"
                  value={startFrom}
                  onChange={(e) => setStartFrom(parseInt(e.target.value) || 0)}
                  min="0"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Total to Fetch
                </label>
                <input
                  type="number"
                  value={totalToFetch}
                  onChange={(e) => setTotalToFetch(parseInt(e.target.value) || 200)}
                  min="1"
                  max="1000"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-blue-400 text-sm">
                Will fetch <strong>{totalToFetch}</strong> {docType === 'Payment' ? 'payments' : 'credit memos'}
                {' '}starting from record <strong>{startFrom}</strong> in batches of <strong>{batchSize}</strong>
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {progress && (
              <div className="p-4 bg-slate-900 border border-slate-700 rounded-lg">
                <p className="text-slate-300 text-sm">{progress}</p>
                <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 animate-pulse" style={{ width: '100%' }}></div>
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Activity Log</h3>
                <div className="space-y-1 font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className={`${
                      log.includes('✅') ? 'text-green-400' :
                      log.includes('❌') || log.includes('🔴') ? 'text-red-400' :
                      log.includes('⚠️') ? 'text-yellow-400' :
                      log.includes('✨') ? 'text-blue-400' :
                      'text-slate-400'
                    }`}>
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <button
                onClick={handleBulkFetch}
                disabled={loading || syncingLinks || fetchingMissing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Fetching Payments...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Fetch New Payments from Acumatica
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleSyncApplicationHistory}
                  disabled={loading || syncingLinks || fetchingMissing}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  title="Extract invoice links from payments that already have application history stored"
                >
                  {syncingLinks ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      Sync Existing History
                    </>
                  )}
                </button>

                <button
                  onClick={handleFetchMissingHistory}
                  disabled={loading || syncingLinks || fetchingMissing}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  title="Fetch application history from Acumatica for payments missing it (processes 100 at a time)"
                >
                  {fetchingMissing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Database className="w-5 h-5" />
                      Fetch Missing History
                    </>
                  )}
                </button>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <p className="text-amber-400 text-sm">
                  <strong>Tip:</strong> Use "Sync Existing History" first (fast). If payments are still missing links, use "Fetch Missing History" to retrieve from Acumatica (slower, processes 100 payments per run).
                </p>
              </div>

              <div className="border-t border-slate-700 pt-4 mt-4">
                <h3 className="text-lg font-semibold text-white mb-3">Prepayments</h3>
                <button
                  onClick={handleFetchAllPrepayments}
                  disabled={loading || syncingLinks || fetchingMissing || fetchingPrepayments}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                  title="Fetch all prepayments from Acumatica including their application history"
                >
                  {fetchingPrepayments ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Fetching Prepayments...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Fetch All Prepayments from Acumatica
                    </>
                  )}
                </button>
                <p className="text-slate-400 text-sm mt-2">
                  Fetches all prepayments from Acumatica and syncs their application history. The cron job will continue syncing prepayments automatically going forward.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
