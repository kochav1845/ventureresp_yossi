import React, { useState } from 'react';
import { Search, RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function PaymentStatusDiagnostic() {
  const [paymentRef, setPaymentRef] = useState('025670');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const diagnosePayment = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnose-single-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ paymentRef })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Payment Status Diagnostic</h1>
        <p className="text-gray-600">
          Compare payment status between Acumatica and our database
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Reference Number
            </label>
            <input
              type="text"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 025670"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={diagnosePayment}
              disabled={loading || !paymentRef}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Diagnose
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Status Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              {result.comparison.statusMismatch ? (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  Status Mismatch Detected
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Status Match
                </>
              )}
            </h2>

            <div className="grid grid-cols-2 gap-6">
              <div className={`p-4 rounded-lg ${
                result.comparison.statusMismatch ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
              }`}>
                <h3 className="font-medium text-gray-900 mb-2">Acumatica (Source of Truth)</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`ml-2 font-semibold ${
                      result.comparison.acumaticaStatus === 'Closed' ? 'text-green-700' :
                      result.comparison.acumaticaStatus === 'Balanced' ? 'text-blue-700' :
                      'text-gray-700'
                    }`}>
                      {result.comparison.acumaticaStatus || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Last Modified:</span>
                    <span className="ml-2 font-mono text-sm">
                      {result.comparison.acumaticaLastModified || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${
                result.comparison.statusMismatch ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
              }`}>
                <h3 className="font-medium text-gray-900 mb-2">Our Database (Outdated)</h3>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`ml-2 font-semibold ${
                      result.comparison.storedStatus === 'Closed' ? 'text-green-700' :
                      result.comparison.storedStatus === 'Balanced' ? 'text-blue-700' :
                      'text-gray-700'
                    }`}>
                      {result.comparison.storedStatus || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Last Synced:</span>
                    <span className="ml-2 font-mono text-sm">
                      {result.comparison.storedLastSync ?
                        new Date(result.comparison.storedLastSync).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {result.comparison.statusMismatch && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-900">
                  <strong>Issue:</strong> The status in Acumatica has changed since our last sync.
                  The incremental sync uses the LastModifiedDateTime field to detect changes.
                  If Acumatica didn't update this field when the status changed, our sync won't pick it up automatically.
                </p>
              </div>
            )}
          </div>

          {/* Raw Data */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-medium text-gray-900 mb-3">Acumatica Raw Data</h3>
              <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(result.acumaticaData, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-medium text-gray-900 mb-3">Stored Data</h3>
              <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(result.storedData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
