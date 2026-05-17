import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CustomerDetailView from './CustomerDetailView';
import { ArrowLeft, CreditCard as Edit2, Trash2, Users, RefreshCw, Mail, CheckSquare, Square, FileText, Clock, Calendar, PauseCircle, Play, ChevronLeft, ChevronRight, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, TrendingUp, Filter, X, Eye, EyeOff, Ticket, ChevronDown, Zap } from 'lucide-react';
import { usePageCache } from '../contexts/PageCacheContext';
import CustomerFiles from './CustomerFiles';
import * as XLSX from 'xlsx';

type Customer = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  responded_this_month: boolean;
  postpone_until: string | null;
  postpone_reason: string | null;
  created_at: string;
  updated_at: string;
  customer_id?: string;
  balance?: number;
  invoice_count?: number;
  oldest_invoice_date?: string | null;
  newest_invoice_date?: string | null;
  max_days_overdue?: number;
  red_threshold_days?: number;
  red_count?: number;
  yellow_count?: number;
  green_count?: number;
  exclude_from_payment_analytics?: boolean;
  exclude_from_customer_analytics?: boolean;
  avg_days_to_collect?: number | null;
  filtered_gross_balance?: number;
  filtered_net_balance?: number;
  filtered_invoice_count?: number;
  gross_balance?: number;
};

type ScheduledEmail = {
  id: string;
  scheduled_time: string;
  template_name: string;
  formula_name: string;
  timezone: string;
};

type FilterConfig = {
  minBalance: number;
  maxBalance: number;
  minInvoiceCount: number;
  maxInvoiceCount: number;
  minInvoiceAmount: number;
  maxInvoiceAmount: number;
  minDaysOverdue: number;
  maxDaysOverdue: number;
  dateFrom: string;
  dateTo: string;
  logicOperator: 'AND' | 'OR';
  sortBy: 'name' | 'email' | 'balance' | 'invoice_count' | 'max_days_overdue' | 'avg_days_to_collect' | 'created_at';
  sortOrder: 'asc' | 'desc';
};

const BATCH_SIZE = 50;
const PAGE_SIZE = 50;

const DEFAULT_FILTERS: FilterConfig = {
  minBalance: 0,
  maxBalance: Infinity,
  minInvoiceCount: 0,
  maxInvoiceCount: Infinity,
  minInvoiceAmount: 0,
  maxInvoiceAmount: Infinity,
  minDaysOverdue: 0,
  maxDaysOverdue: Infinity,
  dateFrom: '',
  dateTo: '',
  logicOperator: 'AND',
  sortBy: 'balance',
  sortOrder: 'desc'
};

const QUICK_FILTERS = [
  { label: 'High Balance', desc: '>$10k', filter: { minBalance: 10000 } },
  { label: 'Medium Balance', desc: '$5k-$10k', filter: { minBalance: 5000, maxBalance: 10000 } },
  { label: 'Many Invoices', desc: '>20 open', filter: { minInvoiceCount: 20 } },
  { label: 'Overdue 90+', desc: 'days', filter: { minDaysOverdue: 90 } },
  { label: 'Critical', desc: '>$20k', filter: { minBalance: 20000 }, logic: 'OR' as const },
];

type CustomersProps = {
  onBack?: () => void;
};

export default function Customers({ onBack }: CustomersProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const customerIdParam = searchParams.get('customer');
  const invoiceParam = searchParams.get('invoice');
  const handleBack = onBack || (() => navigate(-1));
  const { getCachedState, setCachedState } = usePageCache('customers-list');
  const cachedListState = useRef(getCachedState());
  const cl = cachedListState.current;

  useEffect(() => {
    if (invoiceParam && !customerIdParam) {
      const lookupInvoiceCustomer = async () => {
        const { data, error } = await supabase
          .from('acumatica_invoices')
          .select('customer')
          .eq('reference_number', invoiceParam)
          .neq('status', 'On Hold')
          .maybeSingle();
        if (data && !error) {
          navigate(`/customers?customer=${data.customer}`, { replace: true });
        }
      };
      lookupInvoiceCustomer();
    }
  }, [invoiceParam, customerIdParam, navigate]);

  const [customers, setCustomers] = useState<Customer[]>(() => cl?.customers ?? []);
  const [allCustomers, setAllCustomers] = useState<Customer[]>(() => cl?.allCustomers ?? []);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>(() => cl?.filteredCustomers ?? []);
  const [loading, setLoading] = useState(() => !cl);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(() => cl?.loadedCount ?? 0);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewingFiles, setViewingFiles] = useState<{ id: string; name: string } | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<{ id: string; name: string } | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => cl?.currentPage ?? 0);
  const [totalCount, setTotalCount] = useState(() => cl?.totalCount ?? 0);
  const [grandTotalCustomers, setGrandTotalCustomers] = useState(() => cl?.grandTotalCustomers ?? 0);
  const [searchQuery, setSearchQuery] = useState(() => cl?.searchQuery ?? '');
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(() => cl?.showFilters ?? false);
  const [excludeCreditMemos, setExcludeCreditMemos] = useState(() => cl?.excludeCreditMemos ?? false);
  const [customersWithOpenTickets, setCustomersWithOpenTickets] = useState<Set<string>>(new Set());
  const [cachedStatsLoaded, setCachedStatsLoaded] = useState(() => cl?.cachedStatsLoaded ?? false);
  const [cachedStatsTime, setCachedStatsTime] = useState<string | null>(() => cl?.cachedStatsTime ?? null);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const hasInvoiceLevelFilters = filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity ||
    filters.minDaysOverdue > 0 || filters.maxDaysOverdue !== Infinity ||
    !!filters.dateFrom || !!filters.dateTo;
  const [activeQuickFilter, setActiveQuickFilter] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  const [stats, setStats] = useState(() => cl?.stats ?? {
    total_customers: 0,
    active_customers: 0,
    total_balance: 0,
    avg_balance: 0,
    customers_with_debt: 0,
    total_open_invoices: 0,
    customers_with_overdue: 0
  });

  const [filters, setFilters] = useState<FilterConfig>(() => cl?.filters ?? { ...DEFAULT_FILTERS });

  const loadCachedStats = async () => {
    try {
      const { data, error } = await supabase
        .from('cached_customer_stats')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (data && !error) {
        setStats({
          total_customers: data.total_customers_excl_test,
          active_customers: data.active_customers_excl_test,
          total_balance: data.total_balance_excl_test,
          avg_balance: data.avg_balance_excl_test,
          customers_with_debt: data.customers_with_debt_excl_test,
          total_open_invoices: data.total_open_invoices_excl_test,
          customers_with_overdue: data.customers_with_overdue_excl_test
        });
        setCachedStatsLoaded(true);
        if (data.calculated_at) {
          setCachedStatsTime(data.calculated_at);
        }
      }
    } catch (err) {
      console.error('Error loading cached stats:', err);
    }
  };

  const fetchKeyRef = useRef(cl ? `${cl.excludeCreditMemos ?? false}` : '');
  const restoredFromCache = useRef(!!cl);

  const stateRef = useRef<Record<string, any>>({});
  useEffect(() => {
    stateRef.current = {
      customers, allCustomers, filteredCustomers, loadedCount,
      currentPage, totalCount, grandTotalCustomers, searchQuery, showFilters,
      excludeCreditMemos, cachedStatsLoaded, cachedStatsTime, stats, filters,
    };
  });

  useEffect(() => {
    return () => { setCachedState(stateRef.current); };
  }, []);

  useEffect(() => {
    const key = `${excludeCreditMemos}`;
    if (fetchKeyRef.current === key) {
      if (restoredFromCache.current) {
        restoredFromCache.current = false;
        loadCustomersWithOpenTickets();
      }
      return;
    }
    fetchKeyRef.current = key;

    loadCachedStats();
    loadCustomersBatched();
    loadCustomersWithOpenTickets();

    const ticketSubscription = supabase
      .channel('ticket_status_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'collection_tickets' },
        () => { loadCustomersWithOpenTickets(); }
      )
      .subscribe();

    return () => { ticketSubscription.unsubscribe(); };
  }, [excludeCreditMemos]);

  const loadCustomersWithOpenTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('collection_tickets')
        .select('customer_id')
        .in('status', ['open', 'in_progress']);
      if (error) throw error;
      setCustomersWithOpenTickets(new Set((data || []).map(t => t.customer_id)));
    } catch (error) {
      console.error('Error loading customers with open tickets:', error);
    }
  };

  const mapCustomerRow = (item: any) => ({
    id: item.customer_id || item.id,
    name: item.customer_name || '',
    email: item.email_address || '',
    is_active: item.is_active ?? true,
    responded_this_month: item.responded_this_month ?? false,
    postpone_until: item.postpone_until ?? null,
    postpone_reason: item.postpone_reason ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    customer_id: item.customer_id,
    balance: excludeCreditMemos ? (item.calculated_balance_excl_cm || item.gross_balance || 0) : (item.calculated_balance || 0),
    gross_balance: item.gross_balance || 0,
    filtered_gross_balance: item.filtered_gross_balance ?? item.gross_balance ?? 0,
    filtered_net_balance: item.filtered_net_balance ?? (excludeCreditMemos ? (item.calculated_balance_excl_cm || item.gross_balance || 0) : (item.calculated_balance || 0)),
    invoice_count: item.open_invoice_count || 0,
    filtered_invoice_count: item.filtered_invoice_count ?? item.open_invoice_count ?? 0,
    max_days_overdue: item.max_days_overdue || 0,
    red_threshold_days: item.red_threshold_days || 30,
    red_count: item.red_count || 0,
    yellow_count: item.yellow_count || 0,
    green_count: item.green_count || 0,
    exclude_from_payment_analytics: item.exclude_from_payment_analytics || false,
    exclude_from_customer_analytics: item.exclude_from_customer_analytics || false
  });

  const loadCustomersBatched = async () => {
    setLoading(true);
    setIsSearching(false);
    setLoadedCount(0);
    try {
      let allData: any[] = [];
      let offset = 0;
      let batchNum = 0;
      const balanceCol = excludeCreditMemos ? 'calculated_balance_excl_cm' : 'calculated_balance';
      while (true) {
        const { data, error } = await supabase
          .from('cached_customer_balances')
          .select('*')
          .eq('is_test_customer', false)
          .order(balanceCol, { ascending: false })
          .range(offset, offset + BATCH_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) {
          if (batchNum === 0) setLoading(false);
          setLoadingMore(false);
          break;
        }
        allData = allData.concat(data);
        batchNum++;
        const merged = allData.map(item => mapCustomerRow(item));
        setLoadedCount(merged.length);
        setGrandTotalCustomers(merged.length);
        setAllCustomers(merged);
        if (batchNum === 1) setLoading(false);
        const isDone = data.length < BATCH_SIZE;
        setLoadingMore(!isDone);
        if (isDone) break;
        offset += BATCH_SIZE;
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Recompute stats from filtered list when filters are active
  useEffect(() => {
    if (filteredCustomers.length === 0 && cachedStatsLoaded && !hasActiveFilters) return;
    if (!hasActiveFilters && !loadingMore && cachedStatsLoaded && filteredCustomers.length > 0) {
      // Use cached stats
    } else if (hasActiveFilters || !cachedStatsLoaded) {
      // Compute from filtered data
    } else {
      return;
    }

    const list = filteredCustomers;
    const totalCustomers = list.length;
    const activeCustomers = list.filter(c => c.is_active).length;
    const totalBalance = list.reduce((sum, c) => sum + (c.filtered_net_balance ?? c.balance ?? 0), 0);
    const customersWithDebt = list.filter(c => (c.filtered_net_balance ?? c.balance ?? 0) > 0).length;
    const totalOpenInvoices = list.reduce((sum, c) => sum + (c.filtered_invoice_count ?? c.invoice_count ?? 0), 0);
    const customersWithOverdue = list.filter(c => (c.max_days_overdue || 0) > 0).length;
    const avgBalance = customersWithDebt > 0 ? totalBalance / customersWithDebt : 0;

    setStats({
      total_customers: totalCustomers,
      active_customers: activeCustomers,
      total_balance: totalBalance,
      avg_balance: avgBalance,
      customers_with_debt: customersWithDebt,
      total_open_invoices: totalOpenInvoices,
      customers_with_overdue: customersWithOverdue
    });
  }, [filteredCustomers, loadingMore, cachedStatsLoaded, hasActiveFilters]);

  const applyFilters = useCallback(async () => {
    const hasServerFilter =
      filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity ||
      !!filters.dateFrom || !!filters.dateTo ||
      !!searchQuery.trim() ||
      filters.minBalance > 0 || filters.maxBalance !== Infinity ||
      filters.minInvoiceCount > 0 || filters.maxInvoiceCount !== Infinity ||
      filters.minDaysOverdue > 0 || filters.maxDaysOverdue !== Infinity;

    setHasActiveFilters(hasServerFilter);

    if (hasServerFilter) {
      setLoading(true);
      setLoadedCount(0);
      try {
        const rpcParams = {
          p_search: searchQuery.trim() || null,
          p_status_filter: 'all',
          p_country_filter: 'all',
          p_sort_by: filters.sortBy === 'name' ? 'customer_name' : filters.sortBy,
          p_sort_order: filters.sortOrder,
          p_date_from: filters.dateFrom || null,
          p_date_to: filters.dateTo || null,
          p_date_context: (filters.dateFrom || filters.dateTo) ? 'invoice_date' : null,
          p_balance_filter: 'all',
          p_min_balance: filters.minBalance > 0 ? filters.minBalance : null,
          p_max_balance: filters.maxBalance !== Infinity ? filters.maxBalance : null,
          p_min_open_invoices: filters.minInvoiceCount > 0 ? filters.minInvoiceCount : null,
          p_max_open_invoices: filters.maxInvoiceCount !== Infinity ? filters.maxInvoiceCount : null,
          p_min_invoice_amount: filters.minInvoiceAmount > 0 ? filters.minInvoiceAmount : null,
          p_max_invoice_amount: filters.maxInvoiceAmount !== Infinity ? filters.maxInvoiceAmount : null,
          p_exclude_credit_memos: excludeCreditMemos,
          p_calculate_avg_days: false,
          p_min_days_overdue: filters.minDaysOverdue > 0 ? filters.minDaysOverdue : null,
          p_max_days_overdue: filters.maxDaysOverdue !== Infinity ? Math.round(filters.maxDaysOverdue) : null,
          p_test_customers: false
        };

        let allAnalytics: any[] = [];
        let offset = 0;
        let batchNum = 0;
        while (true) {
          const { data, error } = await supabase
            .rpc('get_customers_with_balance', { ...rpcParams, p_limit: BATCH_SIZE, p_offset: offset });
          if (error) throw error;
          if (!data || data.length === 0) {
            setLoadingMore(false);
            break;
          }
          allAnalytics = allAnalytics.concat(data);
          batchNum++;
          const filtered = allAnalytics.map(item => mapCustomerRow(item));
          setLoadedCount(filtered.length);
          setFilteredCustomers(filtered);
          setTotalCount(filtered.length);
          const start = currentPage * PAGE_SIZE;
          setCustomers(filtered.slice(start, start + PAGE_SIZE));
          if (batchNum === 1) setLoading(false);
          const isDone = data.length < BATCH_SIZE;
          setLoadingMore(!isDone);
          if (isDone) break;
          offset += BATCH_SIZE;
        }
      } catch (error) {
        console.error('Error applying filters:', error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
      return;
    }

    let filtered = [...allCustomers];
    filtered.sort((a, b) => {
      let comparison = 0;
      const sortBy = filters.sortBy;
      if (sortBy === 'balance') comparison = (a.balance || 0) - (b.balance || 0);
      else if (sortBy === 'invoice_count') comparison = (a.invoice_count || 0) - (b.invoice_count || 0);
      else if (sortBy === 'max_days_overdue') comparison = (a.max_days_overdue || 0) - (b.max_days_overdue || 0);
      else if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
      else if (sortBy === 'email') comparison = a.email.localeCompare(b.email);
      else if (sortBy === 'created_at') comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredCustomers(filtered);
    setTotalCount(filtered.length);
    const start = currentPage * PAGE_SIZE;
    setCustomers(filtered.slice(start, start + PAGE_SIZE));
  }, [allCustomers, filters, searchQuery, currentPage, excludeCreditMemos]);

  useEffect(() => { applyFilters(); }, [applyFilters]);

  if (customerIdParam && customerIdParam !== 'null' && customerIdParam !== 'undefined') {
    return <CustomerDetailView customerId={customerIdParam} onBack={() => navigate('/customers')} />;
  }

  const buildCustomerUrl = (customerId: string) => {
    const params = new URLSearchParams({ customer: customerId });
    if (filters.minInvoiceAmount > 0) params.set('amountMin', String(filters.minInvoiceAmount));
    if (filters.maxInvoiceAmount !== Infinity) params.set('amountMax', String(filters.maxInvoiceAmount));
    if (filters.minDaysOverdue > 0) params.set('daysMin', String(filters.minDaysOverdue));
    if (filters.maxDaysOverdue !== Infinity) params.set('daysMax', String(Math.round(filters.maxDaysOverdue)));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    return `/customers?${params.toString()}`;
  };

  const handleSearch = () => {
    setCurrentPage(0);
    setIsSearching(!!searchQuery.trim());
    applyFilters();
  };

  const goToNextPage = () => {
    if ((currentPage + 1) * PAGE_SIZE < totalCount) setCurrentPage(currentPage + 1);
  };
  const goToPreviousPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const handleSort = (column: string) => {
    if (filters.sortBy === column) {
      setFilters({ ...filters, sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      setFilters({ ...filters, sortBy: column as any, sortOrder: 'asc' });
    }
    setCurrentPage(0);
  };

  const getSortIcon = (column: string) => {
    if (filters.sortBy !== column) return <ArrowUpDown size={14} className="text-gray-400" />;
    return filters.sortOrder === 'asc' ?
      <ArrowUp size={14} className="text-blue-600" /> :
      <ArrowDown size={14} className="text-blue-600" />;
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setSearchQuery('');
    setCurrentPage(0);
    setActiveQuickFilter(null);
  };

  const applyQuickFilter = (index: number) => {
    if (activeQuickFilter === index) {
      resetFilters();
      return;
    }
    const preset = QUICK_FILTERS[index];
    setFilters({
      ...DEFAULT_FILTERS,
      ...preset.filter,
      logicOperator: preset.logic || 'AND'
    });
    setCurrentPage(0);
    setActiveQuickFilter(index);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({ name: customer.name, email: customer.email });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      await loadCustomersBatched();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error deleting customer');
    }
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ is_active: !currentValue }).eq('customer_id', id);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, is_active: !currentValue } : c));
    } catch (error) {
      console.error('Error updating customer status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleResponded = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ responded_this_month: !currentValue }).eq('customer_id', id);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, responded_this_month: !currentValue } : c));
    } catch (error) {
      console.error('Error updating response status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleUnpostpone = async (id: string) => {
    if (!confirm('Remove the postponement for this customer?')) return;
    setUpdating(id);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ postpone_until: null, postpone_reason: null }).eq('customer_id', id);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, postpone_until: null, postpone_reason: null } : c));
    } catch (error) {
      console.error('Error removing postponement:', error);
    } finally {
      setUpdating(null);
    }
  };

  const togglePaymentAnalyticsExclusion = async (customerId: string, currentValue: boolean) => {
    setUpdating(customerId);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ exclude_from_payment_analytics: !currentValue }).eq('customer_id', customerId);
      if (error) throw error;
      const updater = (c: Customer) => c.customer_id === customerId ? { ...c, exclude_from_payment_analytics: !currentValue } : c;
      setAllCustomers(allCustomers.map(updater));
      setCustomers(customers.map(updater));
      setFilteredCustomers(filteredCustomers.map(updater));
    } catch (error) {
      console.error('Error toggling payment analytics exclusion:', error);
    } finally {
      setUpdating(null);
    }
  };

  const toggleCustomerAnalyticsExclusion = async (customerId: string, currentValue: boolean) => {
    setUpdating(customerId);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ exclude_from_customer_analytics: !currentValue }).eq('customer_id', customerId);
      if (error) throw error;
      const updater = (c: Customer) => c.customer_id === customerId ? { ...c, exclude_from_customer_analytics: !currentValue } : c;
      setAllCustomers(allCustomers.map(updater));
      setCustomers(customers.map(updater));
      setFilteredCustomers(filteredCustomers.map(updater));
    } catch (error) {
      console.error('Error toggling customer analytics exclusion:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;
    try {
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update({ name: formData.name, email: formData.email }).eq('id', editingCustomer.id);
        if (error) throw error;
      }
      setShowForm(false);
      await loadCustomersBatched();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      alert('Error saving customer');
    }
  };

  const loadScheduledEmails = async (customerId: string) => {
    setLoadingSchedule(true);
    try {
      const { data, error } = await supabase
        .from('customer_assignments')
        .select(`id, start_day_of_month, timezone, email_formulas!inner (name, schedule), email_templates!inner (name)`)
        .eq('customer_id', customerId)
        .eq('is_active', true);
      if (error) throw error;

      const upcomingEmails: ScheduledEmail[] = [];
      const now = new Date();
      data?.forEach((assignment: any) => {
        const startDay = assignment.start_day_of_month;
        const schedule = assignment.email_formulas?.schedule || [];
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
          const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, startDay);
          schedule.forEach((scheduleItem: any) => {
            (scheduleItem.times || []).forEach((sendTime: string) => {
              const emailDate = new Date(targetDate);
              emailDate.setDate(emailDate.getDate() + (scheduleItem.day - 1));
              const [hours, minutes] = sendTime.split(':');
              emailDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
              if (emailDate > now) {
                upcomingEmails.push({
                  id: `${assignment.id}-${monthOffset}-${scheduleItem.day}-${sendTime}`,
                  scheduled_time: emailDate.toISOString(),
                  template_name: assignment.email_templates?.name || 'N/A',
                  formula_name: `${assignment.email_formulas?.name || 'N/A'} (Day ${scheduleItem.day})`,
                  timezone: assignment.timezone
                });
              }
            });
          });
        }
      });
      upcomingEmails.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
      setScheduledEmails(upcomingEmails.slice(0, 10));
    } catch (error) {
      console.error('Error loading scheduled emails:', error);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const exportToExcel = () => {
    const totalBalance = filteredCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const totalGross = filteredCustomers.reduce((sum, c) => sum + (c.gross_balance || 0), 0);
    const totalInvoices = filteredCustomers.reduce((sum, c) => sum + (c.invoice_count || 0), 0);
    const filterDesc = hasActiveFilters
      ? `Filtered_${filteredCustomers.length}_of_${grandTotalCustomers}`
      : `All_${filteredCustomers.length}`;

    const exportData = filteredCustomers.map((customer, index) => ({
      '#': index + 1,
      'Customer ID': customer.customer_id || customer.id,
      'Customer Name': customer.name,
      'Email': customer.email,
      'Active': customer.is_active ? 'Yes' : 'No',
      'Open Invoices': customer.invoice_count || 0,
      'Gross Balance': customer.gross_balance || 0,
      'Net Balance': customer.balance || 0,
      'Max Days Overdue': customer.max_days_overdue || 0,
      'Red Invoices': customer.red_count || 0,
      'Yellow Invoices': customer.yellow_count || 0,
      'Green Invoices': customer.green_count || 0,
      'Responded This Month': customer.responded_this_month ? 'Yes' : 'No',
      'Postponed Until': customer.postpone_until ? new Date(customer.postpone_until).toLocaleDateString() : '',
      'Postpone Reason': customer.postpone_reason || ''
    }));

    const summaryRow = {
      '#': '', 'Customer ID': '', 'Customer Name': 'TOTALS', 'Email': '', 'Active': '',
      'Open Invoices': totalInvoices, 'Gross Balance': totalGross, 'Net Balance': totalBalance,
      'Max Days Overdue': '', 'Red Invoices': '', 'Yellow Invoices': '', 'Green Invoices': '',
      'Responded This Month': '', 'Postponed Until': '', 'Postpone Reason': ''
    };

    const worksheet = XLSX.utils.json_to_sheet([...exportData, summaryRow]);
    worksheet['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 30 }, { wch: 28 }, { wch: 8 },
      { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
      { wch: 16 }, { wch: 20 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    XLSX.writeFile(workbook, `customers_${filterDesc}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const activeFilterCount = [
    filters.minBalance > 0, filters.maxBalance !== Infinity,
    filters.minInvoiceCount > 0, filters.maxInvoiceCount !== Infinity,
    filters.minInvoiceAmount > 0, filters.maxInvoiceAmount !== Infinity,
    filters.minDaysOverdue > 0, filters.maxDaysOverdue !== Infinity,
    filters.dateFrom !== '', filters.dateTo !== '',
    searchQuery.trim() !== ''
  ].filter(Boolean).length;

  // Schedule view
  if (viewingSchedule) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => { setViewingSchedule(null); setScheduledEmails([]); }}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors mb-6">
            <ArrowLeft size={20} /> Back to Customers
          </button>
          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-600 p-2 rounded-lg"><Clock size={24} className="text-white" /></div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Upcoming Emails</h2>
                  <p className="text-gray-600">{viewingSchedule.name}</p>
                </div>
              </div>
              <button onClick={() => loadScheduledEmails(viewingSchedule.id)} disabled={loadingSchedule}
                className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-lg transition-colors">
                <RefreshCw size={18} className={loadingSchedule ? 'animate-spin' : ''} />
              </button>
            </div>
            {loadingSchedule ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin text-orange-600 mx-auto mb-4" size={32} />
                <p className="text-gray-600">Loading schedule...</p>
              </div>
            ) : scheduledEmails.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {scheduledEmails.map((email) => {
                  const scheduledDate = new Date(email.scheduled_time);
                  const isToday = scheduledDate.toDateString() === new Date().toDateString();
                  return (
                    <div key={email.id} className={`p-4 rounded-lg border transition-all ${isToday ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-300'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Mail size={16} className={isToday ? 'text-orange-600' : 'text-blue-600'} />
                          <span className={`text-sm font-medium ${isToday ? 'text-orange-800' : 'text-gray-900'}`}>{email.template_name}</span>
                        </div>
                        {isToday && <span className="px-2 py-0.5 bg-orange-200 border border-orange-400 text-orange-800 text-xs rounded">Today</span>}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={12} />
                          <span>{scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock size={12} />
                          <span>{scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} ({email.timezone?.replace('America/', '').replace('_', ' ') || 'UTC'})</span>
                        </div>
                        <div className="text-gray-500">Formula: {email.formula_name}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="text-gray-400 mx-auto mb-4" size={48} />
                <p className="text-gray-600">No upcoming emails scheduled</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  if (viewingFiles) {
    return <CustomerFiles customerId={viewingFiles.id} customerName={viewingFiles.name} onBack={() => setViewingFiles(null)} />;
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors">
            <ArrowLeft size={20} /> Back to Customers
          </button>
          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Customer</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div className="flex gap-4">
                <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Update Customer</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-[95%] mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={handleBack} className="p-2.5 hover:bg-white/80 rounded-xl transition-all duration-200 border border-transparent hover:border-gray-200 hover:shadow-sm">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Customers</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {grandTotalCustomers > 0 ? `${grandTotalCustomers.toLocaleString()} customers` : 'Loading...'}
                {cachedStatsTime && !hasActiveFilters && (
                  <span className="ml-2 text-gray-400">
                    Updated {new Date(cachedStatsTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportToExcel} disabled={loading || filteredCustomers.length === 0}
              data-tour="customer-export"
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 border border-gray-200 rounded-xl transition-all duration-200 text-sm font-medium shadow-sm hover:shadow">
              <Download size={16} /> Export
            </button>
            <button onClick={() => loadCustomersBatched()} disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl transition-all duration-200 text-sm font-medium shadow-sm hover:shadow">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-tour="customer-stats">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customers</span>
              <div className="p-1.5 bg-blue-50 rounded-lg"><Users className="w-3.5 h-3.5 text-blue-600" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.total_customers.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stats.active_customers.toLocaleString()} active</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">With Debt</span>
              <div className="p-1.5 bg-orange-50 rounded-lg"><FileText className="w-3.5 h-3.5 text-orange-600" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.customers_with_debt.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stats.total_open_invoices.toLocaleString()} invoices</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Owed</span>
              <div className="p-1.5 bg-emerald-50 rounded-lg"><DollarSign className="w-3.5 h-3.5 text-emerald-600" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${stats.total_balance >= 1000000
                ? `${(stats.total_balance / 1000000).toFixed(2)}M`
                : stats.total_balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{stats.customers_with_debt.toLocaleString()} customers</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Balance</span>
              <div className="p-1.5 bg-cyan-50 rounded-lg"><TrendingUp className="w-3.5 h-3.5 text-cyan-600" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${stats.avg_balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">per debtor</p>
          </div>
        </div>

        {/* Search + Filters Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          {/* Search Bar */}
          <div className="p-4" data-tour="customer-search">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search by name, email, or customer ID..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all duration-200 text-sm"
                />
              </div>
              <button onClick={handleSearch} disabled={loading}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:bg-gray-300 text-white rounded-xl transition-all duration-200 text-sm font-medium shadow-sm">
                Search
              </button>
              {(isSearching || searchQuery) && (
                <button onClick={() => { setSearchQuery(''); setIsSearching(false); setCurrentPage(0); }}
                  className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all duration-200 text-sm">
                  Clear
                </button>
              )}
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Zap size={14} className="text-amber-500" />
              {QUICK_FILTERS.map((qf, idx) => (
                <button key={idx} onClick={() => applyQuickFilter(idx)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 border ${
                    activeQuickFilter === idx
                      ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}>
                  {qf.label} <span className={activeQuickFilter === idx ? 'text-gray-300' : 'text-gray-400'}>{qf.desc}</span>
                </button>
              ))}

              <div className="flex-1" />

              {/* Credit memo toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-500 hover:text-gray-700 transition-colors">
                <input type="checkbox" checked={excludeCreditMemos} onChange={(e) => setExcludeCreditMemos(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                Excl. Credit Memos
              </label>
            </div>
          </div>

          {/* Advanced Filters Toggle */}
          <button onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 hover:bg-gray-100/80 transition-all duration-200">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Advanced Filters</span>
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50/50" data-tour="customer-filters">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer Filters</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Customer Balance</label>
                  <input type="number" value={filters.minBalance || ''} onChange={(e) => setFilters({ ...filters, minBalance: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Customer Balance</label>
                  <input type="number" value={filters.maxBalance === Infinity ? '' : filters.maxBalance} onChange={(e) => setFilters({ ...filters, maxBalance: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Invoice Count</label>
                  <input type="number" value={filters.minInvoiceCount || ''} onChange={(e) => setFilters({ ...filters, minInvoiceCount: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Invoice Count</label>
                  <input type="number" value={filters.maxInvoiceCount === Infinity ? '' : filters.maxInvoiceCount} onChange={(e) => setFilters({ ...filters, maxInvoiceCount: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
              </div>
              <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-2">Invoice Filters</p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Invoice Amount</label>
                  <input type="number" value={filters.minInvoiceAmount || ''} onChange={(e) => setFilters({ ...filters, minInvoiceAmount: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Invoice Amount</label>
                  <input type="number" value={filters.maxInvoiceAmount === Infinity ? '' : filters.maxInvoiceAmount} onChange={(e) => setFilters({ ...filters, maxInvoiceAmount: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Days Overdue</label>
                  <input type="number" value={filters.minDaysOverdue || ''} onChange={(e) => setFilters({ ...filters, minDaysOverdue: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Days Overdue</label>
                  <input type="number" value={filters.maxDaysOverdue === Infinity ? '' : filters.maxDaysOverdue} onChange={(e) => setFilters({ ...filters, maxDaysOverdue: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice Date From</label>
                  <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Invoice Date To</label>
                  <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Sort By</label>
                  <select value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                    <option value="balance">Balance</option>
                    <option value="invoice_count">Invoice Count</option>
                    <option value="max_days_overdue">Days Overdue</option>
                    <option value="avg_days_to_collect">Avg Days to Collect</option>
                    <option value="name">Customer Name</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Order</label>
                  <select value={filters.sortOrder} onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value as 'asc' | 'desc' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                    <option value="desc">Highest First</option>
                    <option value="asc">Lowest First</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={resetFilters}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-200">
                  <X size={12} /> Reset All
                </button>
                <span className="text-xs text-gray-500">
                  Showing <span className="font-semibold text-gray-800">{filteredCustomers.length.toLocaleString()}</span> of {grandTotalCustomers.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Active Filter Banner */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
            <Filter size={14} className="text-blue-600" />
            <span className="text-xs font-medium text-blue-700">
              Filters active -- showing {filteredCustomers.length.toLocaleString()} of {grandTotalCustomers.toLocaleString()} customers
            </span>
            <button onClick={resetFilters} className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium">Clear all</button>
          </div>
        )}

        {/* Customers Table */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-16 text-center border border-gray-100">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
            <p className="text-sm text-gray-500">Loading customers...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-16 text-center border border-gray-100">
            <Users className="text-gray-300 mx-auto mb-4" size={48} />
            <p className="text-gray-500 mb-4">No customers found</p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors text-sm font-medium">
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" data-tour="customer-list">
            {/* Pagination Top */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <button onClick={goToPreviousPage} disabled={currentPage === 0 || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-xs text-gray-500 flex items-center gap-2">
                <span className="font-medium text-gray-700">
                  {Math.min(currentPage * PAGE_SIZE + 1, totalCount)}-{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)}
                </span>
                of {totalCount.toLocaleString()}
                {loadingMore && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <RefreshCw size={12} className="animate-spin" /> loading more...
                  </span>
                )}
              </span>
              <button onClick={goToNextPage} disabled={(currentPage + 1) * PAGE_SIZE >= totalCount || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                Next <ChevronRight size={16} />
              </button>
            </div>

            {/* Table */}
            <div className="max-h-[calc(100vh-420px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1.5">Customer {getSortIcon('name')}</div>
                    </th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('email')}>
                      <div className="flex items-center gap-1.5">Email {getSortIcon('email')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('invoice_count')}>
                      <div className="flex items-center justify-end gap-1.5">Invoices {getSortIcon('invoice_count')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('balance')}>
                      <div className="flex items-center justify-end gap-1.5">Balance {getSortIcon('balance')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('max_days_overdue')}>
                      <div className="flex items-center justify-end gap-1.5">Overdue {getSortIcon('max_days_overdue')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('avg_days_to_collect')}>
                      <div className="flex items-center justify-end gap-1.5">Avg Collect {getSortIcon('avg_days_to_collect')}</div>
                    </th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Resp.</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider" title="Exclude from Payment Analytics">
                      <div className="flex items-center justify-center gap-1"><EyeOff size={12} /><span>Pay</span></div>
                    </th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider" title="Exclude from Customer Analytics">
                      <div className="flex items-center justify-center gap-1"><EyeOff size={12} /><span>Cust</span></div>
                    </th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map((customer) => {
                    const exceedsRedThreshold = (customer.max_days_overdue || 0) >= (customer.red_threshold_days || 30);
                    return (
                      <tr key={customer.id} className={`transition-colors duration-150 ${exceedsRedThreshold ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-blue-50/40'}`}>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-gray-900 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                                  onClick={() => {
                                    const cid = customer.customer_id || customer.id;
                                    if (cid) navigate(buildCustomerUrl(cid));
                                  }}>{customer.name}</span>
                                {customersWithOpenTickets.has(customer.id) && (
                                  <button onClick={() => navigate(`/collection-ticketing?customerId=${customer.id}`)}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 border border-red-200 hover:bg-red-200 rounded text-[10px] text-red-700 transition-colors">
                                    <Ticket size={10} /> Ticket
                                  </button>
                                )}
                                {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                                  <button onClick={() => handleUnpostpone(customer.id)} disabled={updating === customer.id}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-100 border border-yellow-200 hover:bg-yellow-200 rounded text-[10px] text-yellow-700 transition-colors">
                                    <PauseCircle size={10} /> {new Date(customer.postpone_until).toLocaleDateString()}
                                  </button>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">{customer.customer_id || customer.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-sm text-gray-600 truncate max-w-[200px]">{customer.email}</td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-800 font-medium tabular-nums">
                          {hasInvoiceLevelFilters ? (
                            <span title={`${customer.filtered_invoice_count || 0} of ${customer.invoice_count || 0} invoices match filters`}>
                              <span className="text-teal-700">{customer.filtered_invoice_count || 0}</span>
                              <span className="text-gray-400 text-xs">/{customer.invoice_count || 0}</span>
                            </span>
                          ) : (customer.invoice_count || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-900 font-bold tabular-nums">
                          {hasInvoiceLevelFilters ? (
                            <span title={`$${(customer.filtered_gross_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} of $${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} matches filters`}>
                              <span className="text-teal-700">${(customer.filtered_gross_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-gray-400 text-xs ml-1">of ${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </span>
                          ) : (
                            <>${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className={`text-sm font-semibold tabular-nums ${
                            (customer.max_days_overdue || 0) > 90 ? 'text-red-600' :
                            (customer.max_days_overdue || 0) > 60 ? 'text-orange-500' :
                            (customer.max_days_overdue || 0) > 30 ? 'text-amber-500' : 'text-gray-500'
                          }`}>{customer.max_days_overdue || 0}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-600 tabular-nums">
                          {customer.avg_days_to_collect != null ? `${customer.avg_days_to_collect}d` : '--'}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center">
                            <button onClick={() => handleToggleActive(customer.id, customer.is_active)} disabled={updating === customer.id}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${customer.is_active ? 'bg-emerald-500' : 'bg-gray-300'} ${updating === customer.id ? 'opacity-50' : ''}`}>
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${customer.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`}
                                style={{ transform: `translateX(${customer.is_active ? '18px' : '2px'})` }} />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center">
                            <button onClick={() => handleToggleResponded(customer.id, customer.responded_this_month)} disabled={updating === customer.id}
                              className={`p-0.5 rounded transition-colors ${updating === customer.id ? 'opacity-50' : 'hover:bg-gray-100'}`}>
                              {customer.responded_this_month ? <CheckSquare className="text-emerald-600" size={18} /> : <Square className="text-gray-400" size={18} />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center">
                            <button onClick={() => togglePaymentAnalyticsExclusion(customer.customer_id || customer.id, customer.exclude_from_payment_analytics || false)}
                              disabled={updating === customer.customer_id || updating === customer.id}
                              className="p-0.5 rounded transition-colors hover:bg-gray-100"
                              title={customer.exclude_from_payment_analytics ? "Excluded -- click to include" : "Included -- click to exclude"}>
                              {customer.exclude_from_payment_analytics ? <EyeOff className="text-red-500" size={16} /> : <Eye className="text-emerald-500" size={16} />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center">
                            <button onClick={() => toggleCustomerAnalyticsExclusion(customer.customer_id || customer.id, customer.exclude_from_customer_analytics || false)}
                              disabled={updating === customer.customer_id || updating === customer.id}
                              className="p-0.5 rounded transition-colors hover:bg-gray-100"
                              title={customer.exclude_from_customer_analytics ? "Excluded -- click to include" : "Included -- click to exclude"}>
                              {customer.exclude_from_customer_analytics ? <EyeOff className="text-red-500" size={16} /> : <Eye className="text-emerald-500" size={16} />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center gap-1">
                            {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                              <button onClick={() => handleUnpostpone(customer.id)} disabled={updating === customer.id}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors" title="Remove Postponement">
                                <Play size={14} />
                              </button>
                            )}
                            <button onClick={() => { setViewingSchedule({ id: customer.id, name: customer.name }); loadScheduledEmails(customer.id); }}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors" title="View Schedule">
                              <Clock size={14} />
                            </button>
                            <button onClick={() => setViewingFiles({ id: customer.id, name: customer.name })}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors" title="View Files">
                              <FileText size={14} />
                            </button>
                            <button onClick={() => handleEdit(customer)}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors" title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(customer.id)}
                              className="p-1.5 bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Bottom */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <button onClick={goToPreviousPage} disabled={currentPage === 0 || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-xs text-gray-500">
                Page {currentPage + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
                {loadingMore && <span className="text-blue-600 ml-1"><RefreshCw size={12} className="animate-spin inline" /></span>}
              </span>
              <button onClick={goToNextPage} disabled={(currentPage + 1) * PAGE_SIZE >= totalCount || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
