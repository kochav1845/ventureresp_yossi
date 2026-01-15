import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InvoiceTestResult {
  referenceNumber: string;
  paddedVersion: string;
  unpaddedVersion: string;
  acumaticaResults: {
    padded: any | null;
    unpadded: any | null;
  };
  databaseResults: {
    padded: any | null;
    unpadded: any | null;
  };
  hasDuplicates: boolean;
}

export default function InvoiceReferenceNumberDiagnostic({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [testNumbers, setTestNumbers] = useState('99689,99686,99687,99700,99710,99720');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<InvoiceTestResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const testInvoices = async () => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const numbers = testNumbers.split(',').map(n => n.trim()).filter(n => n);
      const testResults: InvoiceTestResult[] = [];

      for (const num of numbers) {
        const paddedRef = num.padStart(6, '0');
        const unpaddedRef = num.replace(/^0+/, '');

        const { data: dbPadded } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, date, status, amount, balance, customer')
          .eq('reference_number', paddedRef)
          .maybeSingle();

        const { data: dbUnpadded } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, date, status, amount, balance, customer')
          .eq('reference_number', unpaddedRef)
          .maybeSingle();

        const acumaticaResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-invoice-count`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ baseNumber: num }),
          }
        );

        const acuData = await acumaticaResponse.json();

        const paddedAcu = acuData.queries?.find((q: any) => q.version === 'padded')?.invoices?.[0] || null;
        const unpaddedAcu = acuData.queries?.find((q: any) => q.version === 'unpadded')?.invoices?.[0] || null;

        const hasDuplicates = !!(
          (dbPadded && dbUnpadded) ||
          (paddedAcu && unpaddedAcu) ||
          (dbPadded && unpaddedAcu && paddedRef !== unpaddedRef) ||
          (dbUnpadded && paddedAcu && paddedRef !== unpaddedRef)
        );

        testResults.push({
          referenceNumber: num,
          paddedVersion: paddedRef,
          unpaddedVersion: unpaddedRef,
          acumaticaResults: {
            padded: paddedAcu,
            unpadded: unpaddedAcu,
          },
          databaseResults: {
            padded: dbPadded,
            unpadded: dbUnpadded,
          },
          hasDuplicates,
        });
      }

      setResults(testResults);
    } catch (err: any) {
      setError(err.message || 'Failed to test invoices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <AlertCircle className="w-8 h-8 text-yellow-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">Invoice Reference Number Diagnostic</h2>
              <p className="text-slate-400 text-sm">Test for duplicate invoices with/without leading zeros</p>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Invoice Numbers to Test (comma-separated)
            </label>
            <textarea
              value={testNumbers}
              onChange={(e) => setTestNumbers(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="99689,99686,99687"
            />
          </div>

          <button
            onClick={testInvoices}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Testing...
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                Test Invoices
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Test Results</h3>

              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    result.hasDuplicates
                      ? 'bg-red-900/20 border-red-800'
                      : 'bg-slate-900/50 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {result.hasDuplicates ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    )}
                    <h4 className="text-lg font-semibold text-white">
                      Invoice {result.referenceNumber}
                    </h4>
                    {result.hasDuplicates && (
                      <span className="ml-auto px-3 py-1 bg-red-800 text-red-200 rounded-full text-sm font-medium">
                        DUPLICATES FOUND
                      </span>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-sm font-medium text-slate-300 mb-2">Database</h5>

                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="text-slate-400">Padded ({result.paddedVersion}):</span>
                          {result.databaseResults.padded ? (
                            <div className="mt-1 pl-4 border-l-2 border-green-600">
                              <div className="text-green-400">✓ Found</div>
                              <div className="text-slate-300">Status: {result.databaseResults.padded.status}</div>
                              <div className="text-slate-300">Amount: ${result.databaseResults.padded.amount}</div>
                              <div className="text-slate-300">Date: {result.databaseResults.padded.date}</div>
                            </div>
                          ) : (
                            <div className="text-slate-500 ml-4">Not found</div>
                          )}
                        </div>

                        <div className="text-sm">
                          <span className="text-slate-400">Unpadded ({result.unpaddedVersion}):</span>
                          {result.databaseResults.unpadded ? (
                            <div className="mt-1 pl-4 border-l-2 border-green-600">
                              <div className="text-green-400">✓ Found</div>
                              <div className="text-slate-300">Status: {result.databaseResults.unpadded.status}</div>
                              <div className="text-slate-300">Amount: ${result.databaseResults.unpadded.amount}</div>
                              <div className="text-slate-300">Date: {result.databaseResults.unpadded.date}</div>
                            </div>
                          ) : (
                            <div className="text-slate-500 ml-4">Not found</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-medium text-slate-300 mb-2">Acumatica</h5>

                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="text-slate-400">Padded ({result.paddedVersion}):</span>
                          {result.acumaticaResults.padded ? (
                            <div className="mt-1 pl-4 border-l-2 border-blue-600">
                              <div className="text-blue-400">✓ Found</div>
                              <div className="text-slate-300">Status: {result.acumaticaResults.padded.status}</div>
                              <div className="text-slate-300">Amount: ${result.acumaticaResults.padded.amount}</div>
                              <div className="text-slate-300">Date: {result.acumaticaResults.padded.date}</div>
                            </div>
                          ) : (
                            <div className="text-slate-500 ml-4">Not found</div>
                          )}
                        </div>

                        <div className="text-sm">
                          <span className="text-slate-400">Unpadded ({result.unpaddedVersion}):</span>
                          {result.acumaticaResults.unpadded ? (
                            <div className="mt-1 pl-4 border-l-2 border-blue-600">
                              <div className="text-blue-400">✓ Found</div>
                              <div className="text-slate-300">Status: {result.acumaticaResults.unpadded.status}</div>
                              <div className="text-slate-300">Amount: ${result.acumaticaResults.unpadded.amount}</div>
                              <div className="text-slate-300">Date: {result.acumaticaResults.unpadded.date}</div>
                            </div>
                          ) : (
                            <div className="text-slate-500 ml-4">Not found</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
