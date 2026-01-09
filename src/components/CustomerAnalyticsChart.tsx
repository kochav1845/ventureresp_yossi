import { useState, useEffect } from 'react';
import { Calendar, TrendingUp, DollarSign, FileText, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/dateUtils';

interface TimelineData {
  period_date: string;
  invoices_opened: number;
  invoice_amount: number;
  payments_made: number;
  payment_amount: number;
  balance_owed: number;
}

export default function CustomerAnalyticsChart() {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'month' | 'year' | 'all' | 'custom'>('month');
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; data: TimelineData } | null>(null);
  const [activeLines, setActiveLines] = useState({
    invoices: true,
    payments: true,
    balance: true
  });

  useEffect(() => {
    loadData();
  }, [timeRange, customFrom, customTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      let dateFrom: Date | null = null;
      let dateTo: Date = new Date();
      let grouping = 'day';

      switch (timeRange) {
        case 'month':
          dateFrom = new Date();
          dateFrom.setMonth(dateFrom.getMonth() - 1);
          grouping = 'day';
          break;
        case 'year':
          dateFrom = new Date();
          dateFrom.setFullYear(dateFrom.getFullYear() - 1);
          grouping = 'week';
          break;
        case 'all':
          dateFrom = null;
          grouping = 'month';
          break;
        case 'custom':
          if (customFrom) dateFrom = new Date(customFrom);
          if (customTo) dateTo = new Date(customTo);
          const daysDiff = dateFrom && dateTo ? Math.abs((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) : 30;
          if (daysDiff <= 60) grouping = 'day';
          else if (daysDiff <= 365) grouping = 'week';
          else grouping = 'month';
          break;
      }

      const { data: result, error } = await supabase.rpc('get_customer_analytics_timeline', {
        p_date_from: dateFrom?.toISOString() || null,
        p_date_to: dateTo.toISOString(),
        p_grouping: grouping
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

  const renderLineChart = () => {
    if (data.length === 0) return null;

    const width = 100;
    const height = 300;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Get max values for scaling
    const maxInvoiceAmount = Math.max(...data.map(d => d.invoice_amount), 1);
    const maxPaymentAmount = Math.max(...data.map(d => d.payment_amount), 1);
    const maxBalance = Math.max(...data.map(d => d.balance_owed), 1);
    const maxValue = Math.max(maxInvoiceAmount, maxPaymentAmount, maxBalance);

    // Create points for each line
    const createPath = (values: number[]) => {
      if (values.length === 0) return '';

      const points = values.map((value, index) => {
        const x = (index / (values.length - 1 || 1)) * chartWidth;
        const y = chartHeight - (value / maxValue) * chartHeight;
        return `${x},${y}`;
      });

      return `M ${points.join(' L ')}`;
    };

    const invoicePath = createPath(data.map(d => d.invoice_amount));
    const paymentPath = createPath(data.map(d => d.payment_amount));
    const balancePath = createPath(data.map(d => d.balance_owed));

    return (
      <div className="relative w-full" style={{ height: '320px' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Grid lines */}
          <g className="opacity-20">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <line
                key={i}
                x1={padding.left}
                y1={padding.top + chartHeight * ratio}
                x2={padding.left + chartWidth}
                y2={padding.top + chartHeight * ratio}
                stroke="white"
                strokeWidth="0.2"
              />
            ))}
          </g>

          {/* Y-axis labels */}
          <g className="text-white text-xs">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const value = maxValue * (1 - ratio);
              return (
                <text
                  key={i}
                  x={padding.left - 3}
                  y={padding.top + chartHeight * ratio}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="2.5"
                  fill="white"
                >
                  {formatCurrency(value)}
                </text>
              );
            })}
          </g>

          {/* Lines */}
          <g transform={`translate(${padding.left}, ${padding.top})`}>
            {activeLines.balance && (
              <path
                d={balancePath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="0.8"
                className="transition-opacity duration-200"
              />
            )}
            {activeLines.invoices && (
              <path
                d={invoicePath}
                fill="none"
                stroke="#ef4444"
                strokeWidth="0.8"
                className="transition-opacity duration-200"
              />
            )}
            {activeLines.payments && (
              <path
                d={paymentPath}
                fill="none"
                stroke="#10b981"
                strokeWidth="0.8"
                className="transition-opacity duration-200"
              />
            )}

            {/* Interactive points */}
            {data.map((point, index) => {
              const x = (index / (data.length - 1 || 1)) * chartWidth;
              return (
                <rect
                  key={index}
                  x={x - 2}
                  y={0}
                  width="4"
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredPoint({ x: rect.left + rect.width / 2, data: point });
                  }}
                />
              );
            })}
          </g>

          {/* X-axis labels */}
          <g className="text-white text-xs">
            {data
              .filter((_, i) => {
                const step = Math.ceil(data.length / 8);
                return i % step === 0 || i === data.length - 1;
              })
              .map((point, i) => {
                const index = data.indexOf(point);
                const x = padding.left + (index / (data.length - 1 || 1)) * chartWidth;
                const dateObj = new Date(point.period_date);
                const label = timeRange === 'year' || timeRange === 'all'
                  ? dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                  : dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <text
                    key={i}
                    x={x}
                    y={padding.top + chartHeight + 15}
                    textAnchor="middle"
                    fontSize="2.5"
                    fill="white"
                  >
                    {label}
                  </text>
                );
              })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hoveredPoint && (
          <div
            className="fixed z-50 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-2xl pointer-events-none"
            style={{
              left: `${hoveredPoint.x}px`,
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            <p className="text-xs font-semibold text-white mb-2">
              {formatDate(hoveredPoint.data.period_date)}
            </p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-red-500"></div>
                <span className="text-slate-300">Invoices:</span>
                <span className="text-white font-semibold ml-auto">
                  {formatCurrency(hoveredPoint.data.invoice_amount)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-green-500"></div>
                <span className="text-slate-300">Payments:</span>
                <span className="text-white font-semibold ml-auto">
                  {formatCurrency(hoveredPoint.data.payment_amount)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-amber-500"></div>
                <span className="text-slate-300">Balance:</span>
                <span className="text-white font-semibold ml-auto">
                  {formatCurrency(hoveredPoint.data.balance_owed)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const totals = data.reduce(
    (acc, curr) => ({
      invoices: acc.invoices + curr.invoice_amount,
      payments: acc.payments + curr.payment_amount,
      invoiceCount: acc.invoiceCount + curr.invoices_opened,
      paymentCount: acc.paymentCount + curr.payments_made
    }),
    { invoices: 0, payments: 0, invoiceCount: 0, paymentCount: 0 }
  );

  const currentBalance = data.length > 0 ? data[data.length - 1].balance_owed : 0;

  return (
    <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Customer Analytics Overview</h2>
            <p className="text-slate-400 text-sm">Track invoices, payments, and balance trends over time</p>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 border-b border-slate-700">
        <div className="bg-gradient-to-br from-red-600/20 to-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-red-300 font-medium text-sm">Total Invoices</span>
            <FileText className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatCurrency(totals.invoices)}</p>
          <p className="text-sm text-red-300">{formatNumber(totals.invoiceCount)} invoices opened</p>
        </div>

        <div className="bg-gradient-to-br from-green-600/20 to-green-900/20 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-300 font-medium text-sm">Total Payments</span>
            <DollarSign className="w-5 h-5 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatCurrency(totals.payments)}</p>
          <p className="text-sm text-green-300">{formatNumber(totals.paymentCount)} payments received</p>
        </div>

        <div className="bg-gradient-to-br from-amber-600/20 to-amber-900/20 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-amber-300 font-medium text-sm">Current Balance</span>
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-3xl font-bold text-white mb-1">{formatCurrency(currentBalance)}</p>
          <p className="text-sm text-amber-300">Outstanding amount owed</p>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mb-6">
          <button
            onClick={() => setActiveLines(prev => ({ ...prev, invoices: !prev.invoices }))}
            className={`flex items-center gap-2 transition-opacity ${activeLines.invoices ? 'opacity-100' : 'opacity-40'}`}
          >
            <div className="w-8 h-1 bg-red-500 rounded"></div>
            <span className="text-sm text-white font-medium">Invoice Amount</span>
          </button>
          <button
            onClick={() => setActiveLines(prev => ({ ...prev, payments: !prev.payments }))}
            className={`flex items-center gap-2 transition-opacity ${activeLines.payments ? 'opacity-100' : 'opacity-40'}`}
          >
            <div className="w-8 h-1 bg-green-500 rounded"></div>
            <span className="text-sm text-white font-medium">Payment Amount</span>
          </button>
          <button
            onClick={() => setActiveLines(prev => ({ ...prev, balance: !prev.balance }))}
            className={`flex items-center gap-2 transition-opacity ${activeLines.balance ? 'opacity-100' : 'opacity-40'}`}
          >
            <div className="w-8 h-1 bg-amber-500 rounded"></div>
            <span className="text-sm text-white font-medium">Balance Owed</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            No data available for the selected time range
          </div>
        ) : (
          renderLineChart()
        )}
      </div>
    </div>
  );
}
