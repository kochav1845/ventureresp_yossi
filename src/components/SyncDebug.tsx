import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';

interface SyncDebugProps {
  onBack?: () => void;
}

export default function SyncDebug({ onBack }: SyncDebugProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [lookbackMinutes, setLookbackMinutes] = useState(60);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const testSync = async () => {
    setLoading(true);
    setResult(null);

    try {
      // SECURITY: Credentials are handled server-side
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-customer-incremental-sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            lookbackMinutes,
          }),
        }
      );

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-3xl font-bold text-white mb-8">Sync Debug Tool</h1>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
          <div className="mb-4">
            <label className="block text-slate-400 mb-2">
              Lookback Window (minutes)
            </label>
            <input
              type="number"
              value={lookbackMinutes}
              onChange={(e) => setLookbackMinutes(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded text-white"
            />
            <p className="text-xs text-slate-500 mt-1">
              How far back to check for changes (increase this if you just added a customer)
            </p>
          </div>

          <button
            onClick={testSync}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg transition-colors"
          >
            {loading ? (
              <>Testing sync...</>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Test Customer Sync
              </>
            )}
          </button>
        </div>

        {result && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Result</h2>

            {result.error ? (
              <div className="bg-red-900/20 border border-red-700 rounded p-4 text-red-400">
                <strong>Error:</strong> {result.error}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-700/50 rounded p-4">
                    <div className="text-slate-400 text-sm">Total Fetched</div>
                    <div className="text-2xl font-bold text-white">{result.totalFetched || 0}</div>
                  </div>
                  <div className="bg-green-900/20 border border-green-700 rounded p-4">
                    <div className="text-green-400 text-sm">Created</div>
                    <div className="text-2xl font-bold text-green-400">{result.created || 0}</div>
                  </div>
                  <div className="bg-blue-900/20 border border-blue-700 rounded p-4">
                    <div className="text-blue-400 text-sm">Updated</div>
                    <div className="text-2xl font-bold text-blue-400">{result.updated || 0}</div>
                  </div>
                  <div className="bg-yellow-900/20 border border-yellow-700 rounded p-4">
                    <div className="text-yellow-400 text-sm">Skipped</div>
                    <div className="text-2xl font-bold text-yellow-400">{result.skipped || 0}</div>
                  </div>
                </div>

                {result.errors && result.errors.length > 0 && (
                  <div className="bg-red-900/20 border border-red-700 rounded p-4">
                    <h3 className="text-red-400 font-semibold mb-2">Errors:</h3>
                    <ul className="text-red-300 text-sm space-y-1">
                      {result.errors.map((err: string, i: number) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="bg-slate-700/50 rounded p-4">
                  <h3 className="text-white font-semibold mb-2">Analysis:</h3>
                  <div className="text-slate-300 text-sm space-y-2">
                    {result.skipped > 0 && result.created === 0 && result.updated === 0 && (
                      <div className="text-yellow-400">
                        All {result.skipped} records were older than {lookbackMinutes} minutes ago.
                        Try increasing the lookback window if you just added a customer.
                      </div>
                    )}
                    {result.totalFetched === 100 && (
                      <div className="text-blue-400">
                        Fetched the maximum 100 records. The sync is working correctly.
                      </div>
                    )}
                    {result.created > 0 && (
                      <div className="text-green-400">
                        Successfully created {result.created} new customer(s) in the database!
                      </div>
                    )}
                    {result.updated > 0 && (
                      <div className="text-blue-400">
                        Successfully updated {result.updated} existing customer(s)!
                      </div>
                    )}
                  </div>
                </div>

                <details className="bg-slate-700/30 rounded p-4">
                  <summary className="text-white cursor-pointer hover:text-blue-400">
                    View Full JSON Response
                  </summary>
                  <pre className="mt-4 text-xs text-slate-300 overflow-x-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
