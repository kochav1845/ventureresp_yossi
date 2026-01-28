import { useState, useEffect } from 'react';
import { TrendingUp, FileText, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface CustomerTimelineChartProps {
  customerId: string;
  customerName: string;
}

interface TimelineData {
  date: string;
  balance: number;
  invoices: number;
  payments: number;
  overdue_90_days: number;
}

export default function CustomerTimelineChart({ customerId, customerName }: CustomerTimelineChartProps) {
  const [data, setData] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'3month' | '6month' | 'year' | 'all'>('6month');
  const [showBalance, setShowBalance] = useState(true);
  const [showInvoices, setShowInvoices] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [showOverdue, setShowOverdue] = useState(true);

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (timeRange === '3month') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (timeRange === '6month' || timeRange === 'year') {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border-2 border-gray-300 rounded-lg shadow-xl p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <span className="text-xs text-gray-600">{entry.name}:</span>
              <span className="text-xs font-bold text-gray-900">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
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
    <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg shadow-md border border-gray-200 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Customer Financial Timeline</h2>
          <p className="text-xs md:text-sm text-gray-600 mt-1">{customerName} - Invoices & Payments Over Time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTimeRange('3month')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              timeRange === '3month'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label="Show 3 month range"
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
            aria-label="Show 6 month range"
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
            aria-label="Show 1 year range"
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
            aria-label="Show all time range"
          >
            All Time
          </button>
        </div>
      </div>

      {/* Interactive Legend */}
      <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-6 pb-4 border-b">
        <button
          onClick={() => setShowBalance(!showBalance)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showBalance ? 'bg-red-50 border border-red-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showBalance ? "Hide balance line" : "Show balance line"}
        >
          <div className={`w-8 h-1 rounded ${showBalance ? 'bg-red-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Balance Owed</span>
        </button>
        <button
          onClick={() => setShowInvoices(!showInvoices)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showInvoices ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showInvoices ? "Hide invoices line" : "Show invoices line"}
        >
          <div className={`w-8 h-1 rounded ${showInvoices ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Invoices</span>
        </button>
        <button
          onClick={() => setShowPayments(!showPayments)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showPayments ? 'bg-green-50 border border-green-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showPayments ? "Hide payments line" : "Show payments line"}
        >
          <div className={`w-8 h-1 rounded ${showPayments ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Payments</span>
        </button>
        <button
          onClick={() => setShowOverdue(!showOverdue)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
            showOverdue ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 opacity-50 border border-gray-200'
          }`}
          aria-label={showOverdue ? "Hide overdue 90+ days line" : "Show overdue 90+ days line"}
        >
          <div className={`w-8 h-1 rounded ${showOverdue ? 'bg-orange-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-gray-700">Overdue 90+ Days</span>
        </button>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg p-6 border border-gray-300 relative">
        <ResponsiveContainer width="100%" height={500}>
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 60, bottom: 60 }}
          >
            <CartesianGrid
              strokeDasharray="0"
              stroke="#e5e7eb"
              strokeOpacity={0.5}
              vertical={false}
              horizontal={true}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#9ca3af"
              style={{ fontSize: '12px', fontWeight: '400' }}
              tick={{ fill: '#6b7280' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickLine={{ stroke: '#d1d5db' }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value)}
              stroke="#9ca3af"
              style={{ fontSize: '12px', fontWeight: '400' }}
              tick={{ fill: '#6b7280' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickLine={{ stroke: '#d1d5db' }}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => <span className="text-gray-600 text-sm">{value}</span>}
            />
            {showBalance && (
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
                name="Balance Owed"
                activeDot={{ r: 5, fill: '#dc2626', stroke: '#fff', strokeWidth: 2 }}
              />
            )}
            {showInvoices && (
              <Line
                type="monotone"
                dataKey="invoices"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Invoices"
                activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
              />
            )}
            {showPayments && (
              <Line
                type="monotone"
                dataKey="payments"
                stroke="#059669"
                strokeWidth={2}
                dot={false}
                name="Payments"
                activeDot={{ r: 5, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
              />
            )}
            {showOverdue && (
              <Line
                type="monotone"
                dataKey="overdue_90_days"
                stroke="#ea580c"
                strokeWidth={2}
                dot={false}
                name="Overdue 90+ Days"
                activeDot={{ r: 5, fill: '#ea580c', stroke: '#fff', strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Enhanced Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-700">Current Balance</span>
            <DollarSign className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-900">
            {formatCurrency(data[data.length - 1]?.balance || 0)}
          </p>
          <p className="text-xs text-red-600 mt-1">Outstanding amount</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Total Invoiced</span>
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.invoices, 0))}
          </p>
          <p className="text-xs text-blue-600 mt-1">In selected period</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Total Paid</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(data.reduce((sum, d) => sum + d.payments, 0))}
          </p>
          <p className="text-xs text-green-600 mt-1">In selected period</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-orange-700">Overdue 90+ Days</span>
            <DollarSign className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-900">
            {formatCurrency(data[data.length - 1]?.overdue_90_days || 0)}
          </p>
          <p className="text-xs text-orange-600 mt-1">Currently overdue</p>
        </div>
      </div>
    </div>
  );
}
