import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, AlertCircle } from 'lucide-react';

interface PaymentDiagnosticProps {
  onBack?: () => void;
}

export default function PaymentStructureDiagnostic({ onBack }: PaymentDiagnosticProps) {
  const navigate = useNavigate();
  const [paymentRef, setPaymentRef] = useState('000001');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const runDiagnostic = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const apiUrl = `${supabaseUrl}/functions/v1/diagnose-payment-structure?paymentRef=${paymentRef}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Structure Diagnostic</h1>
            <p className="text-sm text-gray-600">Inspect what fields are available in Acumatica payment objects</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Reference Number
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="000001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={runDiagnostic}
              disabled={loading || !paymentRef}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Analyzing...' : 'Diagnose'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Payment Reference</p>
                  <p className="font-medium text-gray-900">{result.paymentRef}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Type</p>
                  <p className="font-medium text-gray-900">{result.paymentType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">ApplicationHistory</p>
                  <p className="font-medium text-gray-900">
                    {result.applicationHistoryExists ? (
                      <span className="text-green-600">
                        Exists ({result.applicationHistoryType}, {result.applicationHistoryLength} items)
                      </span>
                    ) : (
                      <span className="text-red-600">Does not exist</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">DocumentsToApply</p>
                  <p className="font-medium text-gray-900">
                    {result.documentsToApplyExists ? (
                      <span className="text-green-600">
                        Exists ({result.documentsToApplyType}, {result.documentsToApplyLength} items)
                      </span>
                    ) : (
                      <span className="text-red-600">Does not exist</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">All Available Fields ({result.allKeys.length})</h2>
              <div className="flex flex-wrap gap-2">
                {result.allKeys.map((key: string) => (
                  <span
                    key={key}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-mono"
                  >
                    {key}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sample Fields</h2>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(result.sampleFields, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Full Payment Object</h2>
              <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-sm max-h-96">
                {JSON.stringify(result.fullPaymentObject, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
