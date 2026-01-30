import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, AlertCircle, FileX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CollectorDetailedProgressProps {
  collectorId: string;
  collectorName: string;
  onBack?: () => void;
}

interface ProgressData {
  date: string;
  closed_amount: number;
  closed_count: number;
  red_status_count: number;
  no_change_count: number;
  total_assigned: number;
}

export default function CollectorDetailedProgress({
  collectorId,
  collectorName,
  onBack
}: CollectorDetailedProgressProps) {
  const navigate = useNavigate();
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30);
  const [totalStats, setTotalStats] = useState({
    totalClosed: 0,
    totalClosedAmount: 0,
    totalRedChanges: 0,
    totalNoChanges: 0,
    avgDailyAmount: 0
  });

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadCollectorProgress();
  }, [collectorId, dateRange]);

  const loadCollectorProgress = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);
      const endDate = new Date();

      const { data, error } = await supabase.rpc('get_collector_progress', {
        p_collector_id: collectorId,
        p_start_date: startDate.toISOString().split('T')[0],
        p_end_date: endDate.toISOString().split('T')[0]
      });

      if (error) throw error;

      if (data) {
        setProgressData(data);

        // Calculate totals
        const totals = data.reduce((acc, curr) => ({
          totalClosed: acc.totalClosed + (curr.closed_count || 0),
          totalClosedAmount: acc.totalClosedAmount + (parseFloat(curr.closed_amount) || 0),
          totalRedChanges: acc.totalRedChanges + (curr.red_status_count || 0),
          totalNoChanges: acc.totalNoChanges + (curr.no_change_count || 0),
          avgDailyAmount: 0
        }), {
          totalClosed: 0,
          totalClosedAmount: 0,
          totalRedChanges: 0,
          totalNoChanges: 0,
          avgDailyAmount: 0
        });

        totals.avgDailyAmount = data.length > 0 ? totals.totalClosedAmount / data.length : 0;
        setTotalStats(totals);
      }
    } catch (error) {
      console.error('Error loading collector progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatChartData = () => {
    return progressData.map(item => ({
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      'Amount Closed': parseFloat(item.closed_amount) || 0,
      'Changed to Red': item.red_status_count || 0,
      'No Changes': item.no_change_count || 0,
      'Invoices Closed': item.closed_count || 0
    }));
  };

  const chartData = formatChartData();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading collector progress...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-blue-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Collector Progress Tracking</h1>
            <p className="text-gray-600 mt-1">
              Detailed performance metrics for <span className="font-semibold text-blue-600">{collectorName}</span>
            </p>
          </div>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 opacity-80" />
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium opacity-90">Total Collected</h3>
            <p className="text-3xl font-bold mt-2">
              ${totalStats.totalClosedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm opacity-80 mt-1">
              Avg: ${totalStats.avgDailyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day
            </p>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <FileX className="w-8 h-8 opacity-80" />
            </div>
            <h3 className="text-sm font-medium opacity-90">Invoices Closed</h3>
            <p className="text-3xl font-bold mt-2">{totalStats.totalClosed}</p>
            <p className="text-sm opacity-80 mt-1">Successfully resolved</p>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-8 h-8 opacity-80" />
              <TrendingDown className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium opacity-90">Changed to Red</h3>
            <p className="text-3xl font-bold mt-2">{totalStats.totalRedChanges}</p>
            <p className="text-sm opacity-80 mt-1">Escalated status</p>
          </div>

          <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <FileX className="w-8 h-8 opacity-80" />
            </div>
            <h3 className="text-sm font-medium opacity-90">No Status Change</h3>
            <p className="text-3xl font-bold mt-2">{totalStats.totalNoChanges}</p>
            <p className="text-sm opacity-80 mt-1">Pending action</p>
          </div>

          <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 opacity-80" />
            </div>
            <h3 className="text-sm font-medium opacity-90">Success Rate</h3>
            <p className="text-3xl font-bold mt-2">
              {totalStats.totalClosed + totalStats.totalRedChanges + totalStats.totalNoChanges > 0
                ? Math.round((totalStats.totalClosed / (totalStats.totalClosed + totalStats.totalRedChanges + totalStats.totalNoChanges)) * 100)
                : 0}%
            </p>
            <p className="text-sm opacity-80 mt-1">Closure rate</p>
          </div>
        </div>

        {/* Amount Closed Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Amount Closed Over Time</h2>
              <p className="text-sm text-gray-600">Daily collection amounts</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Amount Closed']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Amount Closed"
                stroke="#10b981"
                strokeWidth={3}
                dot={{ fill: '#10b981', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status Changes Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Invoice Status Changes Over Time</h2>
              <p className="text-sm text-gray-600">Track status progression and escalations</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Invoices Closed"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="Changed to Red"
                stroke="#ef4444"
                strokeWidth={3}
                dot={{ fill: '#ef4444', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="No Changes"
                stroke="#6b7280"
                strokeWidth={3}
                dot={{ fill: '#6b7280', r: 4 }}
                activeDot={{ r: 6 }}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Daily Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount Closed</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Invoices Closed</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Changed to Red</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">No Changes</th>
                </tr>
              </thead>
              <tbody>
                {progressData.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900">
                      {new Date(item.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-green-600">
                      ${parseFloat(item.closed_amount).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-blue-600">
                      {item.closed_count}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-red-600">
                      {item.red_status_count}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-600">
                      {item.no_change_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
