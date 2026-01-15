import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface InvoiceCheckResult {
  original: string;
  withZeros: string;
  withoutZeros: string;
  originalExists: boolean;
  withZerosExists: boolean;
  withoutZerosExists: boolean;
  foundAs: string | null;
  acumaticaData: any;
}

interface AcumaticaInvoiceVariationCheckerProps {
  onBack?: () => void;
}

export default function AcumaticaInvoiceVariationChecker({ onBack }: AcumaticaInvoiceVariationCheckerProps) {
  const navigate = useNavigate();
  const [results, setResults] = useState<InvoiceCheckResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const invoiceNumbers = [
    '96452', '96451', '96441', '96390', '96388', '96397',
    '094905', '094780', '093376', '092963', '092671', '091655',
    '090636', '090561', '089202', '088034', '085741', '085491',
    '003510', '003488', '003007', '002857', '002856', '002509',
    '002443', '002113', '002108', '002016', '002015', '002014',
    '002013', '99805', '99747', '99632', '99630', '98681',
    '98672', '98444', '98174', '97628', '97619', '97439',
    '96941', '96671', '96663', '96662', '96661', '96660', '96655'
  ];

  const checkInvoices = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: invoiceNumbers.length });

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/check-invoice-variations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoiceNumbers }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (exists: boolean) => {
    return exists ? (
      <CheckCircle className="w-4 h-4 text-green-600" />
    ) : (
      <XCircle className="w-4 h-4 text-gray-400" />
    );
  };

  const groupedResults = {
    bothExist: results.filter(r => (r.withZerosExists && r.withoutZerosExists)),
    onlyWithZeros: results.filter(r => r.withZerosExists && !r.withoutZerosExists),
    onlyWithoutZeros: results.filter(r => !r.withZerosExists && r.withoutZerosExists),
    notFound: results.filter(r => !r.withZerosExists && !r.withoutZerosExists),
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            Acumatica Invoice Variation Checker
          </h1>
          <p className="text-gray-600 mt-2">
            Check if invoices exist in Acumatica with and without leading zeros
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-600">
                Testing {invoiceNumbers.length} invoice numbers from screenshots
              </p>
            </div>
            <button
              onClick={checkInvoices}
              disabled={loading}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Search className="w-5 h-5 mr-2" />
              {loading ? 'Checking Acumatica...' : 'Check All Invoices'}
            </button>
          </div>

          {loading && (
            <div className="mt-4">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">
                  Checking invoices in Acumatica... This may take a few minutes.
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-3xl font-bold text-yellow-600">{groupedResults.bothExist.length}</div>
                <div className="text-sm text-gray-600 mt-1">Both Forms Exist</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-3xl font-bold text-green-600">{groupedResults.onlyWithZeros.length}</div>
                <div className="text-sm text-gray-600 mt-1">Only With Zeros</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-3xl font-bold text-blue-600">{groupedResults.onlyWithoutZeros.length}</div>
                <div className="text-sm text-gray-600 mt-1">Only Without Zeros</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-3xl font-bold text-red-600">{groupedResults.notFound.length}</div>
                <div className="text-sm text-gray-600 mt-1">Not Found</div>
              </div>
            </div>

            {groupedResults.bothExist.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-yellow-50 px-6 py-3 border-b border-yellow-200">
                  <h3 className="text-lg font-semibold text-yellow-900">
                    Both Forms Exist ({groupedResults.bothExist.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">With Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Without Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Found As</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {groupedResults.bothExist.map((result, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 text-sm text-gray-900">{result.original}</td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center">
                              {getStatusIcon(result.withZerosExists)}
                              <span className="ml-2">{result.withZeros}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center">
                              {getStatusIcon(result.withoutZerosExists)}
                              <span className="ml-2">{result.withoutZeros}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-blue-600">{result.foundAs}</td>
                          <td className="px-6 py-4 text-sm">{result.acumaticaData?.Status?.value || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {groupedResults.onlyWithZeros.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-green-50 px-6 py-3 border-b border-green-200">
                  <h3 className="text-lg font-semibold text-green-900">
                    Only With Leading Zeros ({groupedResults.onlyWithZeros.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">With Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Without Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {groupedResults.onlyWithZeros.map((result, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 text-sm text-gray-900">{result.original}</td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center">
                              {getStatusIcon(result.withZerosExists)}
                              <span className="ml-2 font-medium text-green-600">{result.withZeros}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center">
                              {getStatusIcon(result.withoutZerosExists)}
                              <span className="ml-2 text-gray-400">{result.withoutZeros}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">{result.acumaticaData?.Status?.value || 'N/A'}</td>
                          <td className="px-6 py-4 text-sm">${result.acumaticaData?.Balance?.value || '0.00'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {groupedResults.onlyWithoutZeros.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-blue-50 px-6 py-3 border-b border-blue-200">
                  <h3 className="text-lg font-semibold text-blue-900">
                    Only Without Leading Zeros ({groupedResults.onlyWithoutZeros.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">With Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Without Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {groupedResults.onlyWithoutZeros.map((result, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 text-sm text-gray-900">{result.original}</td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center">
                              {getStatusIcon(result.withZerosExists)}
                              <span className="ml-2 text-gray-400">{result.withZeros}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center">
                              {getStatusIcon(result.withoutZerosExists)}
                              <span className="ml-2 font-medium text-blue-600">{result.withoutZeros}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">{result.acumaticaData?.Status?.value || 'N/A'}</td>
                          <td className="px-6 py-4 text-sm">${result.acumaticaData?.Balance?.value || '0.00'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {groupedResults.notFound.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="bg-red-50 px-6 py-3 border-b border-red-200">
                  <h3 className="text-lg font-semibold text-red-900">
                    Not Found in Acumatica ({groupedResults.notFound.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">With Zeros</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Without Zeros</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {groupedResults.notFound.map((result, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 text-sm text-gray-900">{result.original}</td>
                          <td className="px-6 py-4 text-sm text-gray-400">{result.withZeros}</td>
                          <td className="px-6 py-4 text-sm text-gray-400">{result.withoutZeros}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
