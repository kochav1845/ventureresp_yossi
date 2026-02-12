import { useState } from 'react';
import { ArrowLeft, AlertTriangle, Search, Calendar, DollarSign, XCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface VoidedPayment {
  reference_number: string;
  type: string;
  status: string;
  customer_name: string;
  payment_amount: number;
  application_date: string;
  date_utc: string;
  date_et: string;
  hour_utc: number;
}

interface VoidedPaymentPair {
  reference_number: string;
  customer_name: string;
  original_amount: number;
  reversal_amount: number;
  net_amount: number;
  application_date_utc: string;
  application_date_et: string;
  is_balanced: boolean;
  has_original: boolean;
  has_reversal: boolean;
}

export default function VoidedPaymentsByDate() {
  const [searchDate, setSearchDate] = useState('');
  const [timezone, setTimezone] = useState<'UTC' | 'ET'>('ET');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<VoidedPayment[]>([]);
  const [summary, setSummary] = useState<VoidedPaymentPair[]>([]);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!searchDate) {
      setError('Please select a date');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);
    setSummary([]);

    try {
      // Query based on selected timezone
      const { data, error: queryError } = await supabase.rpc('search_voided_payments_by_date', {
        p_search_date: searchDate,
        p_timezone: timezone
      });

      if (queryError) throw queryError;

      setResults(data || []);

      // Group by reference number to find pairs
      const grouped = new Map<string, { original?: VoidedPayment; reversal?: VoidedPayment }>();

      (data || []).forEach(payment => {
        if (!grouped.has(payment.reference_number)) {
          grouped.set(payment.reference_number, {});
        }
        const pair = grouped.get(payment.reference_number)!;

        if (payment.type === 'Voided Payment') {
          pair.reversal = payment;
        } else {
          pair.original = payment;
        }
      });

      // Create summary
      const summaryData: VoidedPaymentPair[] = Array.from(grouped.entries()).map(([ref, pair]) => {
        const original = pair.original;
        const reversal = pair.reversal;
        const originalAmt = original ? parseFloat(original.payment_amount.toString()) : 0;
        const reversalAmt = reversal ? parseFloat(reversal.payment_amount.toString()) : 0;
        const netAmt = originalAmt + reversalAmt;

        return {
          reference_number: ref,
          customer_name: original?.customer_name || reversal?.customer_name || 'Unknown',
          original_amount: originalAmt,
          reversal_amount: reversalAmt,
          net_amount: netAmt,
          application_date_utc: original?.date_utc || reversal?.date_utc || '',
          application_date_et: original?.date_et || reversal?.date_et || '',
          is_balanced: Math.abs(netAmt) < 0.01,
          has_original: !!original,
          has_reversal: !!reversal
        };
      });

      setSummary(summaryData);
    } catch (err: any) {
      console.error('Error searching voided payments:', err);
      setError(err.message || 'Failed to search voided payments');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const totalVoidedAmount = summary.reduce((sum, pair) => sum + Math.abs(pair.original_amount), 0);
  const unbalancedCount = summary.filter(p => !p.is_balanced).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Voided Payments by Date</h1>
          <p className="text-gray-600 mt-2">Search for voided payments with timezone-aware filtering</p>
        </div>

        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Date
              </label>
              <input
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value as 'UTC' | 'ET')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ET">Eastern Time (ET)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={loading || !searchDate}
                className="w-full px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {searchDate && !loading && results.length === 0 && !error && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                No voided payments found for <strong>{formatDate(searchDate)}</strong> in <strong>{timezone}</strong> timezone
              </p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {summary.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <p className="text-sm text-red-600 font-medium mb-1">Total Voided</p>
              <p className="text-2xl font-bold text-red-900">{formatCurrency(totalVoidedAmount)}</p>
              <p className="text-xs text-red-700 mt-1">{summary.length} payment{summary.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle className="w-8 h-8 text-yellow-600" />
              </div>
              <p className="text-sm text-yellow-600 font-medium mb-1">Unbalanced Pairs</p>
              <p className="text-2xl font-bold text-yellow-900">{unbalancedCount}</p>
              <p className="text-xs text-yellow-700 mt-1">Should be 0</p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-sm text-green-600 font-medium mb-1">Balanced Pairs</p>
              <p className="text-2xl font-bold text-green-900">{summary.length - unbalancedCount}</p>
              <p className="text-xs text-green-700 mt-1">Net $0.00</p>
            </div>
          </div>
        )}

        {/* Summary Table */}
        {summary.length > 0 && (
          <div className="bg-white rounded-lg shadow-md mb-6">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Voided Payment Pairs</h2>
              <p className="text-sm text-gray-600 mt-1">Grouped by reference number</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date (UTC)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date (ET)</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Original</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reversal</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {summary.map((pair) => (
                    <tr key={pair.reference_number} className={!pair.is_balanced ? 'bg-yellow-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {pair.reference_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {pair.customer_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {formatDate(pair.application_date_utc)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {formatDate(pair.application_date_et)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {pair.has_original ? (
                          <span className="text-red-600 font-medium">{formatCurrency(pair.original_amount)}</span>
                        ) : (
                          <span className="text-gray-400">Missing</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        {pair.has_reversal ? (
                          <span className="text-blue-600 font-medium">{formatCurrency(pair.reversal_amount)}</span>
                        ) : (
                          <span className="text-gray-400">Missing</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold">
                        <span className={pair.is_balanced ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(pair.net_amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {pair.is_balanced ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detailed Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">All Voided Payment Records</h2>
              <p className="text-sm text-gray-600 mt-1">Individual payment and reversal entries</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date (UTC)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date (ET)</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hour (UTC)</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((payment, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {payment.reference_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          payment.type === 'Voided Payment'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {payment.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {payment.customer_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {formatDate(payment.date_utc)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <span className="font-medium text-blue-600">
                          {formatDate(payment.date_et)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {payment.hour_utc}:00
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                        <span className={parseFloat(payment.payment_amount.toString()) < 0 ? 'text-blue-600' : 'text-red-600'}>
                          {formatCurrency(parseFloat(payment.payment_amount.toString()))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          payment.status === 'Voided'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
