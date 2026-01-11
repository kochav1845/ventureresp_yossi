import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, FileText, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CustomerTimelineChartProps {
  customerId: string;
  customerName: string;
}

interface TimelineData {
  date: string;
  balance: number;
  invoices: number;
  payments: number;
}

export default function CustomerTimelineChart({ customerId, customerName }: CustomerTimelineChartProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'3month' | '6month' | 'year' | 'all'>('6month');

  useEffect(() => {
    loadTimelineData();
  }, [customerId, timeRange]);

  const loadTimelineData = async () => {
    setLoading(true);
    try {
      let dateFrom: Date | null = null;
      const dateTo = new Date();

      switch (timeRange) {
        case '3month':
          dateFrom = new Date();
          dateFrom.setMonth(dateFrom.getMonth() - 3);
          break;
        case '6month':
          dateFrom = new Date();
          dateFrom.setMonth(dateFrom.getMonth() - 6);
          break;
        case 'year':
          dateFrom = new Date();
          dateFrom.setFullYear(dateFrom.getFullYear() - 1);
          break;
        case 'all':
          dateFrom = null;
          break;
      }

      const { data: timelineData, error } = await supabase
        .rpc('get_single_customer_timeline', {
          p_customer_id: customerId,
          p_date_from: dateFrom?.toISOString().split('T')[0] || null,
          p_date_to: dateTo.toISOString().split('T')[0],
          p_grouping: 'day'
        });

      if (error) throw error;
      setData(timelineData || []);
    } catch (error) {
      console.error('Error loading timeline:', error);
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

  // Separate scales for better visualization
  const maxBalance = Math.max(...data.map(d => d.balance), 1);
  const maxTransaction = Math.max(
    ...data.map(d => Math.max(d.invoices, d.payments)),
    1
  );

  const getBalanceY = (value: number) => {
    return 100 - (value / maxBalance) * 80;
  };

  const getBarHeight = (value: number) => {
    return (value / maxTransaction) * 80;
  };

  const createBalanceLine = () => {
    if (data.length === 0) return null;

    const points = data.map((d, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const y = getBalanceY(d.balance);
      return `${x},${y}`;
    }).join(' ');

    return (
      <>
        <polyline
          points={points}
          fill="none"
          stroke="#ef4444"
          strokeWidth="0.4"
          className="transition-all duration-300"
        />
        {data.map((d, index) => {
          const x = (index / Math.max(data.length - 1, 1)) * 100;
          const y = getBalanceY(d.balance);
          return (
            <circle
              key={`balance-${index}`}
              cx={x}
              cy={y}
              r="0.5"
              fill="#ef4444"
              className="hover:r-5 transition-all cursor-pointer"
            >
              <title>{`Balance: ${formatCurrency(d.balance)}\n${d.date}`}</title>
            </circle>
          );
        })}
      </>
    );
  };

  const createBars = () => {
    const barWidth = 100 / (data.length * 2.5); // Width of each bar
    const groupWidth = 100 / data.length; // Width of each group

    return data.map((d, index) => {
      const groupX = (index / data.length) * 100;
      const invoiceHeight = getBarHeight(d.invoices);
      const paymentHeight = getBarHeight(d.payments);

      return (
        <g key={index}>
          {/* Invoice bar */}
          <rect
            x={groupX}
            y={100 - invoiceHeight}
            width={barWidth}
            height={invoiceHeight}
            fill="#3b82f6"
            opacity="0.8"
            className="hover:opacity-100 transition-all cursor-pointer"
          >
            <title>{`Invoice: ${formatCurrency(d.invoices)}\n${d.date}`}</title>
          </rect>

          {/* Payment bar */}
          <rect
            x={groupX + barWidth + barWidth * 0.2}
            y={100 - paymentHeight}
            width={barWidth}
            height={paymentHeight}
            fill="#10b981"
            opacity="0.8"
            className="hover:opacity-100 transition-all cursor-pointer"
          >
            <title>{`Payment: ${formatCurrency(d.payments)}\n${d.date}`}</title>
          </rect>
        </g>
      );
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Customer Timeline</h2>
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No timeline data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg shadow-md border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customer Financial Timeline</h2>
          <p className="text-sm text-gray-600 mt-1">{customerName} - Balance, Invoices & Payments Over Time</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTimeRange('3month')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === '3month'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            3 Months
          </button>
          <button
            onClick={() => setTimeRange('6month')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === '6month'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            6 Months
          </button>
          <button
            onClick={() => setTimeRange('year')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === 'year'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            1 Year
          </button>
          <button
            onClick={() => setTimeRange('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === 'all'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mb-6 pb-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-1 bg-red-500 rounded"></div>
          <span className="text-sm font-medium text-gray-700">Balance Owed (Line)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded"></div>
          <span className="text-sm font-medium text-gray-700">Invoices (Bar)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-sm font-medium text-gray-700">Payments (Bar)</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-80"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 20, 40, 60, 80, 100].map(y => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="0.2"
              strokeDasharray="1,1"
            />
          ))}

          {/* Bars (rendered first, behind the line) */}
          {createBars()}

          {/* Balance line (rendered last, on top) */}
          {createBalanceLine()}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between mt-4 text-xs text-gray-600">
          <span>{data[0]?.date}</span>
          {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date}</span>}
          <span>{data[data.length - 1]?.date}</span>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-700">Current Balance</span>
            <DollarSign className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-900">
            {formatCurrency(data[data.length - 1]?.balance || 0)}
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Total Invoiced</span>
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.invoices, 0))}
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Total Paid</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.payments, 0))}
          </p>
        </div>
      </div>
    </div>
  );
}
