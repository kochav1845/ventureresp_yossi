import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ArrowLeft, TrendingUp, DollarSign, AlertCircle, Clock, Calendar } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface ProgressData {
  date: string;
  closed_amount: number;
  closed_count: number;
  red_status_count: number;
  no_change_count: number;
  total_assigned: number;
}

interface CollectorProgressProps {
  onBack: () => void;
}

export default function CollectorProgress({ onBack }: CollectorProgressProps) {
  const { user, profile } = useAuth();
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30');
  const [summaryStats, setSummaryStats] = useState({
    totalClosed: 0,
    totalClosedAmount: 0,
    totalRed: 0,
    totalNoChange: 0,
  });

  useEffect(() => {
    if (user && profile) {
      loadProgressData();
    }
  }, [user, profile, dateRange]);

  const loadProgressData = async () => {
    if (!user || !profile) return;

    setLoading(true);
    try {
      const days = parseInt(dateRange);
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase.rpc('get_collector_progress', {
        p_collector_id: profile.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (error) throw error;

      const formattedData = data.map((item: any) => ({
        date: format(new Date(item.date), 'MMM dd'),
        closed_amount: parseFloat(item.closed_amount) || 0,
        closed_count: parseInt(item.closed_count) || 0,
        red_status_count: parseInt(item.red_status_count) || 0,
        no_change_count: parseInt(item.no_change_count) || 0,
        total_assigned: parseInt(item.total_assigned) || 0,
      }));

      setProgressData(formattedData);

      // Calculate summary stats
      const totalClosed = formattedData.reduce((sum, item) => sum + item.closed_count, 0);
      const totalClosedAmount = formattedData.reduce((sum, item) => sum + item.closed_amount, 0);
      const totalRed = formattedData.reduce((sum, item) => sum + item.red_status_count, 0);
      const totalNoChange = formattedData.reduce((sum, item) => sum + item.no_change_count, 0);

      setSummaryStats({
        totalClosed,
        totalClosedAmount,
        totalRed,
        totalNoChange,
      });
    } catch (error) {
      console.error('Error loading progress data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Progress</h1>
              <p className="text-gray-600">Track your collection performance over time</p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as '7' | '30' | '90')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading progress data...</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-8 h-8 text-green-500" />
                  <span className="text-2xl font-bold text-gray-900">{summaryStats.totalClosed}</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase">Invoices Closed</h3>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="w-8 h-8 text-blue-500" />
                  <span className="text-2xl font-bold text-gray-900">
                    {formatCurrency(summaryStats.totalClosedAmount)}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase">Amount Collected</h3>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500">
                <div className="flex items-center justify-between mb-2">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <span className="text-2xl font-bold text-gray-900">{summaryStats.totalRed}</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase">Marked as Red</h3>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-gray-500">
                <div className="flex items-center justify-between mb-2">
                  <Clock className="w-8 h-8 text-gray-500" />
                  <span className="text-2xl font-bold text-gray-900">{summaryStats.totalNoChange}</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase">No Status Change</h3>
              </div>
            </div>

            {/* Closed Amount Chart */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Closed Amounts Over Time</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: '#1f2937' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="closed_amount"
                    stroke="#10b981"
                    strokeWidth={3}
                    name="Amount Closed"
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Invoice Count Chart */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Invoice Status Changes</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={progressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip labelStyle={{ color: '#1f2937' }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="closed_count"
                    stroke="#10b981"
                    strokeWidth={2}
                    name="Invoices Closed"
                    dot={{ fill: '#10b981', r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="red_status_count"
                    stroke="#ef4444"
                    strokeWidth={2}
                    name="Changed to Red"
                    dot={{ fill: '#ef4444', r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="no_change_count"
                    stroke="#6b7280"
                    strokeWidth={2}
                    name="No Status Change"
                    dot={{ fill: '#6b7280', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Daily Details Table */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Daily Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Closed
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount Closed
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Marked Red
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        No Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {progressData.map((day, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {day.date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-semibold">
                          {day.closed_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-blue-600 font-semibold">
                          {formatCurrency(day.closed_amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 font-semibold">
                          {day.red_status_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 font-semibold">
                          {day.no_change_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
