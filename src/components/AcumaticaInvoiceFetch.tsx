import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, AlertCircle } from 'lucide-react';

interface AcumaticaInvoiceFetchProps {
  onBack?: () => void;
}

export default function AcumaticaInvoiceFetch({ onBack }: AcumaticaInvoiceFetchProps) {
  // SECURITY: Credentials are stored in edge functions, NOT in frontend code

  const [batchSize, setBatchSize] = useState(100);
  const [startFrom, setStartFrom] = useState(0);
  const [endAt, setEndAt] = useState(1000);
  const [statusFilter, setStatusFilter] = useState<'open-balanced' | 'all' | 'closed-only'>('open-balanced');
  const [fetchNewestFirst, setFetchNewestFirst] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleBulkFetch = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setProgress('Starting bulk fetch...');

    try {
      let totalFetched = 0;
      let totalSaved = 0;
      let skip = startFrom;
      const totalToFetch = endAt - startFrom;
      const allErrors: string[] = [];

      while (totalFetched < totalToFetch && skip < endAt) {
        const count = Math.min(batchSize, endAt - skip);

        setProgress(`Fetching batch ${Math.floor((skip - startFrom) / batchSize) + 1}... (${skip} to ${skip + count}) - ${totalSaved} saved`);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-invoice-bulk-fetch`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              count,
              skip,
              statusFilter,
              fetchNewestFirst,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch invoices');
        }

        totalFetched += result.totalFetched;
        totalSaved += result.savedCount;

        if (result.errors) {
          allErrors.push(...result.errors);
        }

        if (result.totalFetched < count) {
          setProgress(`Completed! No more invoices available.`);
          break;
        }

        skip += count;
      }

      setSuccess(
        `Successfully fetched and saved ${totalSaved} invoices!${
          allErrors.length > 0 ? ` (${allErrors.length} errors encountered)` : ''
        }`
      );

      if (allErrors.length > 0) {
        console.error('Errors during fetch:', allErrors);
      }

      setProgress('');
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching invoices');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Invoices
        </button>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
          <h1 className="text-2xl font-bold text-white mb-6">Bulk Fetch Acumatica Invoices</h1>

          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <p className="text-sm text-slate-400">
                Using Acumatica credentials stored securely in database
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Configure credentials in Sync Configuration settings
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Batch Size
                </label>
                <input
                  type="number"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                  min="1"
                  max="1000"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Invoices per API call (1-1000)</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Start From (Skip)
                  </label>
                  <input
                    type="number"
                    value={startFrom}
                    onChange={(e) => setStartFrom(parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Start at invoice # (e.g., 1000)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    End At
                  </label>
                  <input
                    type="number"
                    value={endAt}
                    onChange={(e) => setEndAt(parseInt(e.target.value) || 1000)}
                    min="1"
                    className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Stop at invoice # (e.g., 2000)</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Invoice Status Filter
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'open-balanced' | 'all' | 'closed-only')}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="open-balanced">Open & Balanced Only (10,300 invoices)</option>
                  <option value="all">All Statuses (63,654 invoices)</option>
                  <option value="closed-only">Closed Only (52,476 invoices)</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">Select which invoice statuses to fetch from Acumatica</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fetchNewestFirst}
                    onChange={(e) => setFetchNewestFirst(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                  />
                  Fetch Newest First
                </label>
                <p className="text-xs text-slate-500 mt-1">Fetch recent invoices first (sorted by date descending)</p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-blue-400 text-sm">
                  Will fetch <span className="font-bold">{statusFilter === 'open-balanced' ? 'Open & Balanced' : statusFilter === 'closed-only' ? 'Closed Only' : 'All Status'}</span> invoices from <span className="font-bold">{startFrom}</span> to <span className="font-bold">{endAt}</span> ({endAt - startFrom} total), sorted {fetchNewestFirst ? 'newest first' : 'oldest first'}
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Download className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}

            {progress && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-blue-400 text-sm">{progress}</p>
              </div>
            )}

            <button
              onClick={handleBulkFetch}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Fetching Invoices...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Start Bulk Fetch
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
