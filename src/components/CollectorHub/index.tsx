import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Search, Users, Activity, DollarSign, FileText, Mail, TrendingUp, Banknote
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CollectorDetailedProgress from '../CollectorDetailedProgress';
import CollectorCard from './CollectorCard';
import { CollectorCombined } from './types';

interface CollectorHubProps {
  onBack?: () => void;
}

export default function CollectorHub({ onBack }: CollectorHubProps) {
  const navigate = useNavigate();
  const [collectors, setCollectors] = useState<CollectorCombined[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCollector, setExpandedCollector] = useState<string | null>(null);
  const [selectedCollectorForProgress, setSelectedCollectorForProgress] = useState<{ id: string; name: string } | null>(null);
  const [sortBy, setSortBy] = useState<'collected' | 'changes' | 'name'>('collected');

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/dashboard');
  };

  useEffect(() => {
    loadAllData();
  }, [dateRange]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const daysAgo = dateRange;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);
      const startStr = startDate.toISOString();
      const startDateStr = startStr.split('T')[0];
      const endDateStr = new Date().toISOString().split('T')[0];

      const [profilesResult, monitoringResult, collectionResult] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, email, role').in('role', ['collector', 'admin', 'manager']),
        supabase.from('collector_activity_summary').select('*').order('last_activity_at', { ascending: false }),
        supabase.rpc('get_all_collectors_collection_summary', { p_start_date: startDateStr, p_end_date: endDateStr })
      ]);

      const profiles = profilesResult.data || [];
      const monitoring = monitoringResult.data || [];
      const collection = collectionResult.data || [];

      const monitoringMap = new Map<string, any>();
      monitoring.forEach((m: any) => monitoringMap.set(m.collector_id, m));

      const collectionMap = new Map<string, any>();
      collection.forEach((c: any) => collectionMap.set(c.collector_id, c));

      const combined: CollectorCombined[] = [];

      for (const profile of profiles) {
        const mon = monitoringMap.get(profile.id);
        const col = collectionMap.get(profile.id);

        const { data: colorChanges } = await supabase
          .from('invoice_change_log')
          .select('created_at, old_value, new_value')
          .eq('changed_by', profile.id)
          .eq('field_name', 'color_status')
          .gte('created_at', startStr);

        const uniqueDays = new Set((colorChanges || []).map((a: any) => a.created_at.split('T')[0])).size;

        const { data: directAssignments } = await supabase
          .from('invoice_assignments')
          .select('invoice_reference_number')
          .eq('assigned_collector_id', profile.id);

        const directRefNumbers = (directAssignments || []).map((d: any) => d.invoice_reference_number);

        const { data: customerAssignments } = await supabase
          .from('collector_customer_assignments')
          .select('customer_id')
          .eq('assigned_collector_id', profile.id);

        const customerIds = (customerAssignments || []).map((a: any) => a.customer_id);

        let allColors: (string | null)[] = [];

        if (directRefNumbers.length > 0) {
          const { data: directInvoices } = await supabase
            .from('acumatica_invoices')
            .select('color_status')
            .in('reference_number', directRefNumbers)
            .eq('status', 'Open');
          allColors.push(...(directInvoices || []).map((inv: any) => inv.color_status));
        }

        if (customerIds.length > 0) {
          const { data: customerInvoices } = await supabase
            .from('acumatica_invoices')
            .select('color_status')
            .in('customer', customerIds)
            .eq('status', 'Open');
          allColors.push(...(customerInvoices || []).map((inv: any) => inv.color_status));
        }

        const { count: ticketsCount } = await supabase
          .from('collection_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_collector_id', profile.id);

        const displayName = profile.full_name || profile.email?.split('@')[0] || 'Unknown';

        combined.push({
          user_id: profile.id,
          full_name: displayName,
          email: profile.email || '',
          role: profile.role || '',
          assigned_customers: mon?.assigned_customers || customerIds.length || 0,
          total_changes: colorChanges?.length || 0,
          green_changes: allColors.filter(c => c === 'green').length,
          orange_changes: allColors.filter(c => c === 'orange').length,
          red_changes: allColors.filter(c => c === 'red').length,
          untouched_to_red: (colorChanges || []).filter((a: any) => (a.old_value === null || a.old_value === 'null') && a.new_value === 'red').length,
          orange_to_green: (colorChanges || []).filter((a: any) => a.old_value === 'orange' && a.new_value === 'green').length,
          working_days: uniqueDays,
          tickets_assigned: ticketsCount || 0,
          invoices_assigned: allColors.length,
          invoices_modified: mon?.invoices_modified || 0,
          payments_modified: mon?.payments_modified || 0,
          emails_scheduled: mon?.emails_scheduled || 0,
          emails_sent: mon?.emails_sent || 0,
          last_activity_at: mon?.last_activity_at || null,
          total_collected: parseFloat(col?.total_collected) || 0,
          invoices_paid: col?.invoices_paid_count || 0,
          payment_count: col?.payment_count || 0
        });
      }

      setCollectors(combined);
    } catch (error) {
      console.error('Error loading collector data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (selectedCollectorForProgress) {
    return (
      <CollectorDetailedProgress
        collectorId={selectedCollectorForProgress.id}
        collectorName={selectedCollectorForProgress.name}
        onBack={() => setSelectedCollectorForProgress(null)}
      />
    );
  }

  const filtered = collectors
    .filter(c =>
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'collected') return b.total_collected - a.total_collected;
      if (sortBy === 'changes') return b.total_changes - a.total_changes;
      return a.full_name.localeCompare(b.full_name);
    });

  const totals = collectors.reduce((acc, c) => ({
    totalCollectors: acc.totalCollectors + 1,
    totalCollected: acc.totalCollected + c.total_collected,
    totalInvoicesPaid: acc.totalInvoicesPaid + c.invoices_paid,
    totalInvoicesModified: acc.totalInvoicesModified + c.invoices_modified,
    totalPaymentsModified: acc.totalPaymentsModified + c.payments_modified,
    totalEmailsSent: acc.totalEmailsSent + c.emails_sent,
    activeToday: acc.activeToday + (c.last_activity_at && new Date(c.last_activity_at).toDateString() === new Date().toDateString() ? 1 : 0)
  }), {
    totalCollectors: 0, totalCollected: 0, totalInvoicesPaid: 0,
    totalInvoicesModified: 0, totalPaymentsModified: 0, totalEmailsSent: 0, activeToday: 0
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold">Collector Dashboard</h1>
              <p className="text-slate-300 mt-1">Performance analytics, monitoring, and activity oversight</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-slate-300" />
                <p className="text-xs text-slate-300">Collectors</p>
              </div>
              <p className="text-2xl font-bold">{totals.totalCollectors}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-green-400" />
                <p className="text-xs text-slate-300">Active Today</p>
              </div>
              <p className="text-2xl font-bold text-green-400">{totals.activeToday}</p>
            </div>
            <div className="bg-emerald-600/30 backdrop-blur-sm rounded-xl p-4 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-300" />
                <p className="text-xs text-emerald-200">Total Collected</p>
              </div>
              <p className="text-2xl font-bold text-emerald-300">
                ${totals.totalCollected.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Banknote className="w-4 h-4 text-teal-300" />
                <p className="text-xs text-slate-300">Invoices Paid</p>
              </div>
              <p className="text-2xl font-bold text-teal-300">{totals.totalInvoicesPaid}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-slate-300" />
                <p className="text-xs text-slate-300">Inv. Modified</p>
              </div>
              <p className="text-2xl font-bold">{totals.totalInvoicesModified}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-slate-300" />
                <p className="text-xs text-slate-300">Pay. Modified</p>
              </div>
              <p className="text-2xl font-bold">{totals.totalPaymentsModified}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            />
          </div>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
          >
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={60}>Last 60 Days</option>
            <option value={90}>Last 90 Days</option>
            <option value={180}>Last 6 Months</option>
            <option value={365}>Last Year</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium"
          >
            <option value="collected">Sort by: Total Collected</option>
            <option value="changes">Sort by: Status Changes</option>
            <option value="name">Sort by: Name</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading collector data...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((collector) => (
              <CollectorCard
                key={collector.user_id}
                collector={collector}
                isExpanded={expandedCollector === collector.user_id}
                onToggleExpand={() => setExpandedCollector(expandedCollector === collector.user_id ? null : collector.user_id)}
                onViewProgress={() => setSelectedCollectorForProgress({ id: collector.user_id, name: collector.full_name })}
                dateRange={dateRange}
              />
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl shadow-sm">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchTerm ? 'No Matching Collectors' : 'No Collector Data'}
                </h3>
                <p className="text-gray-500">
                  {searchTerm ? 'Try a different search term' : 'No collector data available for the selected period'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
