import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PieChart, TrendingUp, Users, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface InvoiceStatusAnalyticsProps {
  onBack?: () => void;
}

interface StatusDistribution {
  color: string;
  count: number;
}

interface StatusChangesOverTime {
  period: string;
  red_count: number;
  orange_count: number;
  yellow_count: number;
  green_count: number;
  total_changes: number;
}

interface UserStats {
  user_id: string;
  user_email: string;
  total_changes: number;
  red_changes: number;
  orange_changes: number;
  yellow_changes: number;
  green_changes: number;
}

export default function InvoiceStatusAnalytics({ onBack }: InvoiceStatusAnalyticsProps) {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState<'week' | 'month' | '3months'>('month');
  const [timeInterval, setTimeInterval] = useState<'day' | 'week' | 'month'>('day');
  const [distribution, setDistribution] = useState<StatusDistribution[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<StatusChangesOverTime[]>([]);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [selectedDate, dateRange, timeInterval]);

  const getDateRange = () => {
    const end = new Date(selectedDate);
    const start = new Date(selectedDate);

    switch (dateRange) {
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case '3months':
        start.setMonth(start.getMonth() - 3);
        break;
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const [distResult, timeSeriesResult, userStatsResult] = await Promise.all([
        supabase.rpc('get_status_distribution', { target_date: selectedDate }),
        supabase.rpc('get_status_changes_over_time', {
          start_date: start,
          end_date: end,
          time_interval: timeInterval
        }),
        supabase.rpc('get_user_status_change_stats', {
          start_date: start,
          end_date: end
        })
      ]);

      if (distResult.data) setDistribution(distResult.data);
      if (timeSeriesResult.data) setTimeSeriesData(timeSeriesResult.data);
      if (userStatsResult.data) setUserStats(userStatsResult.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getColorStyle = (color: string) => {
    switch (color) {
      case 'red': return { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' };
      case 'orange': return { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' };
      case 'yellow': return { bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' };
      case 'green': return { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' };
      default: return { bg: 'bg-gray-400', text: 'text-gray-400', border: 'border-gray-400' };
    }
  };

  const totalInvoices = distribution.reduce((sum, d) => sum + Number(d.count), 0);

  const renderPieChart = () => {
    if (totalInvoices === 0) return null;

    let currentAngle = 0;
    const radius = 80;
    const centerX = 100;
    const centerY = 100;

    return (
      <svg viewBox="0 0 200 200" className="w-64 h-64">
        {distribution.map((item, index) => {
          const percentage = (Number(item.count) / totalInvoices) * 100;
          const angle = (percentage / 100) * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;

          const x1 = centerX + radius * Math.cos((startAngle - 90) * Math.PI / 180);
          const y1 = centerY + radius * Math.sin((startAngle - 90) * Math.PI / 180);
          const x2 = centerX + radius * Math.cos((endAngle - 90) * Math.PI / 180);
          const y2 = centerY + radius * Math.sin((endAngle - 90) * Math.PI / 180);

          const largeArc = angle > 180 ? 1 : 0;

          const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');

          currentAngle = endAngle;

          const colorMap: any = {
            red: '#ef4444',
            orange: '#f97316',
            yellow: '#eab308',
            green: '#22c55e',
            none: '#9ca3af'
          };

          return (
            <path
              key={index}
              d={pathData}
              fill={colorMap[item.color] || '#9ca3af'}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}
      </svg>
    );
  };

  const renderLineChart = () => {
    if (timeSeriesData.length === 0) return null;

    const maxValue = Math.max(
      ...timeSeriesData.map(d =>
        Number(d.red_count) + Number(d.orange_count) + Number(d.yellow_count) + Number(d.green_count)
      )
    );

    const width = 600;
    const height = 300;
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    const xStep = chartWidth / (timeSeriesData.length - 1 || 1);

    const createPath = (getValue: (d: StatusChangesOverTime) => number, color: string) => {
      const points = timeSeriesData.map((d, i) => {
        const x = padding + i * xStep;
        const y = height - padding - (getValue(d) / maxValue) * chartHeight;
        return `${x},${y}`;
      });
      return `M ${points.join(' L ')}`;
    };

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-80">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="2" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="2" />

        <path d={createPath(d => Number(d.red_count), '#ef4444')} fill="none" stroke="#ef4444" strokeWidth="2" />
        <path d={createPath(d => Number(d.orange_count), '#f97316')} fill="none" stroke="#f97316" strokeWidth="2" />
        <path d={createPath(d => Number(d.yellow_count), '#eab308')} fill="none" stroke="#eab308" strokeWidth="2" />
        <path d={createPath(d => Number(d.green_count), '#22c55e')} fill="none" stroke="#22c55e" strokeWidth="2" />

        {timeSeriesData.map((d, i) => {
          const x = padding + i * xStep;
          const shouldShowLabel = i % Math.ceil(timeSeriesData.length / 6) === 0;
          return shouldShowLabel && (
            <text
              key={i}
              x={x}
              y={height - padding + 20}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {d.period.split('-').slice(1).join('/')}
            </text>
          );
        })}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <h1 className="text-3xl font-bold mb-8">Invoice Status Analytics</h1>

        <div className="bg-slate-900 rounded-lg p-6 mb-6 border border-slate-800">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Selected Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
                <option value="3months">Last 90 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Group By</label>
              <select
                value={timeInterval}
                onChange={(e) => setTimeInterval(e.target.value as any)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </div>

            <button
              onClick={loadAnalytics}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Current Status Distribution
            </h2>
            <div className="flex items-center justify-center">
              {renderPieChart()}
            </div>
            <div className="mt-6 space-y-2">
              {distribution.map((item) => {
                const styles = getColorStyle(item.color);
                const percentage = ((Number(item.count) / totalInvoices) * 100).toFixed(1);
                return (
                  <div key={item.color} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded ${styles.bg}`}></div>
                      <span className="capitalize font-medium">{item.color}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{item.count}</div>
                      <div className="text-sm text-slate-400">{percentage}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Status Changes Over Time
            </h2>
            <div className="flex items-center justify-center">
              {renderLineChart()}
            </div>
            <div className="mt-4 flex gap-4 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-500"></div>
                <span className="text-sm">Red</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-500"></div>
                <span className="text-sm">Orange</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-yellow-500"></div>
                <span className="text-sm">Yellow</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span className="text-sm">Green</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Activity Leaderboard
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-right py-3 px-4">Total Changes</th>
                  <th className="text-right py-3 px-4">
                    <span className="inline-block w-3 h-3 rounded bg-red-500 mr-1"></span>Red
                  </th>
                  <th className="text-right py-3 px-4">
                    <span className="inline-block w-3 h-3 rounded bg-orange-500 mr-1"></span>Orange
                  </th>
                  <th className="text-right py-3 px-4">
                    <span className="inline-block w-3 h-3 rounded bg-yellow-500 mr-1"></span>Yellow
                  </th>
                  <th className="text-right py-3 px-4">
                    <span className="inline-block w-3 h-3 rounded bg-green-500 mr-1"></span>Green
                  </th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((user, index) => (
                  <tr key={user.user_id} className="border-b border-slate-800 hover:bg-slate-800">
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 font-bold">
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-3 px-4">{user.user_email}</td>
                    <td className="py-3 px-4 text-right font-bold">{user.total_changes}</td>
                    <td className="py-3 px-4 text-right">{user.red_changes}</td>
                    <td className="py-3 px-4 text-right">{user.orange_changes}</td>
                    <td className="py-3 px-4 text-right">{user.yellow_changes}</td>
                    <td className="py-3 px-4 text-right">{user.green_changes}</td>
                  </tr>
                ))}
                {userStats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No user activity in the selected date range
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
