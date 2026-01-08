import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, TrendingUp, Calendar, CheckCircle, AlertCircle, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CollectorPerformanceAnalyticsProps {
  onBack?: () => void;
}

interface CollectorStats {
  user_id: string;
  full_name: string;
  total_changes: number;
  green_changes: number;
  orange_changes: number;
  red_changes: number;
  untouched_to_red: number;
  orange_to_green: number;
  working_days: number;
  tickets_assigned: number;
  invoices_assigned: number;
}

export default function CollectorPerformanceAnalytics({ onBack }: CollectorPerformanceAnalyticsProps) {
  const navigate = useNavigate();
  const [collectorStats, setCollectorStats] = useState<CollectorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  useEffect(() => {
    loadCollectorStats();
  }, [dateRange]);

  const loadCollectorStats = async () => {
    setLoading(true);
    try {
      const daysAgo = parseInt(dateRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const startStr = startDate.toISOString();

      const { data: collectors, error: collectorsError } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role', 'collector');

      if (collectorsError) throw collectorsError;

      const stats: CollectorStats[] = [];

      for (const collector of collectors || []) {
        const { data: activities, error: actError } = await supabase
          .from('user_activity_logs')
          .select('*')
          .eq('user_id', collector.id)
          .gte('created_at', startStr)
          .eq('action', 'invoice_color_change');

        if (actError) throw actError;

        const uniqueDays = new Set(
          activities?.map(a => a.created_at.split('T')[0]) || []
        ).size;

        const greenChanges = activities?.filter(a =>
          a.details?.new_color === 'green'
        ).length || 0;

        const orangeChanges = activities?.filter(a =>
          a.details?.new_color === 'orange'
        ).length || 0;

        const redChanges = activities?.filter(a =>
          a.details?.new_color === 'red'
        ).length || 0;

        const untouchedToRed = activities?.filter(a =>
          a.details?.old_color === null && a.details?.new_color === 'red'
        ).length || 0;

        const orangeToGreen = activities?.filter(a =>
          a.details?.old_color === 'orange' && a.details?.new_color === 'green'
        ).length || 0;

        const { count: ticketsCount } = await supabase
          .from('collection_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', collector.id);

        const { data: assignments } = await supabase
          .from('customer_assignments')
          .select('customer_id')
          .eq('user_id', collector.id);

        const customerIds = assignments?.map(a => a.customer_id) || [];

        let invoiceCount = 0;
        if (customerIds.length > 0) {
          const { count } = await supabase
            .from('acumatica_invoices')
            .select('*', { count: 'exact', head: true })
            .in('customer_id', customerIds)
            .eq('status', 'Open');

          invoiceCount = count || 0;
        }

        stats.push({
          user_id: collector.id,
          full_name: collector.full_name || 'Unknown',
          total_changes: activities?.length || 0,
          green_changes: greenChanges,
          orange_changes: orangeChanges,
          red_changes: redChanges,
          untouched_to_red: untouchedToRed,
          orange_to_green: orangeToGreen,
          working_days: uniqueDays,
          tickets_assigned: ticketsCount || 0,
          invoices_assigned: invoiceCount
        });
      }

      stats.sort((a, b) => b.total_changes - a.total_changes);
      setCollectorStats(stats);
    } catch (error) {
      console.error('Error loading collector stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-blue-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Collector Performance Analytics</h1>
            <p className="text-gray-600">Track collector activity and productivity</p>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="180">Last 6 Months</option>
            <option value="365">Last Year</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading collector performance data...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {collectorStats.map((collector) => (
              <div key={collector.user_id} className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{collector.full_name}</h2>
                      <p className="text-sm text-gray-600">{collector.total_changes} total status changes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
                    <Calendar className="w-5 h-5 text-green-600" />
                    <span className="text-green-700 font-semibold">{collector.working_days} working days</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-green-900">Green Status</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{collector.green_changes}</p>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                      <span className="text-sm font-medium text-orange-900">Orange Status</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-700">{collector.orange_changes}</p>
                  </div>

                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-medium text-red-900">Red Status</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">{collector.red_changes}</p>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Orange → Green</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{collector.orange_to_green}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <p className="text-sm text-gray-600">Untouched → Red</p>
                    <p className="text-xl font-bold text-gray-900">{collector.untouched_to_red}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-gray-600" />
                      <p className="text-sm text-gray-600">Tickets Assigned</p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">{collector.tickets_assigned}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Invoices Assigned</p>
                    <p className="text-xl font-bold text-gray-900">{collector.invoices_assigned}</p>
                  </div>
                </div>
              </div>
            ))}

            {collectorStats.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Collector Data</h3>
                <p className="text-gray-600">No collector performance data available for the selected period</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
