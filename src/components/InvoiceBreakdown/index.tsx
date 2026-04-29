import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Calendar, Download, Filter, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { InvoiceMonthSummary, InvoiceDateBreakdownRow, InvoiceDaySummary } from './types';
import InvoiceMonthTable from './InvoiceMonthTable';
import InvoiceDateDrillDown from './InvoiceDateDrillDown';
import InvoiceSummaryCards from './InvoiceSummaryCards';

export default function InvoiceBreakdown() {
  const navigate = useNavigate();
  const [months, setMonths] = useState<InvoiceMonthSummary[]>([]);
  const [filteredMonths, setFilteredMonths] = useState<InvoiceMonthSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [dateDrillDown, setDateDrillDown] = useState<InvoiceDaySummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [showBalance, setShowBalance] = useState(false);

  const loadMonthSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_invoice_month_summary');
      if (error) throw error;
      setMonths(data || []);
      setFilteredMonths(data || []);
    } catch (err) {
      console.error('Failed to load invoice month summaries:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonthSummaries();
  }, [loadMonthSummaries]);

  useEffect(() => {
    let result = [...months];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.month_label.toLowerCase().includes(q) || m.month_key.includes(q)
      );
    }

    if (dateRange.start) {
      result = result.filter(m => m.month_key >= dateRange.start.substring(0, 7));
    }
    if (dateRange.end) {
      result = result.filter(m => m.month_key <= dateRange.end.substring(0, 7));
    }

    setFilteredMonths(result);
  }, [months, searchQuery, dateRange]);

  const handleMonthClick = async (monthKey: string) => {
    if (selectedMonth === monthKey) {
      setSelectedMonth(null);
      setDateDrillDown(null);
      return;
    }

    setSelectedMonth(monthKey);
    setDrillDownLoading(true);

    try {
      const [year, month] = monthKey.split('-').map(Number);
      const { data, error } = await supabase.rpc('get_invoice_breakdown_by_date', {
        p_year: year,
        p_month: month,
      });

      if (error) throw error;

      const dayMap = new Map<string, InvoiceDaySummary>();
      (data as InvoiceDateBreakdownRow[]).forEach(row => {
        const existing = dayMap.get(row.day_date) || {
          date: row.day_date,
          label: row.day_label,
          total_count: 0,
          total_amount: 0,
          total_balance: 0,
          types: {},
        };

        existing.total_count += row.invoice_count;
        existing.total_amount += Number(row.total_amount);
        existing.total_balance += Number(row.total_balance);

        if (!existing.types[row.invoice_type]) {
          existing.types[row.invoice_type] = { count: 0, amount: 0, balance: 0, statuses: {} };
        }
        existing.types[row.invoice_type].count += row.invoice_count;
        existing.types[row.invoice_type].amount += Number(row.total_amount);
        existing.types[row.invoice_type].balance += Number(row.total_balance);

        if (!existing.types[row.invoice_type].statuses[row.invoice_status]) {
          existing.types[row.invoice_type].statuses[row.invoice_status] = { count: 0, amount: 0, balance: 0 };
        }
        existing.types[row.invoice_type].statuses[row.invoice_status].count += row.invoice_count;
        existing.types[row.invoice_type].statuses[row.invoice_status].amount += Number(row.total_amount);
        existing.types[row.invoice_type].statuses[row.invoice_status].balance += Number(row.total_balance);

        dayMap.set(row.day_date, existing);
      });

      setDateDrillDown(Array.from(dayMap.values()));
    } catch (err) {
      console.error('Failed to load date breakdown:', err);
    } finally {
      setDrillDownLoading(false);
    }
  };

  const handleExportCSV = () => {
    const rows = filteredMonths.map(m => ({
      Month: m.month_label,
      'Total Docs': m.total_invoices,
      'Total Amount': m.total_amount,
      'Total Balance': m.total_balance,
      'Invoices': m.invoice_count,
      'Invoice Amount': m.invoice_amount,
      'Invoice Balance': m.invoice_balance,
      'Credit Memos': m.credit_memo_count,
      'Credit Memo Amount': m.credit_memo_amount,
      'Credit Memo Balance': m.credit_memo_balance,
      'Debit Memos': m.debit_memo_count,
      'Debit Memo Amount': m.debit_memo_amount,
      'Debit Memo Balance': m.debit_memo_balance,
      'Credit W/O': m.credit_wo_count,
      'Credit W/O Amount': m.credit_wo_amount,
      'Overdue Charges': m.overdue_charge_count,
      'Overdue Charge Amount': m.overdue_charge_amount,
    }));

    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => r[h as keyof typeof r]).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-breakdown-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDateRange({ start: '', end: '' });
  };

  const selectedMonthData = months.find(m => m.month_key === selectedMonth);
  const hasActiveFilters = searchQuery || dateRange.start || dateRange.end;

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invoice Breakdown</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Compare months and drill down to daily invoice details
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={filteredMonths.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={loadMonthSummaries}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search month (e.g., Jan 2025, 2024-12)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter size={16} />
              Date Range
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              )}
            </button>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
                showBalance
                  ? 'bg-teal-50 border-teal-200 text-teal-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                showBalance ? 'bg-teal-500 border-teal-500' : 'border-gray-300'
              }`}>
                {showBalance && (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              Show Open Balance
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <label className="text-xs font-medium text-gray-500">From:</label>
                <input
                  type="month"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">To:</label>
                <input
                  type="month"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw size={32} className="animate-spin text-blue-500 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading invoice data...</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4">
              <InvoiceSummaryCards months={filteredMonths} />
            </div>

            {selectedMonth && dateDrillDown && !drillDownLoading && (
              <div className="px-4 pb-4">
                <InvoiceDateDrillDown
                  days={dateDrillDown}
                  monthLabel={selectedMonthData?.month_label || selectedMonth}
                  onBack={() => { setSelectedMonth(null); setDateDrillDown(null); }}
                  showBalance={showBalance}
                />
              </div>
            )}

            {drillDownLoading && (
              <div className="flex items-center justify-center py-10">
                <RefreshCw size={24} className="animate-spin text-blue-500 mr-2" />
                <span className="text-sm text-gray-500">Loading daily breakdown...</span>
              </div>
            )}

            <div className="border-t border-gray-100">
              <div className="px-4 py-3 flex items-center justify-between bg-gray-50/50">
                <h3 className="text-sm font-semibold text-gray-700">
                  Month Comparison ({filteredMonths.length} months)
                </h3>
                <p className="text-xs text-gray-500">Click a month to see daily breakdown</p>
              </div>
              <InvoiceMonthTable
                months={filteredMonths}
                onMonthClick={handleMonthClick}
                selectedMonth={selectedMonth}
                showBalance={showBalance}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
