import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InvoiceCheckResult {
  original: string;
  withZeros: string;
  withoutZeros: string;
  inDbAs: string | null;
  dbData: any;
  acuWithZeros: any;
  acuWithoutZeros: any;
}

const defaultInvoices = [
  '003510', '003508', '003007', '002857', '002856', '002509', '002443',
  '002113', '002108', '002016', '002015', '002014', '002013', '099805',
  '099747', '099632', '099630', '098681', '098672', '098444', '098174',
  '097628', '097619', '097439', '096941', '096671', '096663', '096662',
  '096661', '096660', '096655'
];

export default function InvoiceFormatChecker({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [invoiceNumbers, setInvoiceNumbers] = useState(defaultInvoices.join('\n'));
  const [results, setResults] = useState<InvoiceCheckResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const checkInvoices = async () => {
    setLoading(true);
    setError('');
    setResults([]);

    try {
      const numbers = invoiceNumbers
        .split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-invoice-formats`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ invoice_numbers: numbers }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to check invoices: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (acuWithZeros: any, acuWithoutZeros: any, dbData: any) => {
    if (acuWithZeros && acuWithoutZeros) {
      return <AlertCircle className="w-5 h-5 text-yellow-500" title="Both formats found in Acumatica!" />;
    }
    if (acuWithZeros && dbData) {
      return <CheckCircle className="w-5 h-5 text-green-500" title="Matches with zeros" />;
    }
    if (acuWithoutZeros && !dbData) {
      return <AlertCircle className="w-5 h-5 text-orange-500" title="Found without zeros in Acu, missing in DB" />;
    }
    if (!acuWithZeros && !acuWithoutZeros) {
      return <XCircle className="w-5 h-5 text-red-500" title="Not found in Acumatica" />;
    }
    return <AlertCircle className="w-5 h-5 text-gray-400" title="Unknown status" />;
  };

  const hasDateMismatch = (result: InvoiceCheckResult) => {
    if (!result.dbData || !result.acuWithZeros) return false;
    const dbDate = result.dbData.date;
    const acuDate = result.acuWithZeros.date;
    return dbDate !== acuDate;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={handleBack}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-6">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Search className="w-7 h-7 mr-3" />
              Invoice Format Checker
            </h2>
            <p className="text-blue-100 mt-2">
              Check if invoices exist in Acumatica with or without leading zeros
            </p>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invoice Numbers (one per line)
              </label>
              <textarea
                value={invoiceNumbers}
                onChange={(e) => setInvoiceNumbers(e.target.value)}
                className="w-full h-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="003510&#10;003508&#10;003007"
              />
            </div>

            <button
              onClick={checkInvoices}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Checking Invoices...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Check Invoices
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Results ({results.length} invoices checked)
                </h3>

                <div className="space-y-3">
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 ${
                        hasDateMismatch(result)
                          ? 'bg-red-50 border-red-300'
                          : result.acuWithZeros && result.dbData
                          ? 'bg-green-50 border-green-200'
                          : result.acuWithZeros || result.acuWithoutZeros
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            {getStatusIcon(result.acuWithZeros, result.acuWithoutZeros, result.dbData)}
                            <span className="font-mono font-semibold text-lg text-gray-900">
                              {result.original}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">With Zeros ({result.withZeros}):</span>
                              <div className="mt-1">
                                {result.acuWithZeros ? (
                                  <div className="space-y-1">
                                    <div className="text-green-700">✓ Found in Acumatica</div>
                                    <div className="text-xs text-gray-600">
                                      Date: {result.acuWithZeros.date || 'N/A'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Status: {result.acuWithZeros.status || 'N/A'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Balance: ${result.acuWithZeros.balance || '0.00'}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-gray-500">Not found</div>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="font-medium text-gray-700">Without Zeros ({result.withoutZeros}):</span>
                              <div className="mt-1">
                                {result.acuWithoutZeros ? (
                                  <div className="space-y-1">
                                    <div className="text-green-700">✓ Found in Acumatica</div>
                                    <div className="text-xs text-gray-600">
                                      Date: {result.acuWithoutZeros.date || 'N/A'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Status: {result.acuWithoutZeros.status || 'N/A'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Balance: ${result.acuWithoutZeros.balance || '0.00'}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-gray-500">Not found</div>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="font-medium text-gray-700">In Database:</span>
                              <div className="mt-1">
                                {result.dbData ? (
                                  <div className="space-y-1">
                                    <div className="text-green-700">✓ Found as {result.inDbAs}</div>
                                    <div className="text-xs text-gray-600">
                                      Date: {result.dbData.date || 'N/A'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Status: {result.dbData.status || 'N/A'}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Balance: ${result.dbData.balance || '0.00'}
                                    </div>
                                    {hasDateMismatch(result) && (
                                      <div className="text-xs text-red-600 font-semibold mt-2">
                                        ⚠️ DATE MISMATCH! Acu: {result.acuWithZeros?.date}, DB: {result.dbData.date}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-red-500">Not in database</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Legend:</h4>
                  <div className="space-y-1 text-sm text-blue-800">
                    <div className="flex items-center">
                      <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                      Green background: Perfect match between Acumatica and Database
                    </div>
                    <div className="flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2 text-yellow-500" />
                      Yellow background: Found in Acumatica but format issues
                    </div>
                    <div className="flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                      Red background: Date mismatch between Acumatica and Database
                    </div>
                    <div className="flex items-center">
                      <XCircle className="w-4 h-4 mr-2 text-red-500" />
                      Gray background: Not found in Acumatica
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
