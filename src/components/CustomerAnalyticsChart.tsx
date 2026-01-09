import { useState, useEffect } from 'react';
import { Calendar, TrendingUp, DollarSign, FileText, X, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/dateUtils';

interface CustomerAnalytics {
  customer_id: string;
  customer_name: string;
  total_invoice_amount: number;
  total_payment_amount: number;
  current_balance: number;
  invoice_count: number;
  payment_count: number;
  last_invoice_date: string | null;
  last_payment_date: string | null;
  avg_days_to_pay: number;
}

export default function CustomerAnalyticsChart() {
  const [data, setData] = useState<CustomerAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'month' | 'year' | 'all' | 'custom'>('all');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hoveredBar, setHoveredBar] = useState<CustomerAnalytics | null>(null);
  const [sortBy, setSortBy] = useState<'balance' | 'invoices' | 'payments'>('balance');

  useEffect(() => {
    loadData();
  }, [timeRange, customFrom, customTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      let dateFrom: Date | null = null;
      let dateTo: Date = new Date();

      switch (timeRange) {
        case 'month':
          dateFrom = new Date();
          dateFrom.setMonth(dateFrom.getMonth() - 1);
          break;
        case 'year':
          dateFrom = new Date();
          dateFrom.setFullYear(dateFrom.getFullYear() - 1);
          break;
        case 'all':
          dateFrom = null;
          break;
        case 'custom':
          if (customFrom) dateFrom = new Date(customFrom);
          if (customTo) dateTo = new Date(customTo);
          break;
      }

      const { data: result, error } = await supabase.rpc('get_customer_level_analytics', {
        p_date_from: dateFrom?.toISOString() || null,
        p_date_to: dateTo.toISOString(),
        p_limit: 50
      });

      if (error) throw error;
      setData(result || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const sortedData = [...data].sort((a, b) => {
    switch (sortBy) {
      case 'invoices':
        return b.total_invoice_amount - a.total_invoice_amount;
      case 'payments':
        return b.total_payment_amount - a.total_payment_amount;
      case 'balance':
      default:
        return b.current_balance - a.current_balance;
    }
  });

  const displayData = sortedData.slice(0, 20);

  const maxValue = Math.max(
    ...displayData.map(d =>
      Math.max(d.total_invoice_amount, d.total_payment_amount, d.current_balance)
    ),
    1
  );

  const totals = data.reduce(
    (acc, curr) => ({
      invoices: acc.invoices + curr.total_invoice_amount,
      payments: acc.payments + curr.total_payment_amount,
      balance: acc.balance + curr.current_balance,
      invoiceCount: acc.invoiceCount + curr.invoice_count,
      paymentCount: acc.paymentCount + curr.payment_count,
      customerCount: acc.customerCount + 1
    }),
    { invoices: 0, payments: 0, balance: 0, invoiceCount: 0, paymentCount: 0, customerCount: 0 }
  );

  return (
    <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Customer Analytics by Individual Customer</h2>
            <p className="text-slate-400 text-sm">Compare invoice, payment, and balance metrics across customers</p>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTimeRange('month'); setShowCustomRange(false); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                timeRange === 'month'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => { setTimeRange('year'); setShowCustomRange(false); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                timeRange === 'year'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              Year
            </button>
            <button
              onClick={() => { setTimeRange('all'); setShowCustomRange(false); }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                timeRange === 'all'
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setShowCustomRange(!showCustomRange)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                showCustomRange
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Custom
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {showCustomRange && (
          <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-slate-400 mb-1">From Date</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-slate-400 mb-1">To Date</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={() => { setTimeRange('custom'); loadData(); }}
                  disabled={!customFrom || !customTo}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  Apply
                </button>
                <button
                  onClick={() => { setShowCustomRange(false); setCustomFrom(''); setCustomTo(''); setTimeRange('month'); }}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 border-b border-slate-700">
        <div className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-300 font-medium text-sm">Total Customers</span>
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatNumber(totals.customerCount)}</p>
          <p className="text-sm text-blue-300">Active customers</p>
        </div>

        <div className="bg-gradient-to-br from-red-600/20 to-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-300 font-medium text-sm">Total Invoices</span>
            <FileText className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatCurrency(totals.invoices)}</p>
          <p className="text-sm text-red-300">{formatNumber(totals.invoiceCount)} invoices</p>
        </div>

        <div className="bg-gradient-to-br from-green-600/20 to-green-900/20 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-300 font-medium text-sm">Total Payments</span>
            <DollarSign className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatCurrency(totals.payments)}</p>
          <p className="text-sm text-green-300">{formatNumber(totals.paymentCount)} payments</p>
        </div>

        <div className="bg-gradient-to-br from-amber-600/20 to-amber-900/20 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-300 font-medium text-sm">Total Balance</span>
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatCurrency(totals.balance)}</p>
          <p className="text-sm text-amber-300">Outstanding balance</p>
        </div>
      </div>

      {/* Customer Comparison */}
      <div className="p-6">
        {/* Sort Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Sort by:</span>
            <button
              onClick={() => setSortBy('balance')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === 'balance'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Balance
            </button>
            <button
              onClick={() => setSortBy('invoices')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === 'invoices'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Invoices
            </button>
            <button
              onClick={() => setSortBy('payments')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortBy === 'payments'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Payments
            </button>
          </div>
          <div className="text-sm text-slate-400">
            Showing top 20 of {data.length} customers
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            No customer data available for the selected time range
          </div>
        ) : (
          <div className="space-y-4">
            {displayData.map((customer, index) => (
              <div
                key={customer.customer_id}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:bg-slate-800 transition-colors"
                onMouseEnter={() => setHoveredBar(customer)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Customer Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold truncate">{customer.customer_name}</h3>
                    <p className="text-xs text-slate-400">ID: {customer.customer_id}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm text-slate-400">Current Balance</p>
                    <p className="text-xl font-bold text-amber-400">
                      {formatCurrency(customer.current_balance)}
                    </p>
                  </div>
                </div>

                {/* Metrics Bars */}
                <div className="space-y-2">
                  {/* Invoices Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-red-300">Invoices: {customer.invoice_count}</span>
                      <span className="text-white font-semibold">
                        {formatCurrency(customer.total_invoice_amount)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(customer.total_invoice_amount / maxValue) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Payments Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-green-300">Payments: {customer.payment_count}</span>
                      <span className="text-white font-semibold">
                        {formatCurrency(customer.total_payment_amount)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(customer.total_payment_amount / maxValue) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Balance Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-amber-300">Outstanding Balance</span>
                      <span className="text-white font-semibold">
                        {formatCurrency(customer.current_balance)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(customer.current_balance / maxValue) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                {hoveredBar?.customer_id === customer.customer_id && (
                  <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400">Last Invoice:</span>
                      <p className="text-white font-medium">
                        {customer.last_invoice_date ? formatDate(customer.last_invoice_date) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Last Payment:</span>
                      <p className="text-white font-medium">
                        {customer.last_payment_date ? formatDate(customer.last_payment_date) : 'N/A'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
