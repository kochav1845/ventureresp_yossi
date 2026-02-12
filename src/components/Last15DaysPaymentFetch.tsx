import React, { useState } from 'react';
import { ArrowLeft, Download, Calendar, AlertCircle, CheckCircle2, Loader2, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface BatchResult {
  batchNumber: number;
  startDate: string;
  endDate: string;
  created: number;
  updated: number;
  totalFetched: number;
  errors: string[];
  totalErrors: number;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
}

export default function Last15DaysPaymentFetch() {
  const [isLoading, setIsLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(15); // Days per batch
  const [batches, setBatches] = useState<BatchResult[]>([]);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [summary, setSummary] = useState<{
    totalCreated: number;
    totalUpdated: number;
    totalFetched: number;
    totalErrors: number;
  } | null>(null);
  const { showToast } = useToast();

  const calculateDateRanges = (days: number, batchSizeDays: number) => {
    const ranges: { startDate: Date; endDate: Date }[] = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // If batch size is >= total days, just do one batch
    if (batchSizeDays >= days) {
      ranges.push({ startDate, endDate });
      return ranges;
    }

    // Split into batches
    let currentStart = new Date(startDate);
    while (currentStart < endDate) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + batchSizeDays);

      if (currentEnd > endDate) {
        ranges.push({ startDate: new Date(currentStart), endDate });
        break;
      } else {
        ranges.push({ startDate: new Date(currentStart), endDate: new Date(currentEnd) });
        currentStart = new Date(currentEnd);
      }
    }

    return ranges;
  };

  const fetchBatch = async (startDate: Date, endDate: Date): Promise<any> => {
    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-payment-date-range-sync`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch batch');
    }

    return await response.json();
  };

  const startFetch = async () => {
    setIsLoading(true);
    setBatches([]);
    setSummary(null);
    setCurrentBatch(0);

    try {
      const ranges = calculateDateRanges(15, batchSize);

      // Initialize batches
      const initialBatches: BatchResult[] = ranges.map((range, index) => ({
        batchNumber: index + 1,
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
        created: 0,
        updated: 0,
        totalFetched: 0,
        errors: [],
        totalErrors: 0,
        status: 'pending',
      }));

      setBatches(initialBatches);

      let totalCreated = 0;
      let totalUpdated = 0;
      let totalFetched = 0;
      let totalErrors = 0;

      // Process each batch sequentially
      for (let i = 0; i < ranges.length; i++) {
        setCurrentBatch(i);

        // Update status to running
        setBatches(prev => prev.map((b, idx) =>
          idx === i ? { ...b, status: 'running' } : b
        ));

        try {
          const result = await fetchBatch(ranges[i].startDate, ranges[i].endDate);

          totalCreated += result.created || 0;
          totalUpdated += result.updated || 0;
          totalFetched += result.totalFetched || 0;
          totalErrors += result.totalErrors || 0;

          // Update batch with results
          setBatches(prev => prev.map((b, idx) =>
            idx === i ? {
              ...b,
              status: 'completed',
              created: result.created || 0,
              updated: result.updated || 0,
              totalFetched: result.totalFetched || 0,
              errors: result.errors || [],
              totalErrors: result.totalErrors || 0,
              message: result.message,
            } : b
          ));

          showToast(`Batch ${i + 1}/${ranges.length} completed: ${result.totalFetched} payments fetched`, 'success');
        } catch (error: any) {
          console.error(`Batch ${i + 1} failed:`, error);

          // Update batch with error
          setBatches(prev => prev.map((b, idx) =>
            idx === i ? {
              ...b,
              status: 'error',
              message: error.message,
            } : b
          ));

          showToast(`Batch ${i + 1} failed: ${error.message}`, 'error');
        }

        // Small delay between batches to avoid overwhelming the server
        if (i < ranges.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setSummary({
        totalCreated,
        totalUpdated,
        totalFetched,
        totalErrors,
      });

      showToast('Payment fetch completed!', 'success');
    } catch (error: any) {
      console.error('Fetch error:', error);
      showToast(error.message || 'Failed to fetch payments', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Last 15 Days Payment Fetch</h1>
              <p className="text-gray-600">Fetch payments from Acumatica from the last 15 days</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">Testing Tool</p>
                <p>This tool fetches payments modified in the last 15 days from Acumatica. You can adjust the batch size to control how many days are processed at once.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Batch Size (Days per Batch)
              </label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                disabled={isLoading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={15}>15 days (Single batch)</option>
                <option value={5}>5 days (3 batches)</option>
                <option value={3}>3 days (5 batches)</option>
                <option value={1}>1 day (15 batches)</option>
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Smaller batches reduce server load but take longer to complete
              </p>
            </div>

            <button
              onClick={startFetch}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing Batch {currentBatch + 1}/{batches.length}...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Start Fetch
                </>
              )}
            </button>
          </div>

          {summary && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-900">Fetch Completed</h3>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-green-700 font-medium">Total Fetched</p>
                  <p className="text-2xl font-bold text-green-900">{summary.totalFetched}</p>
                </div>
                <div>
                  <p className="text-green-700 font-medium">Created</p>
                  <p className="text-2xl font-bold text-green-900">{summary.totalCreated}</p>
                </div>
                <div>
                  <p className="text-green-700 font-medium">Updated</p>
                  <p className="text-2xl font-bold text-green-900">{summary.totalUpdated}</p>
                </div>
                <div>
                  <p className="text-green-700 font-medium">Errors</p>
                  <p className="text-2xl font-bold text-red-600">{summary.totalErrors}</p>
                </div>
              </div>
            </div>
          )}

          {batches.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Batch Progress</h2>
              <div className="space-y-3">
                {batches.map((batch) => (
                  <div
                    key={batch.batchNumber}
                    className={`border rounded-lg p-4 ${
                      batch.status === 'completed' ? 'bg-green-50 border-green-200' :
                      batch.status === 'error' ? 'bg-red-50 border-red-200' :
                      batch.status === 'running' ? 'bg-blue-50 border-blue-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {batch.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                        {batch.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                        {batch.status === 'running' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                        {batch.status === 'pending' && <Database className="w-5 h-5 text-gray-400" />}
                        <h3 className="font-medium text-gray-900">Batch {batch.batchNumber}</h3>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        batch.status === 'completed' ? 'bg-green-100 text-green-700' :
                        batch.status === 'error' ? 'bg-red-100 text-red-700' :
                        batch.status === 'running' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {batch.status}
                      </span>
                    </div>

                    <div className="text-sm text-gray-600 mb-2">
                      <p>{formatDate(batch.startDate)} → {formatDate(batch.endDate)}</p>
                    </div>

                    {batch.status === 'completed' && (
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500">Fetched</p>
                          <p className="font-semibold text-gray-900">{batch.totalFetched}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Created</p>
                          <p className="font-semibold text-green-600">{batch.created}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Updated</p>
                          <p className="font-semibold text-blue-600">{batch.updated}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Errors</p>
                          <p className="font-semibold text-red-600">{batch.totalErrors}</p>
                        </div>
                      </div>
                    )}

                    {batch.status === 'error' && batch.message && (
                      <p className="text-sm text-red-700 mt-2">{batch.message}</p>
                    )}

                    {batch.errors && batch.errors.length > 0 && (
                      <div className="mt-3 p-2 bg-red-100 rounded text-xs text-red-800">
                        <p className="font-medium mb-1">Errors:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {batch.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
