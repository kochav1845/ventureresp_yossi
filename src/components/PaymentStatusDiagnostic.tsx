import React, { useState } from 'react';
import { Search, RefreshCw, AlertCircle, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PaymentStatusDiagnostic() {
  const navigate = useNavigate();
  const [paymentRef, setPaymentRef] = useState('025670');
  const [loading, setLoading] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [resyncSuccess, setResyncSuccess] = useState<string | null>(null);

  const diagnosePayment = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setResyncSuccess(null);

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

  const resyncPayment = async () => {
    setResyncing(true);
    setError(null);
    setResyncSuccess(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resync-single-payment`,
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
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResyncSuccess(`Successfully resynced payment ${paymentRef}. Status updated to: ${data.updatedStatus}`);

      setTimeout(() => {
        diagnosePayment();
      }, 1000);
    } catch (err: any) {
      setError(`Resync failed: ${err.message}`);
    } finally {
      setResyncing(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header with Back Button */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-bold mb-2">Payment Status Diagnostic</h1>
        <p className="text-gray-600">
          Compare payment data between Acumatica and our database
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
              onKeyDown={(e) => e.key === 'Enter' && diagnosePayment()}
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
          <div className="flex-1">
            <p className="font-medium text-red-900">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Success */}
      {resyncSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-green-900">Resync Successful</p>
            <p className="text-green-700 text-sm">{resyncSuccess}</p>
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
                    <span className="ml-2 font-mono text-xs">
                      {result.comparison.acumaticaLastModified || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${
                result.comparison.statusMismatch ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
              }`}>
                <h3 className="font-medium text-gray-900 mb-2">Our Database</h3>
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
                    <span className="ml-2 font-mono text-xs">
                      {result.comparison.storedLastSync ?
                        new Date(result.comparison.storedLastSync).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {result.comparison.statusMismatch && (
              <div className="mt-4 space-y-3">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-900">
                    <strong>Issue:</strong> The status in Acumatica has changed since our last sync.
                    The incremental sync uses the LastModifiedDateTime field to detect changes.
                    If Acumatica didn't update this field when the status changed, our sync won't pick it up automatically.
                  </p>
                </div>
                <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div>
                    <p className="font-medium text-blue-900">Fix This Issue</p>
                    <p className="text-sm text-blue-700">Manually resync this payment to update it with current Acumatica data</p>
                  </div>
                  <button
                    onClick={resyncPayment}
                    disabled={resyncing}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {resyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Resyncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Resync This Payment
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Application History Comparison */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              {result.comparison.applicationCountMismatch ? (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  Application Count Mismatch
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Application Count Match
                </>
              )}
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-4">
              <div className={`p-4 rounded-lg ${
                result.comparison.applicationCountMismatch ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
              }`}>
                <h3 className="font-medium text-gray-900 mb-2">Acumatica Applications</h3>
                <div className="text-2xl font-bold text-gray-900">
                  {result.comparison.acumaticaApplicationCount}
                </div>
              </div>

              <div className={`p-4 rounded-lg ${
                result.comparison.applicationCountMismatch ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
              }`}>
                <h3 className="font-medium text-gray-900 mb-2">Database Applications</h3>
                <div className="text-2xl font-bold text-gray-900">
                  {result.comparison.dbApplicationCount}
                </div>
              </div>
            </div>

            {result.comparison.applicationCountMismatch && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-900">
                  <strong>Issue:</strong> The number of application records differs between Acumatica and our database.
                  This may indicate incomplete syncing or changes in Acumatica that haven't been reflected yet.
                </p>
              </div>
            )}

            {/* Application History Details */}
            {result.acumaticaData?.ApplicationHistory && result.acumaticaData.ApplicationHistory.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-900 mb-2">Acumatica Application History:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Doc Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref Number</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {result.acumaticaData.ApplicationHistory.map((app: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 whitespace-nowrap">{app.DocType?.value}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono">{app.ReferenceNbr?.value}</td>
                          <td className="px-3 py-2 whitespace-nowrap">${parseFloat(app.AmountPaid?.value || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">${parseFloat(app.Balance?.value || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Database Applications */}
            {result.dbApplications && result.dbApplications.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-900 mb-2">Database Applications:</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Doc Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref Number</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {result.dbApplications.map((app: any) => (
                        <tr key={app.id}>
                          <td className="px-3 py-2 whitespace-nowrap">{app.doc_type}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono">{app.reference_number}</td>
                          <td className="px-3 py-2 whitespace-nowrap">${parseFloat(app.amount_paid || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">${parseFloat(app.balance || 0).toFixed(2)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(app.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Raw Data */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-medium text-gray-900 mb-3">Acumatica Raw Data</h3>
              <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-96 font-mono">
                {JSON.stringify(result.acumaticaData, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-medium text-gray-900 mb-3">Stored Data</h3>
              <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-96 font-mono">
                {JSON.stringify(result.storedData, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
