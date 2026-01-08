import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Database, Cloud } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CountData {
  acumatica_count: number;
  database_count: number;
  difference: number;
  sync_percentage: string;
}

interface PaymentCountComparisonProps {
  onBack?: () => void;
}

export default function PaymentCountComparison({ onBack }: PaymentCountComparisonProps) {
  const [loading, setLoading] = useState(false);
  const [countData, setCountData] = useState<CountData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-payment-count`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch payment counts');
      }

      const data = await response.json();
      setCountData(data);
    } catch (err: any) {
      console.error('Error fetching counts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Payment Count Comparison
          </h1>
          <p className="text-slate-600 mb-8">
            Compare payment counts between Acumatica and your local database
          </p>

          <button
            onClick={fetchCounts}
            disabled={loading}
            className="mb-8 flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Fetching Counts...' : 'Fetch Counts'}
          </button>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {countData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-blue-600 rounded-lg">
                      <Cloud className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-blue-900">
                      Acumatica
                    </h3>
                  </div>
                  <p className="text-4xl font-bold text-blue-900">
                    {countData.acumatica_count.toLocaleString()}
                  </p>
                  <p className="text-sm text-blue-700 mt-2">Total payments in Acumatica</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-600 rounded-lg">
                      <Database className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-green-900">
                      Local Database
                    </h3>
                  </div>
                  <p className="text-4xl font-bold text-green-900">
                    {countData.database_count.toLocaleString()}
                  </p>
                  <p className="text-sm text-green-700 mt-2">Payments synced locally</p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Sync Progress</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-slate-900">
                        {countData.sync_percentage}%
                      </p>
                    </div>
                    <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(parseFloat(countData.sync_percentage), 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-slate-600 mb-1">Difference</p>
                    <div className="flex items-baseline gap-2">
                      <p className={`text-3xl font-bold ${
                        countData.difference > 0 ? 'text-orange-600' : 'text-green-600'
                      }`}>
                        {countData.difference > 0 ? '+' : ''}{countData.difference.toLocaleString()}
                      </p>
                    </div>
                    <p className="text-sm text-slate-600 mt-3">
                      {countData.difference > 0
                        ? `${countData.difference.toLocaleString()} payments not yet synced`
                        : countData.difference < 0
                        ? 'Database has more payments than Acumatica'
                        : 'Fully synced!'}
                    </p>
                  </div>
                </div>
              </div>

              {countData.difference > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800 text-sm">
                    <strong>Note:</strong> There are {countData.difference.toLocaleString()} payments in Acumatica that haven't been synced yet.
                    The automatic sync will continue to fetch new payments every 5 minutes.
                  </p>
                </div>
              )}
            </div>
          )}

          {!countData && !loading && !error && (
            <div className="text-center py-12">
              <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Click "Fetch Counts" to compare payment data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
