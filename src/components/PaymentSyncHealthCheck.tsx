import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, ArrowLeft, AlertTriangle, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PaymentSyncHealthCheck() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState(50);

  const runHealthCheck = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment-sync-health`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ sampleSize })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'green';
      case 'warning': return 'yellow';
      case 'critical': return 'red';
      default: return 'gray';
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
        <h1 className="text-2xl font-bold mb-2">Payment Sync Health Check</h1>
        <p className="text-gray-600">
          Automatically verify payment sync accuracy by comparing database records with Acumatica
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sample Size (number of recent payments to check)
            </label>
            <input
              type="number"
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value) || 50)}
              min="10"
              max="200"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={runHealthCheck}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                Run Health Check
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-900">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Health Status */}
          <div className={`bg-white rounded-lg shadow p-6 border-l-4 border-${getHealthColor(result.healthStatus)}-500`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {result.healthStatus === 'healthy' && <CheckCircle className="w-5 h-5 text-green-600" />}
                {result.healthStatus === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
                {result.healthStatus === 'critical' && <XCircle className="w-5 h-5 text-red-600" />}
                Health Status: {result.healthStatus.charAt(0).toUpperCase() + result.healthStatus.slice(1)}
              </h2>
              <div className="text-right">
                <div className={`text-3xl font-bold text-${getHealthColor(result.healthStatus)}-600`}>
                  {result.syncRate}
                </div>
                <div className="text-sm text-gray-600">Sync Accuracy</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Total Checked</div>
                <div className="text-2xl font-bold text-gray-900">{result.totalChecked}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 mb-1">In Sync</div>
                <div className="text-2xl font-bold text-green-900">{result.inSync}</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-red-600 mb-1">Out of Sync</div>
                <div className="text-2xl font-bold text-red-900">{result.outOfSync}</div>
              </div>
            </div>

            <div className={`p-4 bg-${getHealthColor(result.healthStatus)}-50 border border-${getHealthColor(result.healthStatus)}-200 rounded-lg`}>
              <p className={`text-sm text-${getHealthColor(result.healthStatus)}-900`}>
                <strong>Recommendation:</strong> {result.recommendation}
              </p>
            </div>

            <div className="mt-4 text-xs text-gray-500">
              Check completed in {result.duration}
            </div>
          </div>

          {/* Mismatches */}
          {result.mismatches && result.mismatches.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                Mismatches Detected ({result.mismatches.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment Ref</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">DB Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acumatica Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Modified</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {result.mismatches.map((mismatch: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 whitespace-nowrap font-mono text-sm">{mismatch.paymentRef}</td>
                        <td className="px-4 py-2 text-sm">{mismatch.customerName}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                            {mismatch.dbStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                            {mismatch.acumaticaStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-mono">
                          {mismatch.acumaticaLastModified || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => navigate('/developer-tools/payment-date-range-resync')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  Bulk Resync These Payments
                </button>
              </div>
            </div>
          )}

          {/* Errors */}
          {result.errors && result.errors.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4 text-red-900">Errors Encountered</h3>
              <div className="space-y-2">
                {result.errors.map((err: any, idx: number) => (
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
