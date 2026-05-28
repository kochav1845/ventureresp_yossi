import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CustomerDetailView from './CustomerDetailView';
import { ArrowLeft, CreditCard as Edit2, Trash2, Users, RefreshCw, Mail, CheckSquare, Square, FileText, Clock, Calendar, PauseCircle, Play, ChevronLeft, ChevronRight, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, TrendingUp, Filter, X, Eye, EyeOff, Ticket } from 'lucide-react';
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
  const rawNavigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = (path: string, options?: any) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      rawNavigate(`/${orgSlug}${path}`, options);
    } else {
      rawNavigate(path, options);
    }
  };
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
  const [editingRedThreshold, setEditingRedThreshold] = useState<string | null>(null);
  const [redThresholdInput, setRedThresholdInput] = useState('');
  const [cachedStatsTime, setCachedStatsTime] = useState<string | null>(() => cl?.cachedStatsTime ?? null);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
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
  const hasInvoiceLevelFilters = filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity ||
    filters.minDaysOverdue > 0 || filters.maxDaysOverdue !== Infinity ||
    !!filters.dateFrom || !!filters.dateTo;

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
      const balanceCol = excludeCreditMemos ? 'calculated_balance_excl_cm' : 'calculated_balance';
      const { data, error } = await supabase
        .from('cached_customer_balances')
        .select('*')
        .eq('is_test_customer', false)
        .order(balanceCol, { ascending: false });
      if (error) throw error;
      const merged = (data || []).map(item => mapCustomerRow(item));
      setLoadedCount(merged.length);
      setGrandTotalCustomers(merged.length);
      setAllCustomers(merged);
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

        const { data, error } = await supabase
          .rpc('get_customers_with_balance', { ...rpcParams, p_limit: 5000, p_offset: 0 });
        if (error) throw error;
        const filtered = (data || []).map(item => mapCustomerRow(item));
        setLoadedCount(filtered.length);
        setFilteredCustomers(filtered);
        setTotalCount(filtered.length);
        const start = currentPage * PAGE_SIZE;
        setCustomers(filtered.slice(start, start + PAGE_SIZE));
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

  const handleSaveRedThreshold = async (customerId: string, customerDbId: string) => {
    const days = parseInt(redThresholdInput, 10);
    if (isNaN(days) || days < 1) {
      setEditingRedThreshold(null);
      return;
    }
    setUpdating(customerId);
    try {
      const { error } = await supabase
        .from('acumatica_customers')
        .update({ days_from_invoice_threshold: days })
        .eq('customer_id', customerDbId);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === customerId ? { ...c, red_threshold_days: days } : c));
    } catch (error) {
      console.error('Error updating red threshold:', error);
    } finally {
      setUpdating(null);
      setEditingRedThreshold(null);
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
    <div className="flex flex-col h-screen bg-white">
      {/* Compact Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-5 py-3 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Customers</h1>
            <p className="text-xs text-gray-500">
              {grandTotalCustomers > 0 ? `${grandTotalCustomers.toLocaleString()} total` : 'Loading...'}
              {hasActiveFilters && ` | ${filteredCustomers.length.toLocaleString()} filtered`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} disabled={loading || filteredCustomers.length === 0}
            data-tour="customer-export"
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium shadow-sm">
            <Download size={14} /> Export
          </button>
          <button onClick={() => loadCustomersBatched()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium shadow-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Content: Sidebar + Table */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Sticky Filters */}
        <div className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-y-auto">
          {/* Filter Header */}
          <div className="sticky top-0 z-10 p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                Filters
              </h3>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-medium">
                  <X className="w-3 h-3" /> Clear ({activeFilterCount})
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-100" data-tour="customer-search">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Name, ID, email..."
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setIsSearching(false); setCurrentPage(0); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Customer Balance */}
          <div className="p-4 border-b border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Customer Balance</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.minBalance || ''} onChange={(e) => setFilters({ ...filters, minBalance: Number(e.target.value) || 0 })}
                placeholder="Min" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <input type="number" value={filters.maxBalance === Infinity ? '' : filters.maxBalance} onChange={(e) => setFilters({ ...filters, maxBalance: e.target.value ? Number(e.target.value) : Infinity })}
                placeholder="Max" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          {/* Open Invoice Count */}
          <div className="p-4 border-b border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Open Invoice Count</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.minInvoiceCount || ''} onChange={(e) => setFilters({ ...filters, minInvoiceCount: Number(e.target.value) || 0 })}
                placeholder="Min" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <input type="number" value={filters.maxInvoiceCount === Infinity ? '' : filters.maxInvoiceCount} onChange={(e) => setFilters({ ...filters, maxInvoiceCount: e.target.value ? Number(e.target.value) : Infinity })}
                placeholder="Max" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          {/* Invoice Amount */}
          <div className="p-4 border-b border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Invoice Amount</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.minInvoiceAmount || ''} onChange={(e) => setFilters({ ...filters, minInvoiceAmount: Number(e.target.value) || 0 })}
                placeholder="Min" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <input type="number" value={filters.maxInvoiceAmount === Infinity ? '' : filters.maxInvoiceAmount} onChange={(e) => setFilters({ ...filters, maxInvoiceAmount: e.target.value ? Number(e.target.value) : Infinity })}
                placeholder="Max" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          {/* Days Overdue */}
          <div className="p-4 border-b border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Days Overdue</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={filters.minDaysOverdue || ''} onChange={(e) => setFilters({ ...filters, minDaysOverdue: Number(e.target.value) || 0 })}
                placeholder="Min" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <input type="number" value={filters.maxDaysOverdue === Infinity ? '' : filters.maxDaysOverdue} onChange={(e) => setFilters({ ...filters, maxDaysOverdue: e.target.value ? Number(e.target.value) : Infinity })}
                placeholder="Max" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          {/* Invoice Date Range */}
          <div className="p-4 border-b border-gray-100">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Invoice Date Range</label>
            <div className="space-y-2">
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          {/* Credit Memo Toggle */}
          <div className="p-4 border-b border-gray-100" data-tour="customer-exclude-cm">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={excludeCreditMemos} onChange={(e) => setExcludeCreditMemos(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Exclude Credit Memos</span>
            </label>
          </div>

          {/* Sort */}
          <div className="p-4 border-b border-gray-100" data-tour="customer-sort">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Sort By</label>
            <select value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 mb-2">
              <option value="balance">Balance</option>
              <option value="invoice_count">Invoice Count</option>
              <option value="max_days_overdue">Days Overdue</option>
              <option value="avg_days_to_collect">Avg Days to Collect</option>
              <option value="name">Customer Name</option>
              <option value="created_at">Date Added</option>
            </select>
            <button onClick={() => setFilters({ ...filters, sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors">
              <ArrowUpDown className="w-3.5 h-3.5" />
              {filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>

          {/* Summary at Bottom */}
          <div className="mt-auto p-4 bg-gray-50 border-t border-gray-200 space-y-3" data-tour="customer-stats">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Summary</h4>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  Customers
                </span>
                <span className="text-sm font-bold text-gray-900">{stats.total_customers.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <DollarSign className="w-3.5 h-3.5 text-red-500" />
                  Total Balance
                </span>
                <span className="text-sm font-bold text-red-600">
                  ${stats.total_balance >= 1000000
                    ? `${(stats.total_balance / 1000000).toFixed(2)}M`
                    : stats.total_balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  Open Invoices
                </span>
                <span className="text-sm font-bold text-gray-900">{stats.total_open_invoices.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-500" />
                  Avg Balance
                </span>
                <span className="text-sm font-bold text-gray-900">
                  ${stats.avg_balance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  With Overdue
                </span>
                <span className="text-sm font-bold text-amber-600">{stats.customers_with_overdue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content - Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
                <p className="text-sm text-gray-500">Loading customers...</p>
              </div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex items-center justify-center flex-1">
              <div className="text-center">
                <Users className="text-gray-300 mx-auto mb-4" size={48} />
                <p className="text-gray-500 mb-4">No customers found</p>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium">
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Pagination */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                <button onClick={goToPreviousPage} disabled={currentPage === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 border border-gray-200 rounded-lg text-xs">
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{Math.min(currentPage * PAGE_SIZE + 1, totalCount)}-{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)}</span> of {totalCount.toLocaleString()}
                  {loadingMore && <RefreshCw size={12} className="animate-spin inline ml-1 text-blue-600" />}
                </span>
                <button onClick={goToNextPage} disabled={(currentPage + 1) * PAGE_SIZE >= totalCount}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 border border-gray-200 rounded-lg text-xs">
                  Next <ChevronRight size={14} />
                </button>
              </div>

              {/* Scrollable Table */}
              <div className="flex-1 overflow-auto" data-tour="customer-list" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1.5">Customer {getSortIcon('name')}</div>
                      </th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('email')}>
                        <div className="flex items-center gap-1.5">Email {getSortIcon('email')}</div>
                      </th>
                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('invoice_count')}>
                        <div className="flex items-center justify-end gap-1.5">Invoices {getSortIcon('invoice_count')}</div>
                      </th>
                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('balance')}>
                        <div className="flex items-center justify-end gap-1.5">Balance {getSortIcon('balance')}</div>
                      </th>
                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('max_days_overdue')}>
                        <div className="flex items-center justify-end gap-1.5">Overdue {getSortIcon('max_days_overdue')}</div>
                      </th>
                      <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('avg_days_to_collect')}>
                        <div className="flex items-center justify-end gap-1.5">Avg Collect {getSortIcon('avg_days_to_collect')}</div>
                      </th>
                      <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider" title="Days from invoice date to turn red">Days to Red</th>
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
                        <tr key={customer.id} data-tour="customer-row" className={`transition-colors duration-150 ${exceedsRedThreshold ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-blue-50/40'}`}>
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
                              {editingRedThreshold === customer.id ? (
                                <input
                                  type="number"
                                  min="1"
                                  className="w-14 px-1.5 py-0.5 text-xs text-center border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  value={redThresholdInput}
                                  onChange={(e) => setRedThresholdInput(e.target.value)}
                                  onBlur={() => handleSaveRedThreshold(customer.id, customer.customer_id || customer.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRedThreshold(customer.id, customer.customer_id || customer.id);
                                    if (e.key === 'Escape') setEditingRedThreshold(null);
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <button
                                  onClick={() => { setEditingRedThreshold(customer.id); setRedThresholdInput(String(customer.red_threshold_days || 30)); }}
                                  className="px-2 py-0.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-red-50 hover:text-red-700 rounded transition-colors border border-transparent hover:border-red-200"
                                  title="Click to edit days from invoice date to turn red"
                                >
                                  {customer.red_threshold_days || 30}d
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex justify-center">
                              <button onClick={() => handleToggleActive(customer.id, customer.is_active)} disabled={updating === customer.id}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${customer.is_active ? 'bg-emerald-500' : 'bg-gray-300'} ${updating === customer.id ? 'opacity-50' : ''}`}>
                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm`}
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
                                title={customer.exclude_from_payment_analytics ? "Excluded" : "Included"}>
                                {customer.exclude_from_payment_analytics ? <EyeOff className="text-red-500" size={16} /> : <Eye className="text-emerald-500" size={16} />}
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex justify-center">
                              <button onClick={() => toggleCustomerAnalyticsExclusion(customer.customer_id || customer.id, customer.exclude_from_customer_analytics || false)}
                                disabled={updating === customer.customer_id || updating === customer.id}
                                className="p-0.5 rounded transition-colors hover:bg-gray-100"
                                title={customer.exclude_from_customer_analytics ? "Excluded" : "Included"}>
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
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
                <button onClick={goToPreviousPage} disabled={currentPage === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 border border-gray-200 rounded-lg text-xs">
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs text-gray-500">
                  Page {currentPage + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
                </span>
                <button onClick={goToNextPage} disabled={(currentPage + 1) * PAGE_SIZE >= totalCount}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 border border-gray-200 rounded-lg text-xs">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
