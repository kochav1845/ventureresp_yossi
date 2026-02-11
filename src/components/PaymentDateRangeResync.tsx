import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, ArrowLeft, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function PaymentDateRangeResync() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncId, setSyncId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<any>(null);

  // Poll for progress updates
  useEffect(() => {
    if (!syncId || !loading) return;

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('sync_progress')
        .select('*')
        .eq('sync_id', syncId)
        .order('last_updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setLiveProgress(data);

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollInterval);
        }
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(pollInterval);
  }, [syncId, loading]);

  const resyncDateRange = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(null);
    setSyncId(null);
    setLiveProgress(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resync-payment-date-range`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ startDate, endDate })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setSyncId(data.syncId);
      setProgress(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-bold mb-2">Payment Date Range Resync</h1>
        <p className="text-gray-600">
          Resync all payments within a specific date range to fix any mismatches
        </p>
      </div>

      {/* Date Range Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        {/* Quick Select Buttons */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quick Select
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 30);
                setStartDate(start.toISOString().split('T')[0]);
                setEndDate(end.toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setMonth(start.getMonth() - 3);
                setStartDate(start.toISOString().split('T')[0]);
                setEndDate(end.toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Last 3 Months
            </button>
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setMonth(start.getMonth() - 6);
                setStartDate(start.toISOString().split('T')[0]);
                setEndDate(end.toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Last 6 Months
            </button>
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date(end.getFullYear(), 0, 1);
                setStartDate(start.toISOString().split('T')[0]);
                setEndDate(end.toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              This Year
            </button>
            <button
              onClick={() => {
                const end = new Date();
                end.setFullYear(end.getFullYear() - 1);
                end.setMonth(11, 31);
                const start = new Date(end.getFullYear(), 0, 1);
                setStartDate(start.toISOString().split('T')[0]);
                setEndDate(end.toISOString().split('T')[0]);
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Last Year
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <button
          onClick={resyncDateRange}
          disabled={loading || !startDate || !endDate}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Resyncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              Resync Payments in Date Range
            </>
          )}
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
            <div className="flex-1">
              <p className="font-medium text-blue-900">Syncing payments...</p>
              <p className="text-blue-700 text-sm">
                Fetching both Payment and Voided Payment records from Acumatica. This may take a moment.
              </p>
              {liveProgress && (
                <div className="mt-2 space-y-1">
                  <p className="text-blue-800 text-sm font-medium">
                    Progress: {liveProgress.processed_items} / {liveProgress.total_items} payments
                  </p>
                  {liveProgress.current_item && (
                    <p className="text-blue-600 text-xs font-mono">
                      Currently processing: {liveProgress.current_item}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          {liveProgress && liveProgress.total_items > 0 ? (
            <div className="bg-blue-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300"
                style={{ width: `${(liveProgress.processed_items / liveProgress.total_items) * 100}%` }}
              ></div>
            </div>
          ) : (
            <div className="bg-blue-100 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-600 h-full w-full animate-pulse"></div>
            </div>
          )}
          <p className="text-blue-600 text-xs mt-2">Please wait, do not close this page...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-900">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Resync Complete
            </h2>

{progress.message && (
              <div className={`${
                progress.totalProcessed === 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'
              } border rounded-lg p-4 mb-4`}>
                <p className={`${
                  progress.totalProcessed === 0 ? 'text-yellow-800' : 'text-blue-800'
                } font-medium`}>
                  {progress.message}
                </p>
                {progress.totalProcessed === 0 && (
                  <p className="text-yellow-700 text-sm mt-1">
                    No payments found in the date range {startDate} to {endDate}.
                    Try selecting a different date range.
                  </p>
                )}
                {progress.totalInRange && progress.totalInRange > progress.totalProcessed && (
                  <p className="text-blue-700 text-sm mt-1">
                    {progress.totalInRange - progress.totalProcessed} payments remaining. Click the button again to process more.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 mb-1">Total Processed</div>
                <div className="text-2xl font-bold text-blue-900">{progress.totalProcessed}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 mb-1">Successfully Updated</div>
                <div className="text-2xl font-bold text-green-900">{progress.successCount}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-red-600 mb-1">Errors</div>
                <div className="text-2xl font-bold text-red-900">{progress.errorCount}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              Duration: {progress.duration}
            </div>
          </div>

          {/* Status Changes */}
          {progress.statusChanges && progress.statusChanges.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4">Status Changes Detected</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment Ref</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Old Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">New Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {progress.statusChanges.map((change: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 whitespace-nowrap font-mono text-sm">{change.paymentRef}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                            {change.type || 'Payment'}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                            {change.oldStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                            {change.newStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">{change.customerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Errors */}
          {progress.errors && progress.errors.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4 text-red-900">Errors Encountered</h3>
              <div className="space-y-2">
                {progress.errors.map((err: any, idx: number) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                    <span className="font-mono text-red-900">{err.paymentRef}:</span>
                    <span className="text-red-700 ml-2">{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
