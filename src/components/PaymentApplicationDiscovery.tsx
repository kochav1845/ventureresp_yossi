import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, AlertCircle, CheckCircle } from 'lucide-react';

interface PaymentApplicationDiscoveryProps {
  onBack?: () => void;
}

export default function PaymentApplicationDiscovery({ onBack }: PaymentApplicationDiscoveryProps) {
  // SECURITY: Credentials are stored in edge functions, NOT in frontend code

  const [paymentRefNbr, setPaymentRefNbr] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleDiscover = async () => {
    if (!paymentRefNbr.trim()) {
      setError('Please enter a payment reference number');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-payment-discover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            paymentRefNbr: paymentRefNbr.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to discover payment applications');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while discovering payment applications');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscoverFirst = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-payment-discover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company: company || undefined,
            branch: branch || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to discover payment applications');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while discovering payment applications');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-6">
          <h1 className="text-2xl font-bold text-white mb-6">Payment Application Discovery</h1>

          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Acumatica URL:</span>
                  <span className="text-slate-300 font-mono">{acumaticaUrl}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Username:</span>
                  <span className="text-slate-300 font-mono">{username || 'Not set'}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Using credentials from environment variables
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Reference Number (Optional)
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={paymentRefNbr}
                  onChange={(e) => setPaymentRefNbr(e.target.value)}
                  placeholder="e.g., 000140"
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleDiscover}
                  disabled={loading || !paymentRefNbr.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Discovering...
                    </>
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      Discover
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Enter a payment reference number to fetch its application history
              </p>
            </div>

            <div className="text-center py-2">
              <span className="text-slate-500">— OR —</span>
            </div>

            <button
              onClick={handleDiscoverFirst}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Discovering...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Discover First Payment
                </>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {result && (
              <div className="flex items-start gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-green-400 text-sm font-medium mb-2">
                    Payment discovered successfully!
                  </p>
                  <p className="text-slate-300 text-sm">
                    Payment: {result.payment?.ReferenceNbr?.value || 'N/A'} |
                    Applied Documents: {result.appliedDocumentsCount}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {result && (
          <div className="space-y-6">
            {result.fetchAttempts && result.fetchAttempts.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Fetch Attempts</h2>
                <div className="space-y-2">
                  {result.fetchAttempts.map((attempt: string, index: number) => (
                    <div key={index} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                      <p className="text-sm font-mono text-slate-300">{attempt}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Applied Documents ({result.appliedDocumentsCount})</h2>

              {result.appliedDocumentsCount > 0 ? (
                <div className="space-y-4">
                  {result.appliedDocuments.map((doc: any, index: number) => (
                    <div key={index} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                      <h3 className="text-lg font-medium text-white mb-3">Document {index + 1}</h3>
                      <div className="grid md:grid-cols-2 gap-3">
                        {Object.entries(doc).map(([key, value]: [string, any]) => {
                          let displayValue = value;
                          if (value && typeof value === 'object' && 'value' in value) {
                            displayValue = value.value;
                          }

                          return (
                            <div key={key}>
                              <span className="text-slate-400 text-sm">{key}:</span>
                              <p className="text-white text-sm font-mono break-all">
                                {displayValue === null || displayValue === undefined
                                  ? 'N/A'
                                  : typeof displayValue === 'object'
                                  ? JSON.stringify(displayValue)
                                  : String(displayValue)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">No applied documents found for this payment</p>
              )}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Applied Documents Structure</h2>
              <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-x-auto">
                <code className="text-sm text-slate-300">
                  {JSON.stringify(result.appliedDocumentsStructure, null, 2)}
                </code>
              </pre>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Complete Payment Data</h2>
              <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-x-auto max-h-96">
                <code className="text-sm text-slate-300">
                  {JSON.stringify(result.payment, null, 2)}
                </code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
