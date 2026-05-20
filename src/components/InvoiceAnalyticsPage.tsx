import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, TrendingUp, DollarSign, Users, FileText, RefreshCw, ArrowUpDown, Search, Download, Filter, X, ExternalLink, Check, Save, Settings, Ban, UserMinus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAcumaticaInvoiceUrl } from '../lib/acumaticaLinks';
import { usePageCache } from '../contexts/PageCacheContext';
import { useAuth } from '../contexts/AuthContext';
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
  const { user } = useAuth();
  const { getCachedState, setCachedState } = usePageCache('invoice-analytics');
  const cachedState = useRef(getCachedState());
  const c = cachedState.current;
  const [selectedMonth, setSelectedMonth] = useState(() => c?.selectedMonth ? new Date(c.selectedMonth) : new Date());
  const [selectedYear, setSelectedYear] = useState<number>(() => c?.selectedYear ?? new Date().getFullYear());
  const [calendarView, setCalendarView] = useState<'daily' | 'monthly' | 'yearly'>(() => c?.calendarView ?? 'daily');
  const [invoices, setInvoices] = useState<InvoiceRow[]>(() => c?.invoices ?? []);
  const [filteredInvoices, setFilteredInvoices] = useState<InvoiceRow[]>(() => c?.filteredInvoices ?? []);
  const [allFilteredInvoices, setAllFilteredInvoices] = useState<InvoiceRow[]>(() => c?.allFilteredInvoices ?? []);
  const [loading, setLoading] = useState(() => !c);
  const [loadingBatchInfo, setLoadingBatchInfo] = useState('');

  const [monthlyAggregates, setMonthlyAggregates] = useState<{ month: number; total: number; count: number; balance: number; openBalance: number; customers: number; creditMemoAmount: number; creditMemoCount: number; openInvoiceBalance: number; openInvoiceCount: number; balancedInvoiceBalance: number; balancedInvoiceCount: number; openCmBalance: number; openCmCount: number }[]>(() => c?.monthlyAggregates ?? []);
  const [yearlyAggregates, setYearlyAggregates] = useState<{ year: number; total: number; count: number; balance: number; openBalance: number; customers: number; creditMemoAmount: number; creditMemoCount: number; openInvoiceBalance: number; openInvoiceCount: number; balancedInvoiceBalance: number; balancedInvoiceCount: number; openCmBalance: number; openCmCount: number }[]>(() => c?.yearlyAggregates ?? []);

  const [monthlyTotal, setMonthlyTotal] = useState(() => c?.monthlyTotal ?? 0);
  const [monthlyBalance, setMonthlyBalance] = useState(() => c?.monthlyBalance ?? 0);
  const [monthlyInvoiceCount, setMonthlyInvoiceCount] = useState(() => c?.monthlyInvoiceCount ?? 0);
  const [monthlyCustomerCount, setMonthlyCustomerCount] = useState(() => c?.monthlyCustomerCount ?? 0);
  const [monthlyCreditMemoTotal, setMonthlyCreditMemoTotal] = useState(() => c?.monthlyCreditMemoTotal ?? 0);
  const [monthlyCreditMemoCount, setMonthlyCreditMemoCount] = useState(() => c?.monthlyCreditMemoCount ?? 0);
  const [monthlyOpenInvBalance, setMonthlyOpenInvBalance] = useState(() => c?.monthlyOpenInvBalance ?? 0);
  const [monthlyBalancedInvBalance, setMonthlyBalancedInvBalance] = useState(() => c?.monthlyBalancedInvBalance ?? 0);
  const [monthlyBalancedInvCount, setMonthlyBalancedInvCount] = useState(() => c?.monthlyBalancedInvCount ?? 0);
  const [monthlyOpenCmBalance, setMonthlyOpenCmBalance] = useState(() => c?.monthlyOpenCmBalance ?? 0);
  const [monthlyOpenCmCount, setMonthlyOpenCmCount] = useState(() => c?.monthlyOpenCmCount ?? 0);

  const [customerNameMap, setCustomerNameMap] = useState<Map<string, string>>(new Map());

  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(() => c?.lastRefreshTime ? new Date(c.lastRefreshTime) : null);

  const [searchTerm, setSearchTerm] = useState(() => c?.searchTerm ?? '');
  const [sortField, setSortField] = useState<SortField>(() => c?.sortField ?? 'date');
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => c?.sortDirection ?? 'desc');
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => c?.selectedDate ? new Date(c.selectedDate) : null);

  const [filterStatus, setFilterStatus] = useState(() => c?.filterStatus ?? 'all');
  const [filterType, setFilterType] = useState(() => c?.filterType ?? 'all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [tempFilterStatus, setTempFilterStatus] = useState(() => c?.filterStatus ?? 'all');
  const [tempFilterType, setTempFilterType] = useState(() => c?.filterType ?? 'all');
  const [tempDateFrom, setTempDateFrom] = useState(() => c?.dateFrom ?? '');
  const [tempDateTo, setTempDateTo] = useState(() => c?.dateTo ?? '');
  const [dateFrom, setDateFrom] = useState(() => c?.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(() => c?.dateTo ?? '');

  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  // Customer filter
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>(() => c?.selectedCustomers ?? []);
  const [tempSelectedCustomers, setTempSelectedCustomers] = useState<string[]>(() => c?.selectedCustomers ?? []);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // Excluded customers
  const [excludedCustomers, setExcludedCustomers] = useState<string[]>(() => c?.excludedCustomers ?? []);
  const [tempExcludedCustomers, setTempExcludedCustomers] = useState<string[]>(() => c?.excludedCustomers ?? []);
  const [excludeSearchTerm, setExcludeSearchTerm] = useState('');

  // Default filters
  const [defaultFiltersActive, setDefaultFiltersActive] = useState(false);
  const [hasDefaultFilters, setHasDefaultFilters] = useState(false);
  const [showDefaultFilterMenu, setShowDefaultFilterMenu] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const hasActiveFilters = filterStatus !== 'all' || filterType !== 'all' || selectedCustomers.length > 0 || excludedCustomers.length > 0;

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

  const resolveCustomerName = useCallback((customerId: string, invoiceName?: string) => {
    const fromMap = customerNameMap.get(customerId);
    if (fromMap) return fromMap;
    if (invoiceName && invoiceName !== customerId) return invoiceName;
    return customerId;
  }, [customerNameMap]);

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
          customerName: resolveCustomerName(key, inv.customer_name),
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
  }, [filteredInvoices, resolveCustomerName]);

  // Unique filter values
  const uniqueStatuses = useMemo(() => {
    const set = new Set(invoices.map(i => i.status).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [invoices]);

  const uniqueTypes = useMemo(() => {
    const set = new Set(invoices.map(i => i.type).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [invoices]);

  const uniqueCustomers = useMemo(() => {
    const merged = new Map<string, string>();

    // Start with ALL customers from the authoritative customer table
    for (const [id, name] of customerNameMap.entries()) {
      merged.set(id, name);
    }

    // Add any customers from invoices not already in the map
    for (const inv of invoices) {
      if (!inv.customer || merged.has(inv.customer)) continue;
      const name = inv.customer_name;
      if (name && name !== inv.customer && name !== 'N/A') {
        merged.set(inv.customer, name);
      } else {
        merged.set(inv.customer, inv.customer);
      }
    }

    return Array.from(merged.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices, customerNameMap]);

  const filteredCustomerOptions = useMemo(() => {
    if (!customerSearchTerm) return [];
    const search = customerSearchTerm.toLowerCase();
    return uniqueCustomers.filter(c =>
      c.name.toLowerCase().includes(search) || c.id.toLowerCase().includes(search)
    );
  }, [uniqueCustomers, customerSearchTerm]);

  const toggleTempCustomer = useCallback((customerId: string) => {
    setTempSelectedCustomers(prev =>
      prev.includes(customerId) ? prev.filter(c => c !== customerId) : [...prev, customerId]
    );
    setCustomerSearchTerm('');
  }, []);

  const filteredExcludeOptions = useMemo(() => {
    if (!excludeSearchTerm) return [];
    const search = excludeSearchTerm.toLowerCase();
    return uniqueCustomers.filter(c =>
      (c.name.toLowerCase().includes(search) || c.id.toLowerCase().includes(search)) &&
      !tempExcludedCustomers.includes(c.id)
    );
  }, [uniqueCustomers, excludeSearchTerm, tempExcludedCustomers]);

  const addExcludedCustomer = useCallback((customerId: string) => {
    setTempExcludedCustomers(prev => prev.includes(customerId) ? prev : [...prev, customerId]);
    setTempSelectedCustomers(prev => prev.filter(c => c !== customerId));
    setExcludeSearchTerm('');
  }, []);

  const removeExcludedCustomer = useCallback((customerId: string) => {
    setTempExcludedCustomers(prev => prev.filter(c => c !== customerId));
  }, []);

  // Default filter functions
  const loadDefaultFilters = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_analytics_default_filters')
      .select('filters, excluded_customers')
      .eq('user_id', user.id)
      .eq('page', 'invoice_analytics')
      .maybeSingle();
    if (data) {
      setHasDefaultFilters(true);
      if (!c) {
        const f = data.filters as any;
        if (f.filterStatus) { setFilterStatus(f.filterStatus); setTempFilterStatus(f.filterStatus); }
        if (f.filterType) { setFilterType(f.filterType); setTempFilterType(f.filterType); }
        if (f.dateFrom) { setDateFrom(f.dateFrom); setTempDateFrom(f.dateFrom); }
        if (f.dateTo) { setDateTo(f.dateTo); setTempDateTo(f.dateTo); }
        if (f.selectedCustomers?.length) { setSelectedCustomers(f.selectedCustomers); setTempSelectedCustomers(f.selectedCustomers); }
        if (data.excluded_customers?.length) { setExcludedCustomers(data.excluded_customers); setTempExcludedCustomers(data.excluded_customers); }
        setDefaultFiltersActive(true);
      }
    }
  }, [user]);

  useEffect(() => { loadDefaultFilters(); }, [loadDefaultFilters]);

  const saveAsDefaultFilters = async () => {
    if (!user) return;
    setSavingDefaults(true);
    const filters = {
      filterStatus: tempFilterStatus,
      filterType: tempFilterType,
      dateFrom: tempDateFrom,
      dateTo: tempDateTo,
      selectedCustomers: tempSelectedCustomers,
    };
    await supabase.from('user_analytics_default_filters').upsert({
      user_id: user.id,
      page: 'invoice_analytics',
      filters,
      excluded_customers: tempExcludedCustomers,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,page' });
    setHasDefaultFilters(true);
    setDefaultFiltersActive(true);
    setSavingDefaults(false);
    setShowDefaultFilterMenu(false);
  };

  const applyDefaultFilters = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_analytics_default_filters')
      .select('filters, excluded_customers')
      .eq('user_id', user.id)
      .eq('page', 'invoice_analytics')
      .maybeSingle();
    if (data) {
      const f = data.filters as any;
      setTempFilterStatus(f.filterStatus || 'all');
      setTempFilterType(f.filterType || 'all');
      setTempDateFrom(f.dateFrom || '');
      setTempDateTo(f.dateTo || '');
      setTempSelectedCustomers(f.selectedCustomers || []);
      setTempExcludedCustomers(data.excluded_customers || []);
      setFilterStatus(f.filterStatus || 'all');
      setFilterType(f.filterType || 'all');
      setDateFrom(f.dateFrom || '');
      setDateTo(f.dateTo || '');
      setSelectedCustomers(f.selectedCustomers || []);
      setExcludedCustomers(data.excluded_customers || []);
      setDefaultFiltersActive(true);
    }
  };

  const removeDefaultFilters = async () => {
    if (!user) return;
    await supabase.from('user_analytics_default_filters').delete().eq('user_id', user.id).eq('page', 'invoice_analytics');
    setHasDefaultFilters(false);
    setDefaultFiltersActive(false);
    setShowDefaultFilterMenu(false);
  };

  // Load data based on view
  const restoredFromCache = useRef(!!c);

  // Keep a ref with latest state for the unmount save
  const stateRef = useRef<Record<string, any>>({});
  useEffect(() => {
    stateRef.current = {
      selectedMonth: selectedMonth.toISOString(),
      selectedYear,
      calendarView,
      invoices,
      filteredInvoices,
      allFilteredInvoices,
      monthlyAggregates,
      yearlyAggregates,
      monthlyTotal,
      monthlyBalance,
      monthlyInvoiceCount,
      monthlyCustomerCount,
      monthlyCreditMemoTotal,
      monthlyCreditMemoCount,
      monthlyOpenInvBalance,
      monthlyBalancedInvBalance,
      monthlyBalancedInvCount,
      monthlyOpenCmBalance,
      monthlyOpenCmCount,
      searchTerm,
      sortField,
      sortDirection,
      filterStatus,
      filterType,
      dateFrom,
      dateTo,
      selectedCustomers,
      excludedCustomers,
      selectedDate: selectedDate?.toISOString() ?? null,
      lastRefreshTime: lastRefreshTime?.toISOString() ?? null,
    };
  });

  // Save state to cache on unmount
  useEffect(() => {
    return () => { setCachedState(stateRef.current); };
  }, []);

  useEffect(() => {
    if (restoredFromCache.current) {
      restoredFromCache.current = false;
      return;
    }
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
  }, [calendarView, selectedYear, selectedMonth, dateFrom, dateTo, filterStatus, filterType, selectedCustomers, excludedCustomers]);

  useEffect(() => {
    filterAndSortInvoices();
  }, [invoices, searchTerm, sortField, sortDirection, filterStatus, filterType, selectedDate, selectedCustomers, excludedCustomers]);

  useEffect(() => {
    if (calendarView === 'daily') {
      const nonCM = allFilteredInvoices.filter(i => i.type !== 'Credit Memo');
      const cms = allFilteredInvoices.filter(i => i.type === 'Credit Memo');
      const total = nonCM.reduce((sum, i) => sum + i.amount, 0);
      const cmTotal = cms.reduce((sum, i) => sum + i.amount, 0);
      const customers = new Set(allFilteredInvoices.map(i => i.customer).filter(Boolean));
      const openInvBal = allFilteredInvoices.filter(i => i.type === 'Invoice' && i.status === 'Open').reduce((s, i) => s + i.balance, 0);
      const balInv = allFilteredInvoices.filter(i => i.type === 'Invoice' && i.status === 'Balanced');
      const balInvBal = balInv.reduce((s, i) => s + i.balance, 0);
      const openCms = cms.filter(i => i.status === 'Open' || i.status === 'Balanced');
      const openCmBal = openCms.reduce((s, i) => s + i.balance, 0);
      setMonthlyTotal(total);
      setMonthlyBalance(openInvBal + balInvBal - openCmBal);
      setMonthlyInvoiceCount(nonCM.length);
      setMonthlyCustomerCount(customers.size);
      setMonthlyCreditMemoTotal(cmTotal);
      setMonthlyCreditMemoCount(cms.length);
      setMonthlyOpenInvBalance(openInvBal);
      setMonthlyBalancedInvBalance(balInvBal);
      setMonthlyBalancedInvCount(balInv.length);
      setMonthlyOpenCmBalance(openCmBal);
      setMonthlyOpenCmCount(openCms.length);
    }
  }, [allFilteredInvoices, calendarView]);

  useEffect(() => {
    setTempFilterStatus(filterStatus);
    setTempFilterType(filterType);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
    setTempSelectedCustomers(selectedCustomers);

    // Load ALL customers - paginate to avoid Supabase row limits
    (async () => {
      const map = new Map<string, string>();
      let from = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name')
          .order('customer_name')
          .range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        for (const c of data) {
          if (c.customer_id && c.customer_name) {
            map.set(c.customer_id, c.customer_name);
          }
        }
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      setCustomerNameMap(map);
    })();
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
          .in('type', ['Invoice', 'Debit Memo', 'Credit Memo'])
          .in('status', ['Balanced', 'Credit Hold', 'Open', 'Closed', 'Voided', 'Canceled'])
          .order('date', { ascending: false })
          .order('reference_number', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (filterStatus !== 'all') {
          query = query.eq('status', filterStatus);
        }
        if (filterType !== 'all') {
          query = query.eq('type', filterType);
        }
        if (selectedCustomers.length > 0) {
          query = query.in('customer', selectedCustomers);
        }
        if (excludedCustomers.length > 0) {
          for (const cust of excludedCustomers) {
            query = query.neq('customer', cust);
          }
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
            customer_name: customerNameMap.get(inv.customer) || (inv.customer_name && inv.customer_name !== inv.customer ? inv.customer_name : '') || 'N/A',
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

  const applyMonthlyAggregateData = (rows: any[], monthKey: string, amountKey: string, countKey: string, balanceKey: string, openBalanceKey: string, customerKey: string, cmAmountKey: string, cmCountKey: string, openInvBalKey: string, openInvCntKey: string, balInvBalKey: string, balInvCntKey: string, openCmBalKey: string, openCmCntKey: string, totalBalanceKey?: string) => {
    const defaultAgg = { month: 0, total: 0, count: 0, balance: 0, openBalance: 0, customers: 0, creditMemoAmount: 0, creditMemoCount: 0, openInvoiceBalance: 0, openInvoiceCount: 0, balancedInvoiceBalance: 0, balancedInvoiceCount: 0, openCmBalance: 0, openCmCount: 0 };
    const aggregates = Array.from({ length: 12 }, (_, idx) => ({ ...defaultAgg, month: idx }));
    let totalAmount = 0;
    let totalBalance = 0;
    let totalCount = 0;
    let totalCustomers = 0;
    let totalCMAmount = 0;
    let totalCMCount = 0;

    rows.forEach((row: any) => {
      const m = row[monthKey];
      if (m >= 1 && m <= 12) {
        const amt = parseFloat(row[amountKey]) || 0;
        const bal = parseFloat(row[openBalanceKey]) || 0;
        const cnt = parseInt(row[countKey]) || 0;
        const cust = parseInt(row[customerKey]) || 0;
        const cmAmt = parseFloat(row[cmAmountKey]) || 0;
        const cmCnt = parseInt(row[cmCountKey]) || 0;
        aggregates[m - 1] = {
          month: m - 1,
          total: amt,
          count: cnt,
          balance: totalBalanceKey ? (parseFloat(row[totalBalanceKey]) || 0) : 0,
          openBalance: bal,
          customers: cust,
          creditMemoAmount: cmAmt,
          creditMemoCount: cmCnt,
          openInvoiceBalance: parseFloat(row[openInvBalKey]) || 0,
          openInvoiceCount: parseInt(row[openInvCntKey]) || 0,
          balancedInvoiceBalance: parseFloat(row[balInvBalKey]) || 0,
          balancedInvoiceCount: parseInt(row[balInvCntKey]) || 0,
          openCmBalance: parseFloat(row[openCmBalKey]) || 0,
          openCmCount: parseInt(row[openCmCntKey]) || 0,
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
    const totalOpenInv = aggregates.reduce((s, a) => s + a.openInvoiceBalance, 0);
    const totalBalInv = aggregates.reduce((s, a) => s + a.balancedInvoiceBalance, 0);
    const totalBalInvCnt = aggregates.reduce((s, a) => s + a.balancedInvoiceCount, 0);
    const totalOpenCm = aggregates.reduce((s, a) => s + a.openCmBalance, 0);
    const totalOpenCmCnt = aggregates.reduce((s, a) => s + a.openCmCount, 0);
    setMonthlyBalance(totalOpenInv + totalBalInv - totalOpenCm);
    setMonthlyInvoiceCount(totalCount - totalCMCount);
    setMonthlyCustomerCount(totalCustomers);
    setMonthlyCreditMemoTotal(totalCMAmount);
    setMonthlyCreditMemoCount(totalCMCount);
    setMonthlyOpenInvBalance(totalOpenInv);
    setMonthlyBalancedInvBalance(totalBalInv);
    setMonthlyBalancedInvCount(totalBalInvCnt);
    setMonthlyOpenCmBalance(totalOpenCm);
    setMonthlyOpenCmCount(totalOpenCmCnt);
  };

  const loadMonthlyAggregates = async (year: number) => {
    setLoading(true);
    setLoadingBatchInfo('');
    try {
      if (hasActiveFilters) {
        const { data: filteredData, error: filteredError } = await supabase.rpc('get_filtered_invoice_aggregates', {
          p_period_type: 'monthly',
          p_year: year,
          p_status: filterStatus !== 'all' ? filterStatus : null,
          p_type: filterType !== 'all' ? filterType : null,
          p_included_customers: selectedCustomers.length > 0 ? selectedCustomers : [],
          p_excluded_customers: excludedCustomers.length > 0 ? excludedCustomers : []
        });

        if (filteredError) throw filteredError;

        applyMonthlyAggregateData(
          filteredData || [], 'agg_month', 'total_amount', 'invoice_count', 'total_balance', 'total_open_balance',
          'unique_customers', 'credit_memo_amount', 'credit_memo_count',
          'open_invoice_balance', 'open_invoice_count', 'balanced_invoice_balance', 'balanced_invoice_count',
          'open_cm_balance', 'open_cm_count', 'total_balance'
        );
        setLoading(false);
        setLoadingBatchInfo('');
        return;
      }

      const { data: cachedData, error } = await supabase
        .from('cached_invoice_analytics')
        .select('*')
        .eq('period_type', 'monthly')
        .eq('year', year)
        .order('month', { ascending: true });

      if (error) throw error;

      if (cachedData && cachedData.length > 0) {
        applyMonthlyAggregateData(
          cachedData, 'month', 'total_amount', 'invoice_count', 'total_balance', 'total_open_balance',
          'unique_customer_count', 'credit_memo_amount', 'credit_memo_count',
          'open_invoice_balance', 'open_invoice_count', 'balanced_invoice_balance', 'balanced_invoice_count',
          'open_cm_balance', 'open_cm_count', 'total_balance'
        );
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

  const applyYearlyAggregateData = (rows: any[], yearKey: string, amountKey: string, countKey: string, balanceKey: string, openBalanceKey: string, customerKey: string, cmAmountKey: string, cmCountKey: string, openInvBalKey: string, openInvCntKey: string, balInvBalKey: string, balInvCntKey: string, openCmBalKey: string, openCmCntKey: string) => {
    const aggregates = rows.map((row: any) => ({
      year: row[yearKey],
      total: parseFloat(row[amountKey]) || 0,
      count: parseInt(row[countKey]) || 0,
      balance: parseFloat(row[balanceKey]) || 0,
      openBalance: parseFloat(row[openBalanceKey]) || 0,
      customers: parseInt(row[customerKey]) || 0,
      creditMemoAmount: parseFloat(row[cmAmountKey]) || 0,
      creditMemoCount: parseInt(row[cmCountKey]) || 0,
      openInvoiceBalance: parseFloat(row[openInvBalKey]) || 0,
      openInvoiceCount: parseInt(row[openInvCntKey]) || 0,
      balancedInvoiceBalance: parseFloat(row[balInvBalKey]) || 0,
      balancedInvoiceCount: parseInt(row[balInvCntKey]) || 0,
      openCmBalance: parseFloat(row[openCmBalKey]) || 0,
      openCmCount: parseInt(row[openCmCntKey]) || 0,
    })).sort((a: any, b: any) => b.year - a.year);

    setYearlyAggregates(aggregates);
    const totalAmount = aggregates.reduce((s, a) => s + a.total, 0);
    const totalCount = aggregates.reduce((s, a) => s + a.count, 0);
    const totalCM = aggregates.reduce((s, a) => s + a.creditMemoAmount, 0);
    const totalCMCnt = aggregates.reduce((s, a) => s + a.creditMemoCount, 0);
    setMonthlyTotal(totalAmount - totalCM);
    setMonthlyInvoiceCount(totalCount - totalCMCnt);
    const totalOpenInv = aggregates.reduce((s, a) => s + a.openInvoiceBalance, 0);
    const totalBalInv = aggregates.reduce((s, a) => s + a.balancedInvoiceBalance, 0);
    const totalBalInvCnt = aggregates.reduce((s, a) => s + a.balancedInvoiceCount, 0);
    const totalOpenCm = aggregates.reduce((s, a) => s + a.openCmBalance, 0);
    const totalOpenCmCnt = aggregates.reduce((s, a) => s + a.openCmCount, 0);
    setMonthlyBalance(totalOpenInv + totalBalInv - totalOpenCm);
    setMonthlyCustomerCount(0);
    setMonthlyCreditMemoTotal(totalCM);
    setMonthlyCreditMemoCount(totalCMCnt);
    setMonthlyOpenInvBalance(totalOpenInv);
    setMonthlyBalancedInvBalance(totalBalInv);
    setMonthlyBalancedInvCount(totalBalInvCnt);
    setMonthlyOpenCmBalance(totalOpenCm);
    setMonthlyOpenCmCount(totalOpenCmCnt);
  };

  const loadYearlyAggregates = async () => {
    setLoading(true);
    try {
      if (hasActiveFilters) {
        const { data: filteredData, error: filteredError } = await supabase.rpc('get_filtered_invoice_aggregates', {
          p_period_type: 'yearly',
          p_year: null,
          p_status: filterStatus !== 'all' ? filterStatus : null,
          p_type: filterType !== 'all' ? filterType : null,
          p_included_customers: selectedCustomers.length > 0 ? selectedCustomers : [],
          p_excluded_customers: excludedCustomers.length > 0 ? excludedCustomers : []
        });

        if (filteredError) throw filteredError;

        applyYearlyAggregateData(
          filteredData || [], 'agg_year', 'total_amount', 'invoice_count', 'total_balance', 'total_open_balance',
          'unique_customers', 'credit_memo_amount', 'credit_memo_count',
          'open_invoice_balance', 'open_invoice_count', 'balanced_invoice_balance', 'balanced_invoice_count',
          'open_cm_balance', 'open_cm_count'
        );
        setLoading(false);
        return;
      }

      const { data: cachedData, error } = await supabase
        .from('cached_invoice_analytics')
        .select('*')
        .eq('period_type', 'yearly')
        .order('year', { ascending: false });

      if (error) throw error;

      if (cachedData && cachedData.length > 0) {
        applyYearlyAggregateData(
          cachedData, 'year', 'total_amount', 'invoice_count', 'total_balance', 'total_open_balance',
          'unique_customer_count', 'credit_memo_amount', 'credit_memo_count',
          'open_invoice_balance', 'open_invoice_count', 'balanced_invoice_balance', 'balanced_invoice_count',
          'open_cm_balance', 'open_cm_count'
        );
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
    if (selectedCustomers.length > 0) {
      const customerSet = new Set(selectedCustomers);
      filtered = filtered.filter(i => customerSet.has(i.customer));
    }
    if (excludedCustomers.length > 0) {
      const excludeSet = new Set(excludedCustomers);
      filtered = filtered.filter(i => !excludeSet.has(i.customer));
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
    setSelectedCustomers(tempSelectedCustomers);
    setExcludedCustomers(tempExcludedCustomers);
  };

  const clearFilters = () => {
    setTempFilterStatus('all');
    setTempFilterType('all');
    setTempDateFrom('');
    setTempDateTo('');
    setTempSelectedCustomers([]);
    setTempExcludedCustomers([]);
    setCustomerSearchTerm('');
    setExcludeSearchTerm('');
    setFilterStatus('all');
    setFilterType('all');
    setDateFrom('');
    setDateTo('');
    setSelectedCustomers([]);
    setExcludedCustomers([]);
    setSelectedDate(null);
    setDefaultFiltersActive(false);
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
        ...agg,
        name: MONTH_NAMES[agg.month],
      }));
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: i,
      name: MONTH_NAMES[i],
      total: 0, count: 0, balance: 0, openBalance: 0, customers: 0,
      creditMemoAmount: 0, creditMemoCount: 0,
      openInvoiceBalance: 0, openInvoiceCount: 0,
      balancedInvoiceBalance: 0, balancedInvoiceCount: 0,
      openCmBalance: 0, openCmCount: 0,
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
        <div className={`${sidebarCollapsed ? 'w-16' : 'w-80'} bg-gray-50 border-r border-gray-200 transition-all duration-300 overflow-hidden flex-shrink-0`} data-tour="invoice-sidebar">
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
                    {monthlyOpenCmBalance > 0 && (
                      <p className="text-xs text-red-500 mt-1">CM: -{formatCurrency(monthlyOpenCmBalance)} ({monthlyOpenCmCount})</p>
                    )}
                    {monthlyBalancedInvBalance > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(monthlyBalancedInvBalance)} balanced ({monthlyBalancedInvCount})</p>
                    )}
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

                  {/* Customer Filter */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Customers {tempSelectedCustomers.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">
                          {tempSelectedCustomers.length}
                        </span>
                      )}
                    </label>

                    {/* Selected customers as chips */}
                    {tempSelectedCustomers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2 bg-blue-50/50 border border-blue-200 rounded-lg">
                        {tempSelectedCustomers.map(id => {
                          const cust = uniqueCustomers.find(c => c.id === id);
                          const displayName = cust?.name || id;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-medium max-w-full"
                            >
                              <span className="truncate">{displayName}</span>
                              <button
                                onClick={() => toggleTempCustomer(id)}
                                className="flex-shrink-0 hover:text-blue-600 ml-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                        <button
                          onClick={() => { setTempSelectedCustomers([]); setCustomerSearchTerm(''); }}
                          className="text-[10px] text-red-500 hover:text-red-600 font-medium px-1.5 py-1"
                        >
                          Clear all
                        </button>
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Type to search customers..."
                        value={customerSearchTerm}
                        onChange={(e) => setCustomerSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {customerSearchTerm && (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                        {filteredCustomerOptions.length === 0 ? (
                          <p className="text-xs text-gray-400 p-3 text-center">No customers match "{customerSearchTerm}"</p>
                        ) : (
                          filteredCustomerOptions.map(cust => {
                            const isSelected = tempSelectedCustomers.includes(cust.id);
                            const isExcluded = tempExcludedCustomers.includes(cust.id);
                            return (
                              <div
                                key={cust.id}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b border-gray-100 last:border-b-0 ${isSelected ? 'bg-blue-50' : isExcluded ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                              >
                                <button
                                  onClick={() => toggleTempCustomer(cust.id)}
                                  className="flex items-center gap-2 min-w-0 flex-1"
                                >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className={`block truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                                      {cust.name}
                                    </span>
                                    {cust.name !== cust.id && (
                                      <span className="block text-[10px] text-gray-400 truncate">{cust.id}</span>
                                    )}
                                  </div>
                                </button>
                                <button
                                  onClick={() => addExcludedCustomer(cust.id)}
                                  className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Exclude this customer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Excluded Customers */}
                  <div className="space-y-2 pt-3 border-t border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                      <UserMinus className="w-3.5 h-3.5 text-red-400" />
                      Excluded Customers {tempExcludedCustomers.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                          {tempExcludedCustomers.length}
                        </span>
                      )}
                    </label>

                    {tempExcludedCustomers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-2 bg-red-50/50 border border-red-200 rounded-lg">
                        {tempExcludedCustomers.map(id => {
                          const cust = uniqueCustomers.find(c => c.id === id);
                          const displayName = cust?.name || id;
                          return (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded-md text-xs font-medium max-w-full">
                              <span className="truncate">{displayName}</span>
                              <button onClick={() => removeExcludedCustomer(id)} className="flex-shrink-0 hover:text-red-600 ml-0.5">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                        <button
                          onClick={() => setTempExcludedCustomers([])}
                          className="text-[10px] text-red-500 hover:text-red-600 font-medium px-1.5 py-1"
                        >
                          Clear all
                        </button>
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search customer to exclude..."
                        value={excludeSearchTerm}
                        onChange={(e) => setExcludeSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white border border-red-200 rounded-lg text-gray-700 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    </div>
                    {excludeSearchTerm && (
                      <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                        {filteredExcludeOptions.length === 0 ? (
                          <p className="text-xs text-gray-400 p-3 text-center">No customers found</p>
                        ) : (
                          filteredExcludeOptions.map(cust => (
                            <button
                              key={cust.id}
                              onClick={() => addExcludedCustomer(cust.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-red-50 border-b border-gray-100 last:border-b-0 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-gray-700">{cust.name}</span>
                                {cust.name !== cust.id && <span className="block text-[10px] text-gray-400 truncate">{cust.id}</span>}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
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

                  {defaultFiltersActive && (
                    <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <span className="text-xs font-medium text-blue-700">Default filters active</span>
                      <button
                        onClick={() => { clearFilters(); setDefaultFiltersActive(false); }}
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Default Filters</p>
                    {hasDefaultFilters ? (
                      <>
                        <button
                          onClick={applyDefaultFilters}
                          className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Apply Default Filters
                        </button>
                        <button
                          onClick={saveAsDefaultFilters}
                          disabled={savingDefaults}
                          className="w-full px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {savingDefaults ? 'Saving...' : 'Update Defaults with Current'}
                        </button>
                        <button
                          onClick={removeDefaultFilters}
                          className="w-full px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Remove Saved Defaults
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={saveAsDefaultFilters}
                        disabled={savingDefaults}
                        className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {savingDefaults ? 'Saving...' : 'Save Current as Default'}
                      </button>
                    )}
                  </div>

                  {hasActiveFilters && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-2 space-y-1">
                      <p className="text-xs font-medium text-amber-700">
                        Filters active -- results in all views are filtered
                      </p>
                      {selectedCustomers.length > 0 && (
                        <p className="text-[10px] text-amber-600">
                          {selectedCustomers.length} customer{selectedCustomers.length !== 1 ? 's' : ''} selected
                        </p>
                      )}
                      {excludedCustomers.length > 0 && (
                        <p className="text-[10px] text-amber-600">
                          {excludedCustomers.length} customer{excludedCustomers.length !== 1 ? 's' : ''} excluded
                        </p>
                      )}
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
            <div className="inline-flex bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden" data-tour="invoice-view-toggle">
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
          <div className="flex items-center justify-between mb-6" data-tour="invoice-date-nav">
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
                data-tour="invoice-refresh"
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
                    const openInvBal = dayInvoices.filter(i => i.type === 'Invoice' && i.status === 'Open').reduce((s, i) => s + i.balance, 0);
                    const balancedInvBal = dayInvoices.filter(i => i.type === 'Invoice' && i.status === 'Balanced').reduce((s, i) => s + i.balance, 0);
                    const openCmBal = cms.filter(i => i.status === 'Open' || i.status === 'Balanced').reduce((s, i) => s + i.balance, 0);
                    const netOpenBal = openInvBal + balancedInvBal - openCmBal;

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
                            {netOpenBal > 0 && (
                              <div className="text-xs text-amber-600 font-medium">{formatCurrency(netOpenBal)} open</div>
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
                          {(monthData.openInvoiceBalance + monthData.balancedInvoiceBalance) > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-200">
                              <div className="text-sm font-bold text-amber-600">
                                {formatCurrency(monthData.openInvoiceBalance + monthData.balancedInvoiceBalance - monthData.openCmBalance)} open
                              </div>
                              {monthData.openCmBalance > 0 && (
                                <div className="text-xs text-red-500">CM: -{formatCurrency(monthData.openCmBalance)} ({monthData.openCmCount})</div>
                              )}
                              {monthData.balancedInvoiceBalance > 0 && (
                                <div className="text-xs text-gray-500">{formatCurrency(monthData.balancedInvoiceBalance)} balanced ({monthData.balancedInvoiceCount})</div>
                              )}
                            </div>
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
                          {(yearData.openInvoiceBalance + yearData.balancedInvoiceBalance) > 0 && (
                            <div className="mt-1 pt-2 border-t border-gray-200">
                              <div className="text-lg font-bold text-amber-600">
                                {formatCurrency(yearData.openInvoiceBalance + yearData.balancedInvoiceBalance - yearData.openCmBalance)} open
                              </div>
                              {yearData.openCmBalance > 0 && (
                                <div className="text-sm text-red-500">CM: -{formatCurrency(yearData.openCmBalance)} ({yearData.openCmCount})</div>
                              )}
                              {yearData.balancedInvoiceBalance > 0 && (
                                <div className="text-xs text-gray-500">{formatCurrency(yearData.balancedInvoiceBalance)} balanced ({yearData.balancedInvoiceCount})</div>
                              )}
                            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 max-w-full" data-tour="invoice-summary">
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
                  {monthlyOpenCmBalance > 0 && (
                    <p className="text-xs text-red-500 mt-0.5">CM: -{formatCurrency(monthlyOpenCmBalance)} ({monthlyOpenCmCount})</p>
                  )}
                  {monthlyBalancedInvBalance > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(monthlyBalancedInvBalance)} balanced ({monthlyBalancedInvCount})</p>
                  )}
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
                data-tour="invoice-search"
              />
            </div>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-sm"
              data-tour="invoice-export"
            >
              <Download className="w-5 h-5" />
              Export Excel
            </button>
          </div>

          {/* Customer-Grouped Invoice Table */}
          <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden max-w-full" data-tour="invoice-list">
            <div className="table-scroll-container max-h-[calc(100vh-300px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
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
                  <thead data-tour="invoice-sort">
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