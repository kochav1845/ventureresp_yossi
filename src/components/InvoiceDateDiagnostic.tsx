import React, { useState } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DateComparison {
  referenceNumber: string;
  database: {
    date: string | null;
    dueDate: string | null;
    status: string | null;
    amount: string | null;
    balance: string | null;
  } | null;
  acumatica: {
    date: string | null;
    dueDate: string | null;
    status: string | null;
    amount: number | null;
    balance: number | null;
  } | null;
  matches: {
    date: boolean;
    dueDate: boolean;
    status: boolean;
  };
}

export default function InvoiceDateDiagnostic() {
  const [loading, setLoading] = useState(false);
  const [comparisons, setComparisons] = useState<DateComparison[]>([]);
  const [error, setError] = useState('');
  const [refNumbers, setRefNumbers] = useState('095670,095671,095672,095675,095676,095677');

  const runDiagnostic = async () => {
    setLoading(true);
    setError('');
    setComparisons([]);

    try {
      const refNumbersArray = refNumbers.split(',').map(r => r.trim());

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compare-invoice-dates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ referenceNumbers: refNumbersArray }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to compare invoice dates');
      }

      const data = await response.json();

      if (data.success && data.comparisons) {
        setComparisons(data.comparisons.map((comp: any) => ({
          referenceNumber: comp.referenceNumber,
          database: comp.database,
          acumatica: comp.acumatica,
          matches: comp.matches,
        })));
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invoice Date Diagnostic</h1>
          <p className="text-gray-600 mb-6">
            Compare invoice dates between our database and Acumatica to identify sync issues.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invoice Reference Numbers (comma-separated)
            </label>
            <input
              type="text"
              value={refNumbers}
              onChange={(e) => setRefNumbers(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="095670,095671,095672"
            />
          </div>

          <button
            onClick={runDiagnostic}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Running Diagnostic...' : 'Run Diagnostic'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
            </div>
          )}
        </div>

        {comparisons.length > 0 && (
          <div className="space-y-4">
            {comparisons.map((comp) => (
              <div key={comp.referenceNumber} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Invoice {comp.referenceNumber}</h3>
                  {comp.matches.date && comp.matches.dueDate && comp.matches.status ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Database</h4>
                    {comp.database ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center">
                          {comp.matches.date ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mr-2" />
                          )}
                          <span className="text-gray-600">Date:</span>
                          <span className="ml-2 font-mono">{comp.database.date}</span>
                        </div>
                        <div className="flex items-center">
                          {comp.matches.dueDate ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mr-2" />
                          )}
                          <span className="text-gray-600">Due Date:</span>
                          <span className="ml-2 font-mono">{comp.database.dueDate}</span>
                        </div>
                        <div className="flex items-center">
                          {comp.matches.status ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mr-2" />
                          )}
                          <span className="text-gray-600">Status:</span>
                          <span className="ml-2">{comp.database.status}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Amount:</span>
                          <span className="ml-2">${comp.database.amount}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Balance:</span>
                          <span className="ml-2">${comp.database.balance}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">Not found in database</p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Acumatica</h4>
                    {comp.acumatica ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center">
                          {comp.matches.date ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mr-2" />
                          )}
                          <span className="text-gray-600">Date:</span>
                          <span className="ml-2 font-mono">{comp.acumatica.date}</span>
                        </div>
                        <div className="flex items-center">
                          {comp.matches.dueDate ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mr-2" />
                          )}
                          <span className="text-gray-600">Due Date:</span>
                          <span className="ml-2 font-mono">{comp.acumatica.dueDate}</span>
                        </div>
                        <div className="flex items-center">
                          {comp.matches.status ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mr-2" />
                          )}
                          <span className="text-gray-600">Status:</span>
                          <span className="ml-2">{comp.acumatica.status}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Amount:</span>
                          <span className="ml-2">${comp.acumatica.amount?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Balance:</span>
                          <span className="ml-2">${comp.acumatica.balance?.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">Not found in Acumatica</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
