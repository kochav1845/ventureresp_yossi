import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, TrendingUp, Calendar, CheckCircle, AlertCircle, Ticket, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import CollectorDetailedProgress from './CollectorDetailedProgress';

interface CollectorPerformanceAnalyticsProps {
  onBack?: () => void;
}

interface CollectorStats {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
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
  const [selectedCollector, setSelectedCollector] = useState<{ id: string; name: string } | null>(null);

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
        .select('id, full_name, email, role')
        .in('role', ['collector', 'admin', 'manager']);

      if (collectorsError) throw collectorsError;

      const stats: CollectorStats[] = [];

      for (const collector of collectors || []) {
        // Get color status changes from invoice_change_log for activity tracking
        const { data: colorChanges, error: actError } = await supabase
          .from('invoice_change_log')
          .select('*')
          .eq('changed_by', collector.id)
          .eq('field_name', 'color_status')
          .gte('created_at', startStr);

        if (actError) throw actError;

        const uniqueDays = new Set(
          colorChanges?.map(a => a.created_at.split('T')[0]) || []
        ).size;

        // Get invoices from direct assignments
        const { data: directInvoices } = await supabase
          .from('invoice_assignments')
          .select('invoice_reference_number')
          .eq('assigned_collector_id', collector.id);

        const directRefNumbers = directInvoices?.map(d => d.invoice_reference_number) || [];

        // Get customers assigned to this collector
        const { data: customerAssignments } = await supabase
          .from('collector_customer_assignments')
          .select('customer_id')
          .eq('assigned_collector_id', collector.id);

        const customerIds = customerAssignments?.map(a => a.customer_id) || [];

        // Get invoices directly assigned
        let directInvoiceColors: any[] = [];
        if (directRefNumbers.length > 0) {
          const { data } = await supabase
            .from('acumatica_invoices')
            .select('color_status')
            .in('reference_number', directRefNumbers)
            .eq('status', 'Open');
          directInvoiceColors = data || [];
        }

        // Get invoices from customer assignments
        let customerInvoiceColors: any[] = [];
        if (customerIds.length > 0) {
          const { data } = await supabase
            .from('acumatica_invoices')
            .select('color_status')
            .in('customer', customerIds)
            .eq('status', 'Open');
          customerInvoiceColors = data || [];
        }

        // Combine and count current status of assigned invoices
        const allInvoices = [...directInvoiceColors, ...customerInvoiceColors];
        const greenChanges = allInvoices.filter(a => a.color_status === 'green').length;
        const orangeChanges = allInvoices.filter(a => a.color_status === 'orange').length;
        const redChanges = allInvoices.filter(a => a.color_status === 'red').length;

        // Historical change tracking
        const untouchedToRed = colorChanges?.filter(a =>
          (a.old_value === null || a.old_value === 'null') && a.new_value === 'red'
        ).length || 0;

        const orangeToGreen = colorChanges?.filter(a =>
          a.old_value === 'orange' && a.new_value === 'green'
        ).length || 0;

        const { count: ticketsCount } = await supabase
          .from('collection_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_collector_id', collector.id);

        // Total invoices is the count we already calculated above
        const totalInvoices = allInvoices.length;

        // Use email as name if full_name is not set
        const displayName = collector.full_name || collector.email?.split('@')[0] || 'Unknown';

        stats.push({
          user_id: collector.id,
          full_name: displayName,
          email: collector.email || '',
          role: collector.role || '',
          total_changes: colorChanges?.length || 0,
          green_changes: greenChanges,
          orange_changes: orangeChanges,
          red_changes: redChanges,
          untouched_to_red: untouchedToRed,
          orange_to_green: orangeToGreen,
          working_days: uniqueDays,
          tickets_assigned: ticketsCount || 0,
          invoices_assigned: totalInvoices
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

  // If a collector is selected, show their detailed progress
  if (selectedCollector) {
    return (
      <CollectorDetailedProgress
        collectorId={selectedCollector.id}
        collectorName={selectedCollector.name}
        onBack={() => setSelectedCollector(null)}
      />
    );
  }

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
              <div
                key={collector.user_id}
                className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setSelectedCollector({ id: collector.user_id, name: collector.full_name })}
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{collector.full_name}</h2>
                      <p className="text-sm text-blue-600 font-medium">{collector.email}</p>
                      <p className="text-sm text-gray-600">{collector.total_changes} manual status changes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg">
                      <Calendar className="w-5 h-5 text-green-600" />
                      <span className="text-green-700 font-semibold">{collector.working_days} working days</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCollector({ id: collector.user_id, name: collector.full_name });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View Details
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-green-900">Green Invoices</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700">{collector.green_changes}</p>
                    <p className="text-xs text-green-600 mt-1">Currently assigned</p>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                      <span className="text-sm font-medium text-orange-900">Orange Invoices</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-700">{collector.orange_changes}</p>
                    <p className="text-xs text-orange-600 mt-1">Currently assigned</p>
                  </div>

                  <div className="bg-red-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <span className="text-sm font-medium text-red-900">Red Invoices</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">{collector.red_changes}</p>
                    <p className="text-xs text-red-600 mt-1">Currently assigned</p>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Resolved</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{collector.orange_to_green}</p>
                    <p className="text-xs text-blue-600 mt-1">Orange → Green</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <p className="text-sm text-gray-600">Marked Red</p>
                    <p className="text-xl font-bold text-gray-900">{collector.untouched_to_red}</p>
                    <p className="text-xs text-gray-500">Manual changes</p>
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
