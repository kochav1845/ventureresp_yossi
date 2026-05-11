import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, TrendingUp, DollarSign, Users, FileText, RefreshCw, ArrowUpDown, Search, Download, Filter, X, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAcumaticaInvoiceUrl } from '../lib/acumaticaLinks';
import * as XLSX from 'xlsx';

interface InvoiceRow {
  id: string;
  reference_number: string;
  type: string;
  status: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  customer: string;
  customer_name: string;
  description: string;
  color_status: string;
}

type SortField = keyof InvoiceRow;
type SortDirection = 'asc' | 'desc';

const formatDateString = (dateString: string): string => {
  if (!dateString) return 'N/A';
  try {
    if (dateString.includes('T') || dateString.includes(' ')) {
      const date = new Date(dateString);
      return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
    }
    const [year, month, day] = dateString.split('-');
    return `${parseInt(month)}/${parseInt(day)}/${year}`;
  } catch {
    return dateString;
  }
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const formatCurrencyFull = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function InvoiceAnalyticsPage() {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [calendarView, setCalendarView] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceRow[]>([]);
  const [allFilteredInvoices, setAllFilteredInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBatchInfo, setLoadingBatchInfo] = useState('');

  const [monthlyAggregates, setMonthlyAggregates] = useState<{ month: number; total: number; count: number; balance: number; openBalance: number; customers: number; creditMemoAmount: number; creditMemoCount: number }[]>([]);
  const [yearlyAggregates, setYearlyAggregates] = useState<{ year: number; total: number; count: number; balance: number; openBalance: number; customers: number; creditMemoAmount: number; creditMemoCount: number }[]>([]);

  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [monthlyBalance, setMonthlyBalance] = useState(0);
  const [monthlyInvoiceCount, setMonthlyInvoiceCount] = useState(0);
  const [monthlyCustomerCount, setMonthlyCustomerCount] = useState(0);
  const [monthlyCreditMemoTotal, setMonthlyCreditMemoTotal] = useState(0);
  const [monthlyCreditMemoCount, setMonthlyCreditMemoCount] = useState(0);

  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [tempFilterStatus, setTempFilterStatus] = useState('all');
  const [tempFilterType, setTempFilterType] = useState('all');
  const [tempDateFrom, setTempDateFrom] = useState('');
  const [tempDateTo, setTempDateTo] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const hasActiveFilters = filterStatus !== 'all' || filterType !== 'all';

  const monthName = `${MONTH_NAMES[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`;

  // Day groups for headers in the table
  const dayGroups = useMemo(() => {
    const source = selectedDate ? filteredInvoices : allFilteredInvoices;
    if (source.length === 0) return null;
    const groups = new Map<string, { invoices: InvoiceRow[]; total: number; balance: number; count: number }>();
    for (const inv of source) {
      const dayKey = inv.date ? inv.date.split('T')[0] : 'unknown';
      const existing = groups.get(dayKey);
      if (existing) {
        existing.invoices.push(inv);
        existing.total += inv.amount;
        existing.balance += inv.balance;
        existing.count += 1;
      } else {
        groups.set(dayKey, { invoices: [inv], total: inv.amount, balance: inv.balance, count: 1 });
      }
    }
    return groups;
  }, [filteredInvoices, allFilteredInvoices, selectedDate]);

  // Customer-grouped data for the table
  const customerGroups = useMemo(() => {
    const source = filteredInvoices;
    if (source.length === 0) return [];
    const map = new Map<string, { customerName: string; customerId: string; invoices: InvoiceRow[]; totalAmount: number; totalBalance: number }>();
    for (const inv of source) {
      const key = inv.customer || 'unknown';
      const existing = map.get(key);
      if (existing) {
        existing.invoices.push(inv);
        existing.totalAmount += inv.amount;
        existing.totalBalance += inv.balance;
      } else {
        map.set(key, {
          customerName: inv.customer_name || 'Unknown',
          customerId: key,
          invoices: [inv],
          totalAmount: inv.amount,
          totalBalance: inv.balance,
        });
      }
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => b.totalAmount - a.totalAmount);
    return groups;
  }, [filteredInvoices]);

  // Unique filter values
  const uniqueStatuses = useMemo(() => {
    const set = new Set(invoices.map(i => i.status).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [invoices]);

  const uniqueTypes = useMemo(() => {
    const set = new Set(invoices.map(i => i.type).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [invoices]);

  // Load data based on view
  useEffect(() => {
    if (calendarView === 'monthly') {
      setYearlyAggregates([]);
      setInvoices([]);
      loadMonthlyAggregates(selectedYear);
    } else if (calendarView === 'yearly') {
      setMonthlyAggregates([]);
      setInvoices([]);
      loadYearlyAggregates();
    } else {
      setMonthlyAggregates([]);
      setYearlyAggregates([]);
      loadDailyData();
    }
  }, [calendarView, selectedYear, selectedMonth, dateFrom, dateTo, filterStatus, filterType]);

  useEffect(() => {
    filterAndSortInvoices();
  }, [invoices, searchTerm, sortField, sortDirection, filterStatus, filterType, selectedDate]);

  useEffect(() => {
    if (calendarView === 'daily') {
      const nonCM = allFilteredInvoices.filter(i => i.type !== 'Credit Memo');
      const cms = allFilteredInvoices.filter(i => i.type === 'Credit Memo');
      const total = nonCM.reduce((sum, i) => sum + i.amount, 0);
      const cmTotal = cms.reduce((sum, i) => sum + i.amount, 0);
      const balance = allFilteredInvoices.reduce((sum, i) => sum + i.balance, 0);
      const customers = new Set(allFilteredInvoices.map(i => i.customer).filter(Boolean));
      setMonthlyTotal(total);
      setMonthlyBalance(balance);
      setMonthlyInvoiceCount(nonCM.length);
      setMonthlyCustomerCount(customers.size);
      setMonthlyCreditMemoTotal(cmTotal);
      setMonthlyCreditMemoCount(cms.length);
    }
  }, [allFilteredInvoices, calendarView]);

  useEffect(() => {
    setTempFilterStatus(filterStatus);
    setTempFilterType(filterType);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
  }, []);

  const loadDailyData = async () => {
    setLoading(true);
    setLoadingBatchInfo('');
    setInvoices([]);
    try {
      let startStr: string;
      let endStr: string;

      if (dateFrom && dateTo) {
        startStr = dateFrom;
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        endStr = endDate.toISOString().split('T')[0];
      } else if (dateFrom) {
        startStr = dateFrom;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        endStr = tomorrow.toISOString().split('T')[0];
      } else {
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        startStr = new Date(year, month, 1).toISOString().split('T')[0];
        endStr = new Date(year, month + 1, 1).toISOString().split('T')[0];
      }

      const batchSize = 500;
      let offset = 0;
      let hasMore = true;
      let accumulated: InvoiceRow[] = [];
      let isFirstBatch = true;

      while (hasMore) {
        setLoadingBatchInfo(isFirstBatch ? 'Loading invoices...' : `Loading invoices... (${accumulated.length} loaded)`);

        let query = supabase
          .from('acumatica_invoices')
          .select('id, reference_number, type, status, date, due_date, amount, balance, customer, customer_name, description, color_status')
          .gte('date', startStr)
          .lt('date', endStr)
          .neq('status', 'On Hold')
          .order('date', { ascending: false })
          .order('reference_number', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (filterType !== 'all') {
          query = query.eq('type', filterType);
        }

        const { data: batch, error } = await query;
        if (error) throw error;

        if (batch && batch.length > 0) {
          const rows: InvoiceRow[] = batch.map((inv: any) => ({
            id: inv.id,
            reference_number: inv.reference_number || '',
            type: inv.type || '',
            status: inv.status || '',
            date: inv.date || '',
            due_date: inv.due_date || '',
            amount: parseFloat(inv.amount) || 0,
            balance: parseFloat(inv.balance) || 0,
            customer: inv.customer || '',
            customer_name: inv.customer_name || 'N/A',
            description: inv.description || '',
            color_status: inv.color_status || '',
          }));

          accumulated = [...accumulated, ...rows];
          setInvoices(accumulated);

          if (isFirstBatch) {
            setLoading(false);
            isFirstBatch = false;
          }

          offset += batchSize;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      if (isFirstBatch) {
        setInvoices([]);
      }
    } catch (error) {
      console.error('Error loading daily invoice data:', error);
    } finally {
      setLoading(false);
      setLoadingBatchInfo('');
    }
  };

  const loadMonthlyAggregates = async (year: number) => {
    setLoading(true);
    setLoadingBatchInfo('');
    try {
      const { data: cachedData, error } = await supabase
        .from('cached_invoice_analytics')
        .select('*')
        .eq('period_type', 'monthly')
        .eq('year', year)
        .order('month', { ascending: true });

      if (error) throw error;

      if (cachedData && cachedData.length > 0) {
        const aggregates = Array.from({ length: 12 }, (_, idx) => ({
          month: idx,
          total: 0,
          count: 0,
          balance: 0,
          openBalance: 0,
          customers: 0,
          creditMemoAmount: 0,
          creditMemoCount: 0,
        }));
        let totalAmount = 0;
        let totalBalance = 0;
        let totalCount = 0;
        let totalCustomers = 0;
        let totalCMAmount = 0;
        let totalCMCount = 0;

        cachedData.forEach((row: any) => {
          if (row.month >= 1 && row.month <= 12) {
            const amt = parseFloat(row.total_amount) || 0;
            const bal = parseFloat(row.total_open_balance) || 0;
            const cnt = row.invoice_count || 0;
            const cust = row.unique_customer_count || 0;
            const cmAmt = parseFloat(row.credit_memo_amount) || 0;
            const cmCnt = row.credit_memo_count || 0;
            aggregates[row.month - 1] = {
              month: row.month - 1,
              total: amt,
              count: cnt,
              balance: parseFloat(row.total_balance) || 0,
              openBalance: bal,
              customers: cust,
              creditMemoAmount: cmAmt,
              creditMemoCount: cmCnt,
            };
            totalAmount += amt;
            totalBalance += bal;
            totalCount += cnt;
            totalCustomers += cust;
            totalCMAmount += cmAmt;
            totalCMCount += cmCnt;
          }
        });

        setMonthlyAggregates(aggregates);
        setMonthlyTotal(totalAmount - totalCMAmount);
        setMonthlyBalance(totalBalance);
        setMonthlyInvoiceCount(totalCount - totalCMCount);
        setMonthlyCustomerCount(totalCustomers);
        setMonthlyCreditMemoTotal(totalCMAmount);
        setMonthlyCreditMemoCount(totalCMCount);
        if (cachedData[0].calculated_at) {
          setLastRefreshTime(new Date(cachedData[0].calculated_at));
        }
      } else {
        setLoadingBatchInfo('Building analytics cache...');
        await refreshAnalyticsCache('monthly', year);
      }
    } catch (error) {
      console.error('Error loading monthly aggregates:', error);
    } finally {
      setLoading(false);
      setLoadingBatchInfo('');
    }
  };

  const loadYearlyAggregates = async () => {
    setLoading(true);
    try {
      const { data: cachedData, error } = await supabase
        .from('cached_invoice_analytics')
        .select('*')
        .eq('period_type', 'yearly')
        .order('year', { ascending: false });

      if (error) throw error;

      if (cachedData && cachedData.length > 0) {
        const aggregates = cachedData.map((row: any) => ({
          year: row.year,
          total: parseFloat(row.total_amount) || 0,
          count: row.invoice_count || 0,
          balance: parseFloat(row.total_balance) || 0,
          openBalance: parseFloat(row.total_open_balance) || 0,
          customers: row.unique_customer_count || 0,
          creditMemoAmount: parseFloat(row.credit_memo_amount) || 0,
          creditMemoCount: row.credit_memo_count || 0,
        }));

        setYearlyAggregates(aggregates);
        const totalAmount = aggregates.reduce((s, a) => s + a.total, 0);
        const totalCount = aggregates.reduce((s, a) => s + a.count, 0);
        const totalCM = aggregates.reduce((s, a) => s + a.creditMemoAmount, 0);
        const totalCMCnt = aggregates.reduce((s, a) => s + a.creditMemoCount, 0);
        setMonthlyTotal(totalAmount - totalCM);
        setMonthlyInvoiceCount(totalCount - totalCMCnt);
        setMonthlyBalance(aggregates.reduce((s, a) => s + a.openBalance, 0));
        setMonthlyCustomerCount(0);
        setMonthlyCreditMemoTotal(totalCM);
        setMonthlyCreditMemoCount(totalCMCnt);
        if (cachedData[0].calculated_at) {
          setLastRefreshTime(new Date(cachedData[0].calculated_at));
        }
      } else {
        await refreshAnalyticsCache('yearly');
      }
    } catch (error) {
      console.error('Error loading yearly aggregates:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshAnalyticsCache = async (periodType = 'monthly', year?: number) => {
    setRefreshingAnalytics(true);
    try {
      const targetYear = year || (periodType === 'monthly' ? selectedYear : undefined);

      const { data, error } = await supabase.rpc('refresh_cached_invoice_analytics', {
        p_period_type: periodType,
        p_year: targetYear || null,
        p_month: periodType === 'daily' ? (selectedMonth.getMonth() + 1) : null,
      });

      if (error) throw error;

      setLastRefreshTime(new Date());

      if (periodType === 'monthly') {
        await loadMonthlyAggregates(targetYear || selectedYear);
      } else if (periodType === 'yearly') {
        await loadYearlyAggregates();
      } else {
        await loadDailyData();
      }
    } catch (error: any) {
      console.error('Error refreshing analytics:', error);
      alert('Error refreshing analytics: ' + error.message);
    } finally {
      setRefreshingAnalytics(false);
    }
  };

  const refreshCurrentView = async () => {
    if (calendarView === 'monthly') {
      await refreshAnalyticsCache('monthly', selectedYear);
    } else if (calendarView === 'yearly') {
      await refreshAnalyticsCache('yearly');
    } else {
      await refreshAnalyticsCache('daily');
    }
  };

  const filterAndSortInvoices = () => {
    let filtered = [...invoices];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(i =>
        i.reference_number.toLowerCase().includes(search) ||
        i.customer_name.toLowerCase().includes(search) ||
        i.customer.toLowerCase().includes(search) ||
        i.type.toLowerCase().includes(search) ||
        i.description.toLowerCase().includes(search)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(i => i.status === filterStatus);
    }
    if (filterType !== 'all') {
      filtered = filtered.filter(i => i.type === filterType);
    }

    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    setAllFilteredInvoices(filtered);

    if (selectedDate) {
      const selectedDateStr = selectedDate.toISOString().split('T')[0];
      filtered = filtered.filter(i => i.date.split('T')[0] === selectedDateStr);
    }

    setFilteredInvoices(filtered);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const applyFilters = () => {
    setFilterStatus(tempFilterStatus);
    setFilterType(tempFilterType);
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
  };

  const clearFilters = () => {
    setTempFilterStatus('all');
    setTempFilterType('all');
    setTempDateFrom('');
    setTempDateTo('');
    setFilterStatus('all');
    setFilterType('all');
    setDateFrom('');
    setDateTo('');
    setSelectedDate(null);
  };

  const previousPeriod = () => {
    if (calendarView === 'daily') {
      setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else if (calendarView === 'monthly') {
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedYear(prev => prev - 6);
    }
  };

  const nextPeriod = () => {
    if (calendarView === 'daily') {
      setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    } else if (calendarView === 'monthly') {
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedYear(prev => prev + 6);
    }
  };

  const getCalendarDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];

    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push(new Date(year, month + 1, i));
      }
    }
    return days;
  };

  const getDayInvoices = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return allFilteredInvoices.filter(inv => inv.date.split('T')[0] === dateStr);
  };

  const getMonthlyData = () => {
    if (monthlyAggregates.length > 0) {
      return monthlyAggregates.map(agg => ({
        month: agg.month,
        name: MONTH_NAMES[agg.month],
        total: agg.total,
        count: agg.count,
        balance: agg.balance,
        openBalance: agg.openBalance,
        customers: agg.customers,
        creditMemoAmount: agg.creditMemoAmount,
        creditMemoCount: agg.creditMemoCount,
      }));
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: i,
      name: MONTH_NAMES[i],
      total: 0,
      count: 0,
      balance: 0,
      openBalance: 0,
      customers: 0,
      creditMemoAmount: 0,
      creditMemoCount: 0,
    }));
  };

  const getYearlyData = () => {
    if (yearlyAggregates.length > 0) return yearlyAggregates;
    return [];
  };

  const exportToExcel = () => {
    const rows: Record<string, any>[] = [];
    for (const group of customerGroups) {
      rows.push({
        Customer_ID: group.customerId,
        Customer_Name: group.customerName,
        Invoice_Count: group.invoices.length,
        Total_Amount: group.totalAmount,
        Total_Balance: group.totalBalance,
        Date: '',
        Reference: '',
        Type: '',
        Status: '',
        Due_Date: '',
        Description: '',
      });
      for (const inv of group.invoices) {
        rows.push({
          Customer_ID: '',
          Customer_Name: '',
          Invoice_Count: '',
          Total_Amount: '',
          Total_Balance: '',
          Date: formatDateString(inv.date),
          Reference: inv.reference_number,
          Type: inv.type,
          Status: inv.status,
          Due_Date: formatDateString(inv.due_date),
          Description: inv.description,
          Amount: inv.amount,
          Balance: inv.balance,
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Invoices');
    XLSX.writeFile(wb, `invoice_analytics_${selectedMonth.getFullYear()}_${selectedMonth.getMonth() + 1}.xlsx`);
  };

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10 cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-blue-500' : 'text-gray-400'}`} />
      </div>
    </th>
  );

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Open: 'bg-amber-100 text-amber-700 border-amber-200',
      Closed: 'bg-green-100 text-green-700 border-green-200',
      Balanced: 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      Invoice: 'bg-blue-50 text-blue-700',
      'Credit Memo': 'bg-emerald-50 text-emerald-700',
      'Debit Memo': 'bg-amber-50 text-amber-700',
    };
    return colors[type] || 'bg-gray-50 text-gray-700';
  };

  const getColorDot = (colorStatus: string) => {
    if (!colorStatus || colorStatus === 'none') return null;
    const colors: Record<string, string> = {
      red: 'bg-red-500',
      yellow: 'bg-yellow-500',
      green: 'bg-green-500',
      blue: 'bg-blue-500',
      orange: 'bg-orange-500',
    };
    return colors[colorStatus] || null;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg transition-colors shadow-sm"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                Invoice Analytics
              </h1>
              <p className="text-gray-600 mt-1">Monthly invoice tracking and analysis</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className={`${sidebarCollapsed ? 'w-16' : 'w-80'} bg-gray-50 border-r border-gray-200 transition-all duration-300 overflow-hidden flex-shrink-0`}>
          <div className="p-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors mb-4"
            >
              {!sidebarCollapsed && <span className="font-semibold">Filters</span>}
              {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            </button>

            {!sidebarCollapsed && (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Summary
                  </h3>
                  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Net Amount</p>
                    <p className="text-xl font-bold text-gray-700">{formatCurrency(monthlyTotal - monthlyCreditMemoTotal)}</p>
                    {monthlyCreditMemoTotal > 0 && (
                      <p className="text-xs text-red-500 mt-1">CM: -{formatCurrency(monthlyCreditMemoTotal)}</p>
                    )}
                  </div>
                  <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Open Balance</p>
                    <p className="text-xl font-bold text-gray-700">{formatCurrency(monthlyBalance)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Invoices</p>
                    <p className="text-xl font-bold text-gray-700">{monthlyInvoiceCount.toLocaleString()}</p>
                    {monthlyCreditMemoCount > 0 && (
                      <p className="text-xs text-red-500 mt-1">{monthlyCreditMemoCount} CM{monthlyCreditMemoCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                  <div className="bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Customers</p>
                    <p className="text-xl font-bold text-gray-700">{monthlyCustomerCount.toLocaleString()}</p>
                  </div>
                </div>

                {/* Filters */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filter Options
                  </h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Status</label>
                    <select
                      value={tempFilterStatus}
                      onChange={(e) => setTempFilterStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {uniqueStatuses.map(s => (
                        <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
                    <select
                      value={tempFilterType}
                      onChange={(e) => setTempFilterType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {uniqueTypes.map(t => (
                        <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div className="space-y-3 pt-3 border-t border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      Date Range Filter
                    </h4>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
                      <input
                        type="date"
                        value={tempDateFrom}
                        onChange={(e) => setTempDateFrom(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
                      <input
                        type="date"
                        value={tempDateTo}
                        onChange={(e) => setTempDateTo(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {(tempDateFrom || tempDateTo) && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                        <p className="text-xs text-blue-600">
                          Will show invoices {tempDateFrom && tempDateTo
                            ? `from ${formatDateString(tempDateFrom)} to ${formatDateString(tempDateTo)}`
                            : tempDateFrom
                            ? `from ${formatDateString(tempDateFrom)}`
                            : `up to ${formatDateString(tempDateTo)}`
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={applyFilters}
                      className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Apply Filters
                    </button>
                    <button
                      onClick={clearFilters}
                      className="w-full px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear All Filters
                    </button>
                  </div>

                  {hasActiveFilters && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-2">
                      <p className="text-xs font-medium text-amber-700">
                        Filters active -- results in all views are filtered
                      </p>
                    </div>
                  )}
                </div>

                {selectedDate && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Selected Date</p>
                    <p className="text-sm font-semibold text-blue-600">
                      {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-500 hover:text-blue-400 mt-2">
                      Clear
                    </button>
                  </div>
                )}

                <div className="bg-white rounded-lg p-3 border border-gray-300 shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">Showing</p>
                  <p className="text-lg font-bold text-gray-700">{filteredInvoices.length.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">
                    {(dateFrom || dateTo)
                      ? `in selected date range (${invoices.length.toLocaleString()} total loaded)`
                      : `of ${invoices.length.toLocaleString()} invoices`
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-x-hidden max-w-full">
          {/* View Toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => setCalendarView('daily')}
                className={`px-6 py-2 text-sm font-medium transition-colors ${
                  calendarView === 'daily' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setCalendarView('monthly')}
                className={`px-6 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  calendarView === 'monthly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setCalendarView('yearly')}
                className={`px-6 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  calendarView === 'yearly' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Yearly
              </button>
            </div>
          </div>

          {/* Period Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={previousPeriod} className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-700 flex items-center gap-2 justify-center">
                  <Calendar className="w-6 h-6 text-blue-400" />
                  {calendarView === 'daily' ? monthName : calendarView === 'monthly' ? selectedYear : `${selectedYear - 5} - ${selectedYear}`}
                </h2>
                {selectedDate && calendarView === 'daily' && (
                  <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                    Clear date filter
                  </button>
                )}
                {lastRefreshTime && (
                  <p className="text-xs text-gray-500 mt-1">
                    Last updated: {lastRefreshTime.toLocaleTimeString()}
                  </p>
                )}
              </div>
              <button
                onClick={refreshCurrentView}
                disabled={refreshingAnalytics}
                className={`p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${refreshingAnalytics ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Refresh analytics data"
              >
                <RefreshCw className={`w-5 h-5 ${refreshingAnalytics ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <button onClick={nextPeriod} className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="mb-6 max-w-full">
            {calendarView === 'daily' ? (
              <>
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {getCalendarDays().map((date, idx) => {
                    const dayInvoices = getDayInvoices(date);
                    const isCurrentMonth = date.getMonth() === selectedMonth.getMonth();
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    const cms = dayInvoices.filter(i => i.type === 'Credit Memo');
                    const nonCMs = dayInvoices.filter(i => i.type !== 'Credit Memo');
                    const cmTotal = cms.reduce((sum, i) => sum + i.amount, 0);
                    const invoiceTotal = nonCMs.reduce((sum, i) => sum + i.amount, 0);
                    const netTotal = invoiceTotal - cmTotal;
                    const dayBalance = dayInvoices.reduce((sum, i) => sum + i.balance, 0);

                    return (
                      <button
                        key={idx}
                        onClick={() => isCurrentMonth ? setSelectedDate(isSelected ? null : date) : null}
                        className={`
                          relative p-2 rounded-lg border transition-all min-h-[80px]
                          ${isCurrentMonth ? 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' : 'bg-white border-gray-200 opacity-40'}
                          ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/20' : ''}
                          ${isToday ? 'border-blue-400' : ''}
                          ${isCurrentMonth ? 'cursor-pointer' : 'cursor-not-allowed'}
                        `}
                        disabled={!isCurrentMonth}
                      >
                        <div className="text-xs font-semibold text-gray-700 mb-1">{date.getDate()}</div>
                        {dayInvoices.length > 0 && isCurrentMonth && (
                          <div className="space-y-0.5">
                            <div className="text-xs text-blue-600 font-bold">{formatCurrency(netTotal)}</div>
                            {cmTotal > 0 && (
                              <div className="text-xs text-red-500 font-medium">CM: -{formatCurrency(cmTotal)}</div>
                            )}
                            {dayBalance > 0 && (
                              <div className="text-xs text-amber-600 font-medium">{formatCurrency(dayBalance)} bal</div>
                            )}
                            <div className="text-xs text-gray-500">{nonCMs.length} inv{cms.length > 0 ? `, ${cms.length} CM` : ''}</div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : calendarView === 'monthly' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {getMonthlyData().map((monthData) => {
                  const isCurrentMonth = monthData.month === new Date().getMonth() && selectedYear === new Date().getFullYear();
                  return (
                    <button
                      key={monthData.month}
                      onClick={() => {
                        setInvoices([]);
                        setFilteredInvoices([]);
                        setLoading(true);
                        setSelectedMonth(new Date(selectedYear, monthData.month, 1));
                        setCalendarView('daily');
                      }}
                      className={`
                        p-5 rounded-lg border transition-all hover:shadow-lg cursor-pointer text-left
                        ${isCurrentMonth ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400' : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-200'}
                      `}
                    >
                      <div className="text-base font-bold text-gray-700 mb-3">{monthData.name}</div>
                      {(monthData.count > 0 || monthData.creditMemoCount > 0) ? (
                        <div className="space-y-1">
                          <div className="text-xl font-bold text-blue-600">{formatCurrency(monthData.total - 2 * monthData.creditMemoAmount)}</div>
                          {monthData.creditMemoAmount > 0 && (
                            <div className="text-xs font-medium text-red-500">CM: -{formatCurrency(monthData.creditMemoAmount)} ({monthData.creditMemoCount})</div>
                          )}
                          {monthData.openBalance > 0 && (
                            <div className="text-sm font-medium text-amber-600">{formatCurrency(monthData.openBalance)} open</div>
                          )}
                          <div className="text-xs text-gray-500">
                            {monthData.count.toLocaleString()} invoice{monthData.count !== 1 ? 's' : ''}
                            {monthData.customers > 0 && ` | ${monthData.customers} customers`}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">No invoices</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {getYearlyData().map((yearData) => {
                  const isCurrentYear = yearData.year === new Date().getFullYear();
                  return (
                    <button
                      key={yearData.year}
                      onClick={() => {
                        setSelectedYear(yearData.year);
                        setCalendarView('monthly');
                      }}
                      className={`
                        p-8 rounded-xl border-2 transition-all hover:shadow-xl cursor-pointer text-left
                        ${isCurrentYear ? 'bg-blue-50 border-blue-400 ring-4 ring-blue-200' : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300'}
                      `}
                    >
                      <div className="text-3xl font-bold text-gray-700 mb-4">{yearData.year}</div>
                      {(yearData.count > 0 || yearData.creditMemoCount > 0) ? (
                        <div className="space-y-2">
                          <div className="text-3xl font-bold text-blue-600">{formatCurrency(yearData.total - 2 * yearData.creditMemoAmount)}</div>
                          {yearData.creditMemoAmount > 0 && (
                            <div className="text-sm font-medium text-red-500">CM: -{formatCurrency(yearData.creditMemoAmount)} ({yearData.creditMemoCount})</div>
                          )}
                          {yearData.openBalance > 0 && (
                            <div className="text-lg font-medium text-amber-600">{formatCurrency(yearData.openBalance)} open</div>
                          )}
                          <div className="text-sm text-gray-500">
                            {yearData.count.toLocaleString()} invoice{yearData.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="text-base text-gray-400">No invoices</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 max-w-full">
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Net Invoiced</p>
                  <p className="text-base font-bold text-gray-700 break-words">{formatCurrency(monthlyTotal - monthlyCreditMemoTotal)}</p>
                  {monthlyCreditMemoTotal > 0 && (
                    <p className="text-xs text-red-500 mt-0.5">CM: -{formatCurrency(monthlyCreditMemoTotal)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Open Balance</p>
                  <p className="text-base font-bold text-gray-700 break-words">{formatCurrency(monthlyBalance)}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Total Invoices</p>
                  <p className="text-base font-bold text-gray-700 break-words">{monthlyInvoiceCount.toLocaleString()}</p>
                  {monthlyCreditMemoCount > 0 && (
                    <p className="text-xs text-red-500 mt-0.5">{monthlyCreditMemoCount} Credit Memo{monthlyCreditMemoCount !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-teal-500/20 rounded-lg flex-shrink-0">
                  <Users className="w-5 h-5 text-teal-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Unique Customers</p>
                  <p className="text-base font-bold text-gray-700 break-words">{monthlyCustomerCount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Actions Bar */}
          <div className="flex flex-wrap gap-4 mb-6 max-w-full">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search by reference, customer, type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-sm"
            >
              <Download className="w-5 h-5" />
              Export Excel
            </button>
          </div>

          {/* Customer-Grouped Invoice Table */}
          <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden max-w-full">
            <div className="max-h-[calc(100vh-300px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {loading && filteredInvoices.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
                    <p className="text-gray-500">{loadingBatchInfo || 'Loading invoices...'}</p>
                  </div>
                </div>
              ) : customerGroups.length === 0 && !loading && !loadingBatchInfo ? (
                <div className="text-center text-gray-500 py-12">
                  {searchTerm ? 'No invoices found matching your search.' : 'No invoices found for this period.'}
                </div>
              ) : (
                <table className="divide-y divide-gray-200 w-full" style={{ minWidth: '1000px' }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 z-10 bg-gray-50 w-10"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 z-10 bg-gray-50">Customer</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 z-10 bg-gray-50">Invoices</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 z-10 bg-gray-50">Total Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 z-10 bg-gray-50">Open Balance</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0 z-10 bg-gray-50">Paid %</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {customerGroups.map((group) => {
                      const isExpanded = expandedCustomers.has(group.customerId);
                      const paidPct = group.totalAmount > 0 ? Math.round(((group.totalAmount - group.totalBalance) / group.totalAmount) * 100) : 100;

                      return (
                        <Fragment key={group.customerId}>
                          <tr
                            onClick={() => {
                              setExpandedCustomers(prev => {
                                const next = new Set(prev);
                                if (next.has(group.customerId)) {
                                  next.delete(group.customerId);
                                } else {
                                  next.add(group.customerId);
                                }
                                return next;
                              });
                            }}
                            className="cursor-pointer hover:bg-blue-50/50 transition-colors border-b border-gray-200"
                          >
                            <td className="px-4 py-3.5">
                              <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-semibold text-gray-800">{group.customerName}</div>
                              <div className="text-xs text-gray-500">{group.customerId}</div>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 text-sm font-bold text-blue-700 bg-blue-100 rounded-full">
                                {group.invoices.length}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold text-gray-900">
                              {formatCurrencyFull(group.totalAmount)}
                            </td>
                            <td className={`px-4 py-3.5 text-right font-semibold ${group.totalBalance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {formatCurrencyFull(group.totalBalance)}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${paidPct === 100 ? 'bg-green-500' : paidPct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                    style={{ width: `${paidPct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-600 w-9 text-right">{paidPct}%</span>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <div className="bg-slate-50 border-y border-slate-200">
                                  <table className="w-full">
                                    <thead>
                                      <tr className="bg-slate-100/80">
                                        <th className="px-6 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Reference</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Balance</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Due Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase w-10"></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.invoices
                                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                                        .map((invoice, idx) => {
                                          const colorDot = getColorDot(invoice.color_status);
                                          return (
                                            <tr key={invoice.id || idx} className="hover:bg-slate-100/60 transition-colors border-b border-slate-200/60 last:border-b-0">
                                              <td className="px-6 py-2.5 text-sm text-gray-700 whitespace-nowrap">{formatDateString(invoice.date)}</td>
                                              <td className="px-4 py-2.5 text-sm font-medium text-gray-900 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                  {colorDot && <div className={`w-2 h-2 rounded-full ${colorDot}`} />}
                                                  {invoice.reference_number}
                                                </div>
                                              </td>
                                              <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${getTypeBadge(invoice.type)}`}>{invoice.type}</span>
                                              </td>
                                              <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 whitespace-nowrap text-right">{formatCurrencyFull(invoice.amount)}</td>
                                              <td className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-right ${invoice.balance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                                {formatCurrencyFull(invoice.balance)}
                                              </td>
                                              <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">{formatDateString(invoice.due_date)}</td>
                                              <td className="px-4 py-2.5 text-sm whitespace-nowrap">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getStatusBadge(invoice.status)}`}>{invoice.status}</span>
                                              </td>
                                              <td className="px-4 py-2.5 text-sm text-gray-600 max-w-[180px] truncate" title={invoice.description}>{invoice.description || '-'}</td>
                                              <td className="px-4 py-2.5 text-center">
                                                <a
                                                  href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded p-1 transition-colors"
                                                  title="Open in Acumatica"
                                                >
                                                  <ExternalLink className="w-3.5 h-3.5" />
                                                </a>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    {loadingBatchInfo && (
                      <tr className="bg-blue-50/50">
                        <td colSpan={6} className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                            <span className="text-xs text-blue-600 font-medium">{loadingBatchInfo}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-700">
                        TOTAL ({customerGroups.length} customers)
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-gray-700">
                        {filteredInvoices.length}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                        {formatCurrencyFull(customerGroups.reduce((sum, g) => sum + g.totalAmount, 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-amber-600">
                        {formatCurrencyFull(customerGroups.reduce((sum, g) => sum + g.totalBalance, 0))}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}