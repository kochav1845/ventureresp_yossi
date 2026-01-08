import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Calendar } from 'lucide-react';

interface ApplicationDateDiagnosticProps {
  onBack?: () => void;
}

export default function ApplicationDateDiagnostic({ onBack }: ApplicationDateDiagnosticProps) {
  const [paymentRef, setPaymentRef] = useState('022543');
  const [paymentType, setPaymentType] = useState('Payment');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const diagnose = async () => {
    setLoading(true);
    setResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnose-application-dates?paymentRef=${paymentRef}&type=${paymentType}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold">Application Date Diagnostic</h1>
          </div>

          <p className="text-slate-300 mb-6">
            This tool shows ALL date fields returned by Acumatica's Payment ApplicationHistory to help identify which field contains the actual invoice date.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Reference Number
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g., 022543"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Type
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Payment">Payment</option>
                <option value="Credit Memo">Credit Memo</option>
                <option value="Prepayment">Prepayment</option>
              </select>
            </div>
          </div>

          <button
            onClick={diagnose}
            disabled={loading || !paymentRef}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
              loading || !paymentRef
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/50'
            }`}
          >
            <Search className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Fetching from Acumatica...' : 'Diagnose Date Fields'}
          </button>

          {result && (
            <div className="mt-8">
              {result.success ? (
                <div className="space-y-6">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-green-400 font-semibold mb-2">Successfully fetched payment data</p>
                    <p className="text-slate-300">Payment: {result.payment_reference} ({result.payment_type})</p>
                    <p className="text-slate-300">Applications Found: {result.application_count}</p>
                  </div>

                  {result.diagnostic_data && result.diagnostic_data.map((app: any, idx: number) => (
                    <div key={idx} className="bg-slate-700/50 border border-slate-600 rounded-lg p-6">
                      <div className="mb-4 pb-4 border-b border-slate-600">
                        <h3 className="text-xl font-bold text-blue-400 mb-2">
                          Application #{idx + 1}
                        </h3>
                        <p className="text-slate-300">
                          <span className="font-semibold">Invoice:</span> {app.doc_type} - {app.invoice_ref}
                        </p>
                        <p className="text-slate-300">
                          <span className="font-semibold">Amount Paid:</span> ${parseFloat(app.amount_paid || 0).toFixed(2)}
                        </p>
                      </div>

                      <div className="mb-6">
                        <h4 className="text-lg font-semibold text-yellow-400 mb-3">Common Date Fields:</h4>
                        <div className="grid md:grid-cols-2 gap-3">
                          <div className="bg-slate-800 rounded p-3">
                            <p className="text-slate-400 text-sm">Date</p>
                            <p className="text-white font-mono">{app.Date || 'null'}</p>
                          </div>
                          <div className="bg-slate-800 rounded p-3">
                            <p className="text-slate-400 text-sm">DocDate</p>
                            <p className="text-white font-mono">{app.DocDate || 'null'}</p>
                          </div>
                          <div className="bg-slate-800 rounded p-3">
                            <p className="text-slate-400 text-sm">DueDate</p>
                            <p className="text-white font-mono">{app.DueDate || 'null'}</p>
                          </div>
                          <div className="bg-slate-800 rounded p-3">
                            <p className="text-slate-400 text-sm">AdjdDocDate</p>
                            <p className="text-white font-mono">{app.AdjdDocDate || 'null'}</p>
                          </div>
                          <div className="bg-slate-800 rounded p-3">
                            <p className="text-slate-400 text-sm">AdjgDocDate</p>
                            <p className="text-white font-mono">{app.AdjgDocDate || 'null'}</p>
                          </div>
                          <div className="bg-slate-800 rounded p-3">
                            <p className="text-slate-400 text-sm">ApplicationDate</p>
                            <p className="text-white font-mono">{app.ApplicationDate || 'null'}</p>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-lg font-semibold text-purple-400 mb-3">All Fields with Values:</h4>
                        <div className="bg-slate-800 rounded p-4 max-h-96 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b border-slate-600">
                              <tr>
                                <th className="text-left py-2 text-slate-300">Field Name</th>
                                <th className="text-left py-2 text-slate-300">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {app.all_fields
                                .filter((f: any) => f.has_value)
                                .map((field: any, fIdx: number) => (
                                  <tr key={fIdx} className="border-b border-slate-700/50">
                                    <td className="py-2 text-blue-300 font-mono">{field.field}</td>
                                    <td className="py-2 text-white font-mono">{field.value}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}

                  <details className="bg-slate-700/30 border border-slate-600 rounded-lg p-4">
                    <summary className="cursor-pointer font-semibold text-slate-300 hover:text-white">
                      View Raw JSON Response
                    </summary>
                    <pre className="mt-4 p-4 bg-slate-900 rounded overflow-x-auto text-xs text-green-400">
                      {JSON.stringify(result.raw_application_history, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-400 font-semibold">Error</p>
                  <p className="text-slate-300">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
