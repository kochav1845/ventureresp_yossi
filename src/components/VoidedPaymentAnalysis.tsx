import { useState, useEffect } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, XCircle, Search, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface VoidedPaymentAnalysisProps {
  onBack?: () => void;
}

interface DualEntryPayment {
  reference_number: string;
  customer_name: string;
  application_date: string;
  entries: {
    type: string;
    amount: number;
    status: string;
    id: string;
  }[];
  net_amount: number;
  is_balanced: boolean;
}

export default function VoidedPaymentAnalysis({ onBack }: VoidedPaymentAnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [dualEntries, setDualEntries] = useState<DualEntryPayment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [balanceFilter, setBalanceFilter] = useState<string>('all');

  useEffect(() => {
    loadDualEntryPayments();
  }, []);

  const loadDualEntryPayments = async () => {
    setLoading(true);
    try {
      // Get all voided payments
      const { data: voidedPayments, error: voidedError } = await supabase
        .from('acumatica_payments')
        .select('reference_number')
        .eq('type', 'Voided Payment')
        .order('application_date', { ascending: false });

      if (voidedError) throw voidedError;

      const referenceNumbers = [...new Set(voidedPayments?.map(p => p.reference_number) || [])];

      // Get all payments with these reference numbers
      const { data: allPayments, error: allError } = await supabase
        .from('acumatica_payments')
        .select('*')
        .in('reference_number', referenceNumbers)
        .order('application_date', { ascending: false })
        .order('type', { ascending: true });

      if (allError) throw allError;

      // Group by reference number
      const grouped = new Map<string, any[]>();
      allPayments?.forEach(payment => {
        if (!grouped.has(payment.reference_number)) {
          grouped.set(payment.reference_number, []);
        }
        grouped.get(payment.reference_number)!.push(payment);
      });

      // Create dual entry analysis
      const analysis: DualEntryPayment[] = [];
      grouped.forEach((payments, refNumber) => {
        const typeCount = new Set(payments.map(p => p.type)).size;
        if (typeCount > 1) { // Only show if multiple types
          const entries = payments.map(p => ({
            type: p.type,
            amount: parseFloat(p.payment_amount || 0),
            status: p.status,
            id: p.id
          }));

          const netAmount = entries.reduce((sum, e) => sum + e.amount, 0);

          analysis.push({
            reference_number: refNumber,
            customer_name: payments[0].customer_name || 'Unknown',
            application_date: payments[0].application_date,
            entries,
            net_amount: netAmount,
            is_balanced: Math.abs(netAmount) < 0.01
          });
        }
      });

      setDualEntries(analysis);
    } catch (error: any) {
      console.error('Error loading dual entry payments:', error);
      alert('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = dualEntries.filter(entry => {
    // Search filter
    if (searchTerm && !entry.reference_number.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !entry.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Date filter
    if (dateFilter !== 'all') {
      const entryDate = new Date(entry.application_date);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      if (dateFilter === '30days' && entryDate < thirtyDaysAgo) return false;
      if (dateFilter === '60days' && entryDate < sixtyDaysAgo) return false;
      if (dateFilter === '2026') {
        if (entryDate.getFullYear() !== 2026) return false;
      }
    }

    // Balance filter
    if (balanceFilter === 'balanced' && !entry.is_balanced) return false;
    if (balanceFilter === 'unbalanced' && entry.is_balanced) return false;

    return true;
  });

  const totalBalanced = filteredEntries.filter(e => e.is_balanced).length;
  const totalUnbalanced = filteredEntries.filter(e => !e.is_balanced).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Admin Dashboard
          </button>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Voided Payment Analysis
            </h1>
            <p className="text-slate-600">
              Analyzing payments with both Payment and Voided Payment entries
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600 mb-1">Total Dual-Entry Payments</div>
                <div className="text-2xl font-bold text-slate-900">{filteredEntries.length}</div>
              </div>
              <AlertCircle className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600 mb-1">Balanced (Net $0)</div>
                <div className="text-2xl font-bold text-green-600">{totalBalanced}</div>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600 mb-1">Unbalanced (Net ≠ $0)</div>
                <div className="text-2xl font-bold text-red-600">{totalUnbalanced}</div>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Search className="w-4 h-4 inline mr-2" />
                Search
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Reference # or Customer"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Date Range
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Time</option>
                <option value="30days">Last 30 Days</option>
                <option value="60days">Last 60 Days</option>
                <option value="2026">Year 2026</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Balance Status
              </label>
              <select
                value={balanceFilter}
                onChange={(e) => setBalanceFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="balanced">Balanced Only</option>
                <option value="unbalanced">Unbalanced Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Loading analysis...</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-600">
              No dual-entry payments found matching your filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Reference #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Entries
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Net Amount
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredEntries.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {entry.reference_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {entry.customer_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {new Date(entry.application_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {entry.entries.map((e, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                e.type === 'Payment'
                                  ? 'bg-green-100 text-green-700'
                                  : e.type === 'Voided Payment'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {e.type}
                              </span>
                              <span className={`font-medium ${e.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-xs text-slate-500">({e.status})</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className={`font-bold ${
                          Math.abs(entry.net_amount) < 0.01
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          ${entry.net_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {entry.is_balanced ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" />
                            Balanced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3" />
                            Unbalanced
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Understanding Voided Payments</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• When a payment is voided in Acumatica, it creates TWO entries with the same reference number</li>
            <li>• The original "Payment" entry shows the positive amount with status "Voided"</li>
            <li>• A new "Voided Payment" entry shows the negative amount with status "Closed"</li>
            <li>• Together, these should net to $0 in your payment analytics</li>
            <li>• BOTH entries should appear in reports - this is correct accounting practice</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
