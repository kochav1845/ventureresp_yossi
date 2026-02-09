import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Calendar, DollarSign, Database, Filter, X, PieChart, Edit2, Check, ArrowUp, ArrowDown, ArrowUpDown, Sliders, Lock, Users, FileText, TrendingUp, AlertTriangle, Save, FolderOpen, Eye, EyeOff, Trash2, Zap, Clock, Target, MessageSquare, Download, UserPlus, Settings, Info, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import AcumaticaInvoiceTest from './AcumaticaInvoiceTest';
import CustomerDetailView from './CustomerDetailView';
import AssignCustomerModal from './AssignCustomerModal';
import QuickFilterManager from './QuickFilterManager';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { exportToExcel } from '../lib/excelExport';

interface AcumaticaCustomersProps {
  onBack?: () => void;
}

interface TooltipProps {
  content: string;
  title?: string;
  children?: React.ReactNode;
}

function InfoTooltip({ content, title, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="ml-1.5 text-gray-400 hover:text-blue-500 transition-colors focus:outline-none"
      >
        {children || <Info className="w-4 h-4" />}
      </button>
      {isVisible && (
        <div className="absolute z-50 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl left-6 top-0 transform -translate-y-1/4">
          <div className="absolute left-0 top-1/4 transform -translate-x-1 translate-y-1">
            <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
          {title && <div className="font-semibold mb-1.5 text-blue-300">{title}</div>}
          <div className="leading-relaxed whitespace-normal">{content}</div>
        </div>
      )}
    </div>
  );
}

export default function AcumaticaCustomers({ onBack }: AcumaticaCustomersProps) {
  const { profile } = useAuth();
  const { hasPermission } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.ACUMATICA_CUSTOMERS, 'view');
  const canPerformFetch = profile?.role === 'admin' || (profile as any)?.can_perform_fetch;
  const [displayedCustomers, setDisplayedCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showFetchPage, setShowFetchPage] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [balanceFilter, setBalanceFilter] = useState<string>('positive');
  const [sortBy, setSortBy] = useState<string>('customer_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [grandTotalCustomers, setGrandTotalCustomers] = useState(0); // Unfiltered total - never changes
  const [filteredCount, setFilteredCount] = useState(0); // Filtered count excluding excluded customers
  const [hoveredCustomer, setHoveredCustomer] = useState<string | null>(null);
  const [editingThreshold, setEditingThreshold] = useState<string | null>(null);
  const [thresholdValue, setThresholdValue] = useState<number>(30);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minOpenInvoices, setMinOpenInvoices] = useState('');
  const [maxOpenInvoices, setMaxOpenInvoices] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [analyticsStats, setAnalyticsStats] = useState({
    totalCustomers: 0,
    activeCustomers: 0,
    totalBalance: 0,
    avgBalance: 0,
    customersWithDebt: 0,
    totalOpenInvoices: 0,
    customersWithOverdue: 0
  });
  const [excludedCustomerIds, setExcludedCustomerIds] = useState<Set<string>>(new Set());
  const [excludedCustomersWithReasons, setExcludedCustomersWithReasons] = useState<Map<string, { notes: string; excluded_at: string }>>(new Map());
  const [exclusionBannerDismissed, setExclusionBannerDismissed] = useState(false);
  const [showAllExcludedButtonDismissed, setShowAllExcludedButtonDismissed] = useState(false);
  const [savedFilters, setSavedFilters] = useState<any[]>([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [showLoadFilterModal, setShowLoadFilterModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [savingFilter, setSavingFilter] = useState(false);
  const [dateRangeContext, setDateRangeContext] = useState<'invoice_date' | 'balance_date' | 'customer_added'>('invoice_date');
  const [showExcludedCustomersPanel, setShowExcludedCustomersPanel] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(null);
  const [showAssignCustomerModal, setShowAssignCustomerModal] = useState(false);
  const [customerToAssign, setCustomerToAssign] = useState<{ id: string; name: string } | null>(null);
  const [excludeCreditMemos, setExcludeCreditMemos] = useState(false);
  const [customQuickFilters, setCustomQuickFilters] = useState<any[]>([]);
  const [showQuickFilterManager, setShowQuickFilterManager] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 100;

  useEffect(() => {
    loadGrandTotal();
    loadExcludedCustomers();
    loadSavedFilters();
    loadCustomQuickFilters();
    loadCustomers();
    // Load banner dismissal states from localStorage
    const bannerDismissed = localStorage.getItem('customers_exclusionBannerDismissed');
    if (bannerDismissed === 'true') {
      setExclusionBannerDismissed(true);
    }
    const buttonDismissed = localStorage.getItem('customers_showAllExcludedButtonDismissed');
    if (buttonDismissed === 'true') {
      setShowAllExcludedButtonDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (page > 0) {
      loadMoreCustomers();
    }
  }, [page]);

  useEffect(() => {
    const topScroll = topScrollRef.current;
    const tableScroll = tableScrollRef.current;

    if (!topScroll || !tableScroll) return;

    const handleTopScroll = () => {
      if (tableScroll.scrollLeft !== topScroll.scrollLeft) {
        tableScroll.scrollLeft = topScroll.scrollLeft;
      }
    };

    const handleTableScroll = () => {
      if (topScroll.scrollLeft !== tableScroll.scrollLeft) {
        topScroll.scrollLeft = tableScroll.scrollLeft;
      }
    };

    topScroll.addEventListener('scroll', handleTopScroll);
    tableScroll.addEventListener('scroll', handleTableScroll);

    return () => {
      topScroll.removeEventListener('scroll', handleTopScroll);
      tableScroll.removeEventListener('scroll', handleTableScroll);
    };
  }, []);

  useEffect(() => {
    setPage(0);
    setDisplayedCustomers([]);
    loadCustomers();
  }, [searchTerm, statusFilter, countryFilter, balanceFilter, sortBy, sortOrder, dateFrom, dateTo, minOpenInvoices, maxOpenInvoices, minBalance, maxBalance, excludeCreditMemos, dateRangeContext]);

  // Load analytics from ALL filtered customers (not just displayed page)
  const loadAnalytics = useCallback(async () => {
    try {
      // Calculate the filtered count (totalCount minus excluded customers)
      const estimatedFilteredCount = Math.max(0, totalCount - excludedCustomerIds.size);
      setFilteredCount(estimatedFilteredCount);

      const excludedArray = Array.from(excludedCustomerIds);
      const { data, error } = await supabase
        .rpc('get_customer_analytics', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null,
          p_excluded_customer_ids: excludedArray.length > 0 ? excludedArray : null,
          p_balance_filter: balanceFilter,
          p_min_balance: minBalance ? parseFloat(minBalance) : null,
          p_max_balance: maxBalance ? parseFloat(maxBalance) : null,
          p_min_open_invoices: minOpenInvoices ? parseInt(minOpenInvoices) : null,
          p_max_open_invoices: maxOpenInvoices ? parseInt(maxOpenInvoices) : null,
          p_date_context: dateRangeContext
        });

      if (error) {
        console.error('Error loading analytics:', error);
        // Fallback to basic stats on error
        setAnalyticsStats({
          totalCustomers: estimatedFilteredCount,
          activeCustomers: 0,
          totalBalance: 0,
          avgBalance: 0,
          customersWithDebt: 0,
          totalOpenInvoices: 0,
          customersWithOverdue: 0
        });
        return;
      }

      if (data) {
        setAnalyticsStats({
          totalCustomers: data.total_customers || 0,
          activeCustomers: data.active_customers || 0,
          totalBalance: data.total_balance || 0,
          avgBalance: data.avg_balance || 0,
          customersWithDebt: data.customers_with_debt || 0,
          totalOpenInvoices: data.total_open_invoices || 0,
          customersWithOverdue: data.customers_with_overdue || 0
        });
        setFilteredCount(data.total_customers || 0);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  }, [searchTerm, statusFilter, countryFilter, dateFrom, dateTo, excludedCustomerIds, balanceFilter, minBalance, maxBalance, minOpenInvoices, maxOpenInvoices, dateRangeContext, totalCount]);

  const loadExcludedCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('excluded_customers')
        .select('customer_id, notes, excluded_at');

      if (error) throw error;

      const excludedIds = new Set(data?.map(item => item.customer_id) || []);
      const excludedMap = new Map(
        data?.map(item => [item.customer_id, { notes: item.notes || '', excluded_at: item.excluded_at }]) || []
      );
      setExcludedCustomerIds(excludedIds);
      setExcludedCustomersWithReasons(excludedMap);
    } catch (error) {
      console.error('Error loading excluded customers:', error);
    }
  };

  const loadSavedFilters = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_customer_filters')
        .select('*')
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSavedFilters(data || []);
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
  };

  const loadCustomQuickFilters = async () => {
    try {
      const { data, error } = await supabase
        .from('user_quick_filters')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setCustomQuickFilters(data || []);
    } catch (error) {
      console.error('Error loading custom quick filters:', error);
    }
  };

  const handleExcludeCustomer = async (customerId: string, reason?: string) => {
    if (!profile?.id) {
      alert('User not authenticated');
      return;
    }

    try {
      const { error } = await supabase
        .from('excluded_customers')
        .insert({
          user_id: profile.id,
          customer_id: customerId,
          notes: reason || null
        });

      if (error) throw error;

      setExcludedCustomerIds(prev => new Set([...prev, customerId]));
      setExcludedCustomersWithReasons(prev => new Map(prev).set(customerId, {
        notes: reason || '',
        excluded_at: new Date().toISOString()
      }));
      setExcludeReason('');
    } catch (error) {
      console.error('Error excluding customer:', error);
      alert('Failed to exclude customer');
    }
  };

  const handleIncludeCustomer = async (customerId: string) => {
    if (!profile?.id) {
      alert('User not authenticated');
      return;
    }

    try {
      const { error } = await supabase
        .from('excluded_customers')
        .delete()
        .eq('customer_id', customerId)
        .eq('user_id', profile.id);

      if (error) throw error;

      setExcludedCustomerIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(customerId);
        return newSet;
      });
      setExcludedCustomersWithReasons(prev => {
        const newMap = new Map(prev);
        newMap.delete(customerId);
        return newMap;
      });
    } catch (error) {
      console.error('Error including customer:', error);
      alert('Failed to include customer');
    }
  };

  const handleBulkIncludeCustomers = async () => {
    if (!profile?.id) {
      alert('User not authenticated');
      return;
    }

    if (!confirm(`Remove all ${excludedCustomerIds.size} excluded customers?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('excluded_customers')
        .delete()
        .eq('user_id', profile.id);

      if (error) throw error;

      setExcludedCustomerIds(new Set());
      setExcludedCustomersWithReasons(new Map());
    } catch (error) {
      console.error('Error including customers:', error);
      alert('Failed to include customers');
    }
  };

  const handleSaveFilter = async () => {
    if (!newFilterName.trim()) {
      alert('Please enter a filter name');
      return;
    }

    if (!profile?.id) {
      alert('User not authenticated');
      return;
    }

    setSavingFilter(true);
    try {
      const filterConfig = {
        searchTerm,
        statusFilter,
        countryFilter,
        balanceFilter,
        sortBy,
        sortOrder,
        dateFrom,
        dateTo,
        minOpenInvoices,
        maxOpenInvoices,
        minBalance,
        maxBalance,
        dateRangeContext,
        excludedCustomerIds: Array.from(excludedCustomerIds)
      };

      const { error } = await supabase
        .from('saved_customer_filters')
        .upsert({
          user_id: profile.id,
          filter_name: newFilterName.trim(),
          filter_config: filterConfig
        }, {
          onConflict: 'user_id,filter_name'
        });

      if (error) throw error;

      await loadSavedFilters();
      setShowSaveFilterModal(false);
      setNewFilterName('');
      alert('Filter saved successfully!');
    } catch (error) {
      console.error('Error saving filter:', error);
      alert('Failed to save filter');
    } finally {
      setSavingFilter(false);
    }
  };

  const handleLoadFilter = async (filter: any) => {
    const config = filter.filter_config;
    setSearchTerm(config.searchTerm || '');
    setStatusFilter(config.statusFilter || 'all');
    setCountryFilter(config.countryFilter || 'all');
    setBalanceFilter(config.balanceFilter || 'all');
    setSortBy(config.sortBy || 'customer_name');
    setSortOrder(config.sortOrder || 'asc');
    setDateFrom(config.dateFrom || '');
    setDateTo(config.dateTo || '');
    setMinOpenInvoices(config.minOpenInvoices || '');
    setMaxOpenInvoices(config.maxOpenInvoices || '');
    setMinBalance(config.minBalance || '');
    setMaxBalance(config.maxBalance || '');
    setDateRangeContext(config.dateRangeContext || 'invoice_date');

    if (config.excludedCustomerIds && Array.isArray(config.excludedCustomerIds)) {
      setExcludedCustomerIds(new Set(config.excludedCustomerIds));
    }

    try {
      await supabase.rpc('update_filter_last_used', { filter_id: filter.id });
      await loadSavedFilters();
    } catch (error) {
      console.error('Error updating last used:', error);
    }

    setShowLoadFilterModal(false);
  };

  const handleDeleteFilter = async (filterId: string) => {
    if (!confirm('Are you sure you want to delete this saved filter?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('saved_customer_filters')
        .delete()
        .eq('id', filterId);

      if (error) throw error;

      await loadSavedFilters();
    } catch (error) {
      console.error('Error deleting filter:', error);
      alert('Failed to delete filter');
    }
  };

  const loadGrandTotal = async () => {
    try {
      // Get TOTAL customers count from acumatica_customers (NO FILTERS)
      const { count, error } = await supabase
        .from('acumatica_customers')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      setGrandTotalCustomers(count || 0);
    } catch (error) {
      console.error('Error loading grand total:', error);
    }
  };

  const loadCustomers = async (offset = 0, append = false) => {
    if (!append) setLoading(true);
    try {
      const { data: countResult, error: countError } = await supabase
        .rpc('get_customers_with_balance_count', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null,
          p_balance_filter: balanceFilter,
          p_min_balance: minBalance ? parseFloat(minBalance) : null,
          p_max_balance: maxBalance ? parseFloat(maxBalance) : null,
          p_min_open_invoices: minOpenInvoices ? parseInt(minOpenInvoices) : null,
          p_max_open_invoices: maxOpenInvoices ? parseInt(maxOpenInvoices) : null,
          p_min_invoice_amount: null,
          p_max_invoice_amount: null,
          p_date_context: dateRangeContext
        });

      if (countError) throw countError;
      setTotalCount(countResult || 0);

      const { data, error } = await supabase
        .rpc('get_customers_with_balance', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_sort_by: sortBy,
          p_sort_order: sortOrder,
          p_limit: ITEMS_PER_PAGE,
          p_offset: offset,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null,
          p_balance_filter: balanceFilter,
          p_min_balance: minBalance ? parseFloat(minBalance) : null,
          p_max_balance: maxBalance ? parseFloat(maxBalance) : null,
          p_min_open_invoices: minOpenInvoices ? parseInt(minOpenInvoices) : null,
          p_max_open_invoices: maxOpenInvoices ? parseInt(maxOpenInvoices) : null,
          p_min_invoice_amount: null,
          p_max_invoice_amount: null,
          p_exclude_credit_memos: excludeCreditMemos,
          p_date_context: dateRangeContext,
          p_calculate_avg_days: sortBy === 'avg_days_to_collect'
        });

      if (error) throw error;

      const customers = (data || []).map((c: any) => ({
        ...c,
        color_status_counts: { red: c.red_count || 0, yellow: c.yellow_count || 0, green: c.green_count || 0 }
      }));

      if (append) {
        setDisplayedCustomers(prev => [...prev, ...customers]);
      } else {
        setDisplayedCustomers(customers);
      }
      setHasMore((data?.length || 0) === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreCustomers = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadCustomers(displayedCustomers.length, true);
  };

  const lastCustomerRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1);
      }
    });

    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  const getUniqueCountries = () => {
    const countries = displayedCustomers
      .map(c => c.country)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    return countries;
  };

  const filteredCustomers = displayedCustomers.filter(
    customer => !excludedCustomerIds.has(customer.customer_id)
  );

  // Load analytics whenever filters change
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const clearFilters = () => {
    const hasExclusions = excludedCustomerIds.size > 0;

    if (hasExclusions) {
      const keepExclusions = confirm('Clear all filters. Keep excluded customers?');
      if (!keepExclusions) {
        handleBulkIncludeCustomers();
      }
    }

    setSearchTerm('');
    setStatusFilter('all');
    setCountryFilter('all');
    setBalanceFilter('positive');
    setSortBy('customer_name');
    setSortOrder('asc');
    setDateFrom('');
    setDateTo('');
    setMinOpenInvoices('');
    setMaxOpenInvoices('');
    setMinBalance('');
    setMaxBalance('');
    setDateRangeContext('invoice_date');
    setActiveQuickFilter(null);
  };

  const applyQuickFilter = (preset: string) => {
    clearFilters();
    setActiveQuickFilter(preset);
    const today = new Date();

    // Check if this is a custom filter
    const customFilter = customQuickFilters.find(f => f.id === preset);
    if (customFilter) {
      applyCustomFilterConfig(customFilter.filter_config);
      return;
    }

    // Handle built-in presets
    switch (preset) {
      case 'last_90_days_debt':
        const date90 = new Date(today);
        date90.setDate(date90.getDate() - 90);
        setDateFrom(date90.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        setBalanceFilter('positive');
        setMinBalance('0.01');
        setDateRangeContext('invoice_date');
        break;
      case 'last_30_days':
        const date30 = new Date(today);
        date30.setDate(date30.getDate() - 30);
        setDateFrom(date30.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        setDateRangeContext('invoice_date');
        break;
      case 'last_180_days':
        const date180 = new Date(today);
        date180.setDate(date180.getDate() - 180);
        setDateFrom(date180.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        setDateRangeContext('invoice_date');
        break;
      case 'high_balance':
        setBalanceFilter('positive');
        setMinBalance('10000');
        break;
      case 'multiple_overdue':
        setMinOpenInvoices('3');
        setBalanceFilter('positive');
        break;
    }
  };

  const applyCustomFilterConfig = (config: any) => {
    const today = new Date();

    // Apply date range
    if (config.dateRange) {
      if (config.dateRange.type === 'relative' && config.dateRange.relativeDays) {
        const date = new Date(today);
        date.setDate(date.getDate() - config.dateRange.relativeDays);
        setDateFrom(date.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
      } else if (config.dateRange.type === 'absolute') {
        if (config.dateRange.fromDate) setDateFrom(config.dateRange.fromDate);
        if (config.dateRange.toDate) setDateTo(config.dateRange.toDate);
      }
    }

    // Apply balance filters
    if (config.balance) {
      if (config.balance.min !== undefined) {
        setMinBalance(config.balance.min.toString());
        setBalanceFilter('positive');
      }
      if (config.balance.max !== undefined) {
        setMaxBalance(config.balance.max.toString());
      }
    }

    // Apply invoice count filters
    if (config.invoiceCount) {
      if (config.invoiceCount.min !== undefined) {
        setMinOpenInvoices(config.invoiceCount.min.toString());
      }
      if (config.invoiceCount.max !== undefined) {
        setMaxOpenInvoices(config.invoiceCount.max.toString());
      }
    }

    // Note: Some filters like colorStatus, hasCollectorAssigned, hasActiveTickets
    // may need additional state variables or backend support to filter properly
  };

  const handleExportToExcel = async () => {
    try {
      setLoading(true);

      const { data: countResult, error: countError } = await supabase
        .rpc('get_customers_with_balance_count', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null,
          p_balance_filter: balanceFilter,
          p_min_balance: minBalance ? parseFloat(minBalance) : null,
          p_max_balance: maxBalance ? parseFloat(maxBalance) : null,
          p_min_open_invoices: minOpenInvoices ? parseInt(minOpenInvoices) : null,
          p_max_open_invoices: maxOpenInvoices ? parseInt(maxOpenInvoices) : null,
          p_min_invoice_amount: null,
          p_max_invoice_amount: null,
          p_date_context: dateRangeContext
        });

      if (countError) throw countError;
      const total = countResult || 0;

      const { data, error } = await supabase
        .rpc('get_customers_with_balance', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_sort_by: sortBy,
          p_sort_order: sortOrder,
          p_limit: total,
          p_offset: 0,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null,
          p_balance_filter: balanceFilter,
          p_min_balance: minBalance ? parseFloat(minBalance) : null,
          p_max_balance: maxBalance ? parseFloat(maxBalance) : null,
          p_min_open_invoices: minOpenInvoices ? parseInt(minOpenInvoices) : null,
          p_max_open_invoices: maxOpenInvoices ? parseInt(maxOpenInvoices) : null,
          p_min_invoice_amount: null,
          p_max_invoice_amount: null,
          p_exclude_credit_memos: excludeCreditMemos,
          p_calculate_avg_days: false
        });

      if (error) throw error;

      const allCustomers = (data || []).filter(
        customer => !excludedCustomerIds.has(customer.customer_id)
      );

      const exportData = allCustomers.map(customer => ({
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        balance_owed: customer.calculated_balance || 0,
        open_invoices: customer.open_invoice_count || 0,
        max_days_overdue: customer.max_days_overdue || 0,
        red_after_days: customer.red_threshold_days || 30,
        status: customer.customer_status || 'Unknown',
        city: customer.city || '',
        country: customer.country || '',
        customer_class: customer.customer_class || '',
        email: customer.email_address || '',
        last_synced: formatDateUtil(customer.synced_at),
      }));

      exportToExcel({
        filename: `customers_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Customers',
        title: 'Customer List',
        subtitle: `Exported on ${new Date().toLocaleDateString()} - ${exportData.length} customers`,
        columns: [
          { header: 'Customer ID', key: 'customer_id', width: 15 },
          { header: 'Customer Name', key: 'customer_name', width: 30 },
          { header: 'Balance Owed', key: 'balance_owed', width: 15 },
          { header: 'Open Invoices', key: 'open_invoices', width: 15 },
          { header: 'Max Days Overdue', key: 'max_days_overdue', width: 18 },
          { header: 'Red After (Days)', key: 'red_after_days', width: 18 },
          { header: 'Status', key: 'status', width: 15 },
          { header: 'City', key: 'city', width: 20 },
          { header: 'Country', key: 'country', width: 15 },
          { header: 'Class', key: 'customer_class', width: 15 },
          { header: 'Email', key: 'email', width: 30 },
          { header: 'Last Synced', key: 'last_synced', width: 20 },
        ],
        data: exportData,
      });
    } catch (error) {
      console.error('Error exporting customers:', error);
      alert('Failed to export customers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleColumnSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 inline opacity-40" />;
    }
    return sortOrder === 'asc' ?
      <ArrowUp className="w-3 h-3 ml-1 inline" /> :
      <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  const handleUpdateThreshold = async (customerId: string, newThreshold: number) => {
    try {
      const { error } = await supabase
        .from('acumatica_customers')
        .update({ days_from_invoice_threshold: newThreshold })
        .eq('customer_id', customerId);

      if (error) throw error;

      setDisplayedCustomers(prev =>
        prev.map(customer =>
          customer.customer_id === customerId
            ? { ...customer, red_threshold_days: newThreshold }
            : customer
        )
      );

      setEditingThreshold(null);
    } catch (error) {
      console.error('Error updating threshold:', error);
      alert('Failed to update threshold');
    }
  };

  const startEditingThreshold = (customerId: string, currentThreshold: number) => {
    setEditingThreshold(customerId);
    setThresholdValue(currentThreshold || 30);
  };

  const activeFiltersCount = [
    searchTerm !== '',
    statusFilter !== 'all',
    countryFilter !== 'all',
    balanceFilter !== 'positive', // 'positive' is the default, not a filter
    dateFrom !== '',
    dateTo !== '',
    minOpenInvoices !== '',
    maxOpenInvoices !== '',
    minBalance !== '',
    maxBalance !== '',
    excludeCreditMemos === true, // Only count if explicitly enabled
    dateRangeContext !== 'invoice_date' // 'invoice_date' is the default
  ].filter(Boolean).length;


  const formatCurrency = (amount: number) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const renderPieChartSVG = (performance: any) => {
    if (!performance || performance.total === 0) return null;

    const { within15, within45, withinYear, overYear, total } = performance;
    const data = [
      { value: within15, color: '#10b981', label: '≤15 days' },
      { value: within45, color: '#3b82f6', label: '16-45 days' },
      { value: withinYear, color: '#f97316', label: '46-365 days' },
      { value: overYear, color: '#ef4444', label: '>365 days' }
    ];

    let currentAngle = 0;
    const radius = 80;
    const cx = 100;
    const cy = 100;

    return (
      <svg width="200" height="200" viewBox="0 0 200 200">
        {data.map((item, index) => {
          if (item.value === 0) return null;

          const percentage = item.value / total;
          const angle = percentage * 2 * Math.PI;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;

          const x1 = cx + radius * Math.cos(startAngle - Math.PI / 2);
          const y1 = cy + radius * Math.sin(startAngle - Math.PI / 2);
          const x2 = cx + radius * Math.cos(endAngle - Math.PI / 2);
          const y2 = cy + radius * Math.sin(endAngle - Math.PI / 2);

          const largeArc = angle > Math.PI ? 1 : 0;

          const pathData = [
            `M ${cx} ${cy}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');

          currentAngle = endAngle;

          return (
            <path
              key={index}
              d={pathData}
              fill={item.color}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}
      </svg>
    );
  };

  if (showFetchPage) {
    return <AcumaticaInvoiceTest onBack={() => setShowFetchPage(false)} />;
  }

  // Check permission
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You do not have permission to view Acumatica Customers.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (selectedCustomer) {
    return <CustomerDetailView customerId={selectedCustomer} onBack={() => setSelectedCustomer(null)} />;
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="w-full mx-auto">
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-700 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Main Menu
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Acumatica Customers</h1>
              <p className="text-gray-600">
                Showing {displayedCustomers.length} of {grandTotalCustomers.toLocaleString()} customer{grandTotalCustomers !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  showAnalytics
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
              </button>

              {canPerformFetch && (
                <button
                  onClick={() => setShowFetchPage(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Database className="w-5 h-5" />
                  Fetch Customers
                </button>
              )}

              <button
                onClick={() => setShowSaveFilterModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
              >
                <Save className="w-5 h-5" />
                Save Filter
              </button>

              <button
                onClick={() => setShowLoadFilterModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
                Load Filter
                {savedFilters.length > 0 && (
                  <span className="bg-white text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">
                    {savedFilters.length}
                  </span>
                )}
              </button>

              <button
                onClick={handleExportToExcel}
                disabled={totalCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                title={`Export ${filteredCount} customers to Excel`}
              >
                <Download className="w-5 h-5" />
                Export ({filteredCount})
              </button>

              <button
                onClick={() => {
                  setPage(0);
                  setDisplayedCustomers([]);
                  setHasMore(true);
                  loadCustomers();
                }}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-900 rounded-lg font-medium transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Exclusion Indicator */}
        {excludedCustomerIds.size > 0 && !exclusionBannerDismissed && (
          <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <EyeOff className="w-5 h-5 text-yellow-500" />
              <div className="flex-1">
                <p className="text-yellow-200 font-medium">
                  {excludedCustomerIds.size} customer{excludedCustomerIds.size !== 1 ? 's' : ''} excluded from view and analytics
                </p>
                <p className="text-yellow-300/70 text-sm mt-1">
                  These customers won't appear in the table or affect analytics totals. Save your current filters to preserve these exclusions.
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Include all ${excludedCustomerIds.size} excluded customers?`)) {
                    handleBulkIncludeCustomers();
                  }
                }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-gray-900 rounded-lg font-medium transition-colors whitespace-nowrap"
              >
                Include All
              </button>
              <button
                onClick={() => {
                  setExclusionBannerDismissed(true);
                  setShowAllExcludedButtonDismissed(true);
                  localStorage.setItem('customers_exclusionBannerDismissed', 'true');
                  localStorage.setItem('customers_showAllExcludedButtonDismissed', 'true');
                }}
                className="p-2 hover:bg-yellow-700/30 rounded-lg transition-colors group"
                title="Dismiss"
              >
                <X className="w-5 h-5 text-yellow-400 group-hover:text-yellow-300" />
              </button>
            </div>
          </div>
        )}

        {/* Analytics Stats Cards */}
        {showAnalytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Total Customers</span>
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{analyticsStats.totalCustomers.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">{analyticsStats.activeCustomers} active</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Total Balance Owed</span>
                <DollarSign className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 break-words">
                {formatCurrency(analyticsStats.totalBalance)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{analyticsStats.customersWithDebt} customers</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Avg Balance</span>
                <TrendingUp className="w-5 h-5 text-cyan-400" />
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 break-words">
                {formatCurrency(analyticsStats.avgBalance)}
              </p>
              <p className="text-sm text-gray-500 mt-1">per customer with debt</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Open Invoices</span>
                <FileText className="w-5 h-5 text-orange-400" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{analyticsStats.totalOpenInvoices.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">{analyticsStats.customersWithOverdue} overdue</p>
            </div>
          </div>
        )}

        <div className="mb-6 space-y-4">
          {/* Quick Preset Filters */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <h3 className="text-sm font-semibold text-gray-900">Quick Filters</h3>
              </div>
              <button
                onClick={() => setShowQuickFilterManager(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-medium transition-all"
                title="Manage Quick Filters"
              >
                <Settings className="w-4 h-4" />
                Manage
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* None Button - Always visible */}
              <button
                onClick={() => {
                  clearFilters();
                  setActiveQuickFilter(null);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeQuickFilter === null
                    ? 'bg-gray-700 hover:bg-gray-800 text-white ring-2 ring-blue-500 ring-offset-2 ring-offset-white shadow-lg scale-105'
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                }`}
              >
                <X className="w-4 h-4" />
                None
              </button>

              {customQuickFilters.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">
                  No quick filters yet. Click "Manage" to create your first custom filter!
                </div>
              ) : (
                customQuickFilters.map((filter) => {
                  const getColorClasses = (color: string) => {
                    const colorMap: Record<string, string> = {
                      blue: 'bg-blue-600 hover:bg-blue-700 text-white',
                      red: 'bg-red-600 hover:bg-red-700 text-white',
                      green: 'bg-green-600 hover:bg-green-700 text-white',
                      purple: 'bg-purple-600 hover:bg-purple-700 text-white',
                      orange: 'bg-orange-600 hover:bg-orange-700 text-white',
                      yellow: 'bg-yellow-500 hover:bg-yellow-600 text-gray-900',
                      pink: 'bg-pink-600 hover:bg-pink-700 text-white',
                      cyan: 'bg-cyan-600 hover:bg-cyan-700 text-white',
                      gray: 'bg-gray-600 hover:bg-gray-700 text-white'
                    };
                    return colorMap[color] || colorMap.blue;
                  };

                  const getIconComponent = (iconName: string) => {
                    const iconMap: Record<string, any> = {
                      'filter': Filter,
                      'zap': Zap,
                      'calendar': Calendar,
                      'clock': Clock,
                      'dollar-sign': DollarSign,
                      'file-text': FileText,
                      'alert-triangle': AlertTriangle,
                      'target': Target,
                      'users': Users
                    };
                    const IconComponent = iconMap[iconName] || Filter;
                    return <IconComponent className="w-4 h-4" />;
                  };

                  return (
                    <button
                      key={filter.id}
                      onClick={() => applyQuickFilter(filter.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        getColorClasses(filter.color)
                      } ${
                        activeQuickFilter === filter.id ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white shadow-lg scale-105' : ''
                      }`}
                    >
                      {getIconComponent(filter.icon)}
                      {filter.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-600 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by customer ID, name, email, class, city, or country..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <InfoTooltip
                  title="Global Customer Search"
                  content="Search across multiple customer fields simultaneously: Customer ID (exact or partial match), Customer Name, Email Address, Customer Class, City, and Country. The search is case-insensitive and works with partial matches. Combines with all other active filters."
                />
              </div>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              <Filter className="w-5 h-5" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="bg-white text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Filter & Sort Options</h3>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear All Filters
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    Status
                    <InfoTooltip
                      title="Customer Status Filter"
                      content="Filter customers by their current status in Acumatica. Active = doing business, Inactive = not currently engaged, Hold = temporarily suspended. This is the status synced from Acumatica."
                    />
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Hold">Hold</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    Country
                    <InfoTooltip
                      title="Country Filter"
                      content="Filter customers by their billing or shipping country. Only customers with a country specified in Acumatica will appear in this dropdown. Useful for regional analysis or targeted collection efforts."
                    />
                  </label>
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Countries</option>
                    {getUniqueCountries().map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    Balance
                    <InfoTooltip
                      title="Balance Filter"
                      content="Filter by customer balance type. Positive = owes money (accounts receivable), Negative = has credit on account, Zero = no outstanding balance. The balance is calculated from all open invoices minus payments and credit memos applied."
                    />
                  </label>
                  <select
                    value={balanceFilter}
                    onChange={(e) => setBalanceFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Balances</option>
                    <option value="positive">Positive Balance</option>
                    <option value="negative">Negative Balance</option>
                    <option value="zero">Zero Balance</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    Sort By
                    <InfoTooltip
                      title="Sort Options"
                      content="Order the customer list by different criteria. Click the arrow button to toggle between ascending (↑) and descending (↓) order. Sorting applies to all loaded customers and affects pagination."
                    />
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="synced_at">Sync Date</option>
                      <option value="customer_name">Name</option>
                      <option value="customer_id">Customer ID</option>
                      <option value="balance">Balance</option>
                      <option value="city">City</option>
                      <option value="country">Country</option>
                    </select>
                    <button
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
                      title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <label className="inline-flex items-center gap-3 cursor-pointer p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={excludeCreditMemos}
                    onChange={(e) => setExcludeCreditMemos(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-gray-900">Exclude Credit Memos</span>
                      <InfoTooltip
                        title="Credit Memo Exclusion"
                        content="When enabled, customer balances are calculated WITHOUT subtracting credit memos. This shows the gross amount owed before any credits are applied. Useful for seeing full invoice obligations before adjustments. When disabled (default), balances show the net amount after credit memos are deducted."
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Show only invoice balances without credit memo deductions
                    </p>
                  </div>
                </label>
              </div>

              {/* Advanced Filters */}
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-700 transition-colors mb-4"
                >
                  <Sliders className="w-4 h-4" />
                  Advanced Filters
                  {showAdvancedFilters ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                </button>

                {showAdvancedFilters && (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-white/50 rounded-lg border border-gray-200">
                    <div className="md:col-span-2 lg:col-span-3">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-sm font-medium text-gray-700">Date Range Filter</h4>
                        <InfoTooltip
                          title="Date Range Filter Types"
                          content="This filter has THREE modes: (1) INVOICE DATE - finds customers with invoices created between the dates (absolute date range). (2) BALANCE DATE - shows customers who owed money as of the end date (point-in-time snapshot). (3) CUSTOMER ADDED - shows new customers first synced in the date range. Select your mode first, then set the dates."
                        />
                      </div>

                      <div className="mb-4 space-y-2 bg-gray-50/50 p-3 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-2 font-semibold">What do you want to see in this date range?</p>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio"
                            name="dateRangeContext"
                            value="invoice_date"
                            checked={dateRangeContext === 'invoice_date'}
                            onChange={(e) => setDateRangeContext(e.target.value as any)}
                            className="mt-1"
                          />
                          <div>
                            <span className="text-sm text-gray-900 group-hover:text-blue-400 transition-colors">Invoices created in this date range</span>
                            <p className="text-xs text-gray-500">Show customers who have invoices with creation dates within this period</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio"
                            name="dateRangeContext"
                            value="balance_date"
                            checked={dateRangeContext === 'balance_date'}
                            onChange={(e) => setDateRangeContext(e.target.value as any)}
                            className="mt-1"
                          />
                          <div>
                            <span className="text-sm text-gray-900 group-hover:text-blue-400 transition-colors">Customers owing money as of end date</span>
                            <p className="text-xs text-gray-500">Show customers with outstanding balance on the end date specified</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio"
                            name="dateRangeContext"
                            value="customer_added"
                            checked={dateRangeContext === 'customer_added'}
                            onChange={(e) => setDateRangeContext(e.target.value as any)}
                            className="mt-1"
                          />
                          <div>
                            <span className="text-sm text-gray-900 group-hover:text-blue-400 transition-colors">New customers added in this date range</span>
                            <p className="text-xs text-gray-500">Show customers who were first synced within this period</p>
                          </div>
                        </label>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="block text-xs text-gray-600">From Date</label>
                            <InfoTooltip
                              title="From Date (Absolute)"
                              content="The start date for the filter range. This is an ABSOLUTE date - it uses the exact calendar date you select. Leave empty to search from the beginning of time. Used with the filter mode selected above."
                            />
                          </div>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="block text-xs text-gray-600">To Date</label>
                            <InfoTooltip
                              title="To Date (Absolute)"
                              content="The end date for the filter range. This is an ABSOLUTE date - it uses the exact calendar date you select. Leave empty to search through today. The time is set to 11:59:59 PM on this date to include the entire day."
                            />
                          </div>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-3">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-sm font-medium text-gray-700">Open Invoices Count</h4>
                        <InfoTooltip
                          title="Open Invoice Count Filter"
                          content="Filter customers by how many unpaid/open invoices they have. Min = at least this many invoices, Max = no more than this many. Example: Min=5, Max=20 shows customers with 5 to 20 open invoices. Useful for targeting customers with many small invoices or identifying large account issues. Leave blank for no limits."
                        />
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Minimum</label>
                          <input
                            type="number"
                            value={minOpenInvoices}
                            onChange={(e) => setMinOpenInvoices(e.target.value)}
                            placeholder="e.g., 1"
                            min="0"
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Maximum</label>
                          <input
                            type="number"
                            value={maxOpenInvoices}
                            onChange={(e) => setMaxOpenInvoices(e.target.value)}
                            placeholder="e.g., 10"
                            min="0"
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-3">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="text-sm font-medium text-gray-700">Balance Range</h4>
                        <InfoTooltip
                          title="Balance Range Filter"
                          content="Filter customers by their total outstanding balance amount in dollars. Min = customers owing at least this much, Max = customers owing no more than this much. Example: Min=1000, Max=5000 shows customers owing between $1,000 and $5,000. Works with the Balance filter above and credit memo settings. Leave blank for no limits."
                        />
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Minimum ($)</label>
                          <input
                            type="number"
                            value={minBalance}
                            onChange={(e) => setMinBalance(e.target.value)}
                            placeholder="e.g., 100"
                            step="0.01"
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Maximum ($)</label>
                          <input
                            type="number"
                            value={maxBalance}
                            onChange={(e) => setMaxBalance(e.target.value)}
                            placeholder="e.g., 10000"
                            step="0.01"
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Showing <span className="text-gray-900 font-semibold">{filteredCustomers.length}</span> of{' '}
                  <span className="text-gray-900 font-semibold">{displayedCustomers.length}</span> loaded
                  {totalCount > displayedCustomers.length && (
                    <span> ({totalCount} total in database)</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading customers...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg mb-2">
              {searchTerm ? 'No customers found matching your search' : 'No customers synced yet'}
            </p>
            {!searchTerm && (
              <p className="text-gray-500">
                Use the Acumatica Invoice Test page to fetch customers from Acumatica
              </p>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
            <div
              ref={topScrollRef}
              className="overflow-x-auto w-full border-b border-gray-200"
              style={{ overflowY: 'hidden', height: '20px' }}
            >
              <div style={{ width: '1600px', height: '20px' }}></div>
            </div>
            <div ref={tableScrollRef} className="overflow-x-auto overflow-y-auto w-full max-h-[calc(100vh-400px)]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              <table className="w-full divide-y divide-gray-200" style={{ minWidth: '1600px' }}>
                <thead className="bg-white">
                  <tr>
                    <th
                      onClick={() => handleColumnSort('customer_id')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Customer ID {getSortIcon('customer_id')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('customer_name')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Customer Name {getSortIcon('customer_name')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('balance')}
                      className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-end">
                        Balance Owed {getSortIcon('balance')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('open_invoices')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-center">
                        Open Invoices {getSortIcon('open_invoices')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Invoice Colors
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider w-64">
                      Payment Performance
                    </th>
                    <th
                      onClick={() => handleColumnSort('red_threshold_days')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-center">
                        Red After (Days) {getSortIcon('red_threshold_days')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('customer_status')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Status {getSortIcon('customer_status')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('city')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Location {getSortIcon('city')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('customer_class')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Class {getSortIcon('customer_class')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('synced_at')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Last Synced {getSortIcon('synced_at')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('email_address')}
                      className="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider w-24 cursor-pointer hover:text-gray-700 transition-colors"
                    >
                      <div className="flex items-center">
                        Email {getSortIcon('email_address')}
                      </div>
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider w-24">
                      <div className="flex items-center justify-center gap-1">
                        <EyeOff className="w-3 h-3" />
                        Exclude
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCustomers.map((customer, index) => {
                    const hasOverdueOver90Days = customer.max_days_overdue > 90 && customer.calculated_balance > 0;
                    return (
                    <tr
                      key={customer.id}
                      ref={index === filteredCustomers.length - 1 ? lastCustomerRef : undefined}
                      className={`transition-colors ${
                        hasOverdueOver90Days
                          ? 'bg-red-900/40 hover:bg-red-900/60 border-l-4 border-l-red-500'
                          : 'hover:bg-gray-100/50'
                      }`}
                    >
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.customer_id || 'N/A'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.customer_name || customer.account_name || 'Unnamed Customer'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-right cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        <span className={`text-sm font-bold ${customer.calculated_balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                          {formatCurrency(customer.calculated_balance || 0)}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-center cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          customer.open_invoice_count > 0
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-green-500/20 text-green-400 border border-green-500/30'
                        }`}>
                          {customer.open_invoice_count || 0}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-center cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        <div className="flex items-center justify-center gap-2">
                          {customer.color_status_counts?.red > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-500 text-gray-900 border border-red-600">
                              {customer.color_status_counts.red}
                            </span>
                          )}
                          {customer.color_status_counts?.yellow > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-yellow-400 text-gray-900 border border-yellow-500">
                              {customer.color_status_counts.yellow}
                            </span>
                          )}
                          {customer.color_status_counts?.green > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-500 text-gray-900 border border-green-600">
                              {customer.color_status_counts.green}
                            </span>
                          )}
                          {(!customer.color_status_counts ||
                            (customer.color_status_counts.red === 0 &&
                             customer.color_status_counts.yellow === 0 &&
                             customer.color_status_counts.green === 0)) && (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-6 py-4 relative cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.payment_performance?.total > 0 ? (
                          <div
                            className="relative inline-block"
                            onMouseEnter={() => setHoveredCustomer(customer.customer_id)}
                            onMouseLeave={() => setHoveredCustomer(null)}
                          >
                            <PieChart className="w-6 h-6 text-blue-400 cursor-pointer hover:text-blue-300 transition-colors" />

                            {hoveredCustomer === customer.customer_id && (
                              <div className="absolute z-50 left-10 top-0 bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-2xl" style={{ width: '280px' }}>
                                <div className="mb-3">
                                  <h4 className="text-sm font-semibold text-gray-900 mb-1">Payment Performance</h4>
                                  <p className="text-xs text-gray-600">{customer.payment_performance.total} invoices tracked</p>
                                </div>

                                <div className="flex justify-center mb-3">
                                  {renderPieChartSVG(customer.payment_performance)}
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                      <span className="text-gray-700">≤15 days</span>
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {customer.payment_performance.within15} ({((customer.payment_performance.within15 / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                      <span className="text-gray-700">16-45 days</span>
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {customer.payment_performance.within45} ({((customer.payment_performance.within45 / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                      <span className="text-gray-700">46-365 days</span>
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {customer.payment_performance.withinYear} ({((customer.payment_performance.withinYear / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                      <span className="text-gray-700">&gt;365 days</span>
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {customer.payment_performance.overYear} ({((customer.payment_performance.overYear / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">No data</span>
                        )}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editingThreshold === customer.customer_id ? (
                          <div className="flex items-center gap-2 justify-center">
                            <input
                              type="number"
                              min="0"
                              max="999"
                              value={thresholdValue}
                              onChange={(e) => setThresholdValue(parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 bg-white border border-blue-500 rounded text-gray-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateThreshold(customer.customer_id, thresholdValue);
                                } else if (e.key === 'Escape') {
                                  setEditingThreshold(null);
                                }
                              }}
                            />
                            <button
                              onClick={() => handleUpdateThreshold(customer.customer_id, thresholdValue)}
                              className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingThreshold(null)}
                              className="p-1 bg-gray-200 hover:bg-gray-100 text-gray-900 rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-center group">
                            <span className="text-sm font-medium text-gray-900">
                              {customer.red_threshold_days || 30}
                            </span>
                            <button
                              onClick={() => startEditingThreshold(customer.customer_id, customer.red_threshold_days || 30)}
                              className="p-1 opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 transition-all"
                              title="Edit threshold"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          customer.customer_status === 'Active'
                            ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                            : 'bg-gray-200 text-gray-600 border border-gray-300'
                        }`}>
                          {customer.customer_status || 'Unknown'}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.city && customer.country
                          ? `${customer.city}, ${customer.country}`
                          : customer.city || customer.country || 'N/A'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.customer_class || 'N/A'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {formatDateUtil(customer.synced_at)}
                      </td>
                      <td
                        className="px-3 py-4 text-sm text-gray-700 w-24 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        <div className="truncate" title={customer.email_address || 'N/A'}>
                          {customer.email_address || 'N/A'}
                        </div>
                      </td>
                      <td
                        className="px-3 py-4 text-center w-32"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setCustomerToAssign({
                                id: customer.customer_id,
                                name: customer.customer_name || customer.account_name || 'Unnamed Customer'
                              });
                              setShowAssignCustomerModal(true);
                            }}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            title="Assign customer to collector"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExcludeCustomer(customer.customer_id)}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                            title="Exclude this customer from analytics and saved filters"
                          >
                            <EyeOff className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            {loadingMore && (
              <div className="text-center py-8 border-t border-gray-200">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600 text-sm">Loading more customers...</p>
              </div>
            )}
            {!hasMore && displayedCustomers.length > 0 && (
              <div className="text-center py-8">
                <p className="text-gray-600 text-sm">All customers loaded ({displayedCustomers.length} total)</p>
              </div>
            )}
          </div>
        )}

        {selectedCustomer && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            onClick={() => setSelectedCustomer(null)}
          >
            <div
              className="bg-gray-50 border border-gray-200 rounded-lg p-8 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedCustomer.customer_name || 'Customer Details'}
                  </h2>
                  <p className="text-gray-600">ID: {selectedCustomer.customer_id}</p>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-gray-600 hover:text-gray-700 transition-colors"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {Object.entries(selectedCustomer).map(([key, value]) => {
                  if (key === 'id' || key === 'raw_data') return null;

                  const label = key
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                  let displayValue = value;
                  if (typeof value === 'boolean') {
                    displayValue = value ? 'Yes' : 'No';
                  } else if (value === null || value === undefined || value === '') {
                    displayValue = 'N/A';
                  } else if (key.includes('date') || key.includes('time')) {
                    displayValue = formatDateUtil(value as string);
                  } else if (typeof value === 'number' && (key.includes('balance') || key.includes('limit') || key.includes('amount'))) {
                    displayValue = formatCurrency(value);
                  }

                  return (
                    <div key={key}>
                      <span className="text-gray-600 text-sm">{label}:</span>
                      <p className="text-gray-900 font-medium">{String(displayValue)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {showSaveFilterModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            onClick={() => setShowSaveFilterModal(false)}
          >
            <div
              className="bg-gray-50 border border-gray-200 rounded-lg p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Save Current Filter</h2>

              {excludedCustomerIds.size > 0 && (
                <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-200">
                    <EyeOff className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {excludedCustomerIds.size} customer{excludedCustomerIds.size !== 1 ? 's' : ''} will be saved as excluded
                    </span>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter Name
                </label>
                <input
                  type="text"
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="e.g., High Balance Customers"
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveFilter();
                    if (e.key === 'Escape') setShowSaveFilterModal(false);
                  }}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveFilter}
                  disabled={savingFilter || !newFilterName.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-900 rounded-lg font-medium transition-colors"
                >
                  {savingFilter ? 'Saving...' : 'Save Filter'}
                </button>
                <button
                  onClick={() => setShowSaveFilterModal(false)}
                  disabled={savingFilter}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:cursor-not-allowed text-gray-900 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showLoadFilterModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            onClick={() => setShowLoadFilterModal(false)}
          >
            <div
              className="bg-gray-50 border border-gray-200 rounded-lg p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Saved Filters</h2>
                <button
                  onClick={() => setShowLoadFilterModal(false)}
                  className="text-gray-600 hover:text-gray-700 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {savedFilters.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">No saved filters yet</p>
                  <button
                    onClick={() => {
                      setShowLoadFilterModal(false);
                      setShowSaveFilterModal(true);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Save Your First Filter
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedFilters.map((filter) => {
                    const config = filter.filter_config;
                    const activeSettings = [];

                    if (config.searchTerm) activeSettings.push(`Search: "${config.searchTerm}"`);
                    if (config.statusFilter && config.statusFilter !== 'all') activeSettings.push(`Status: ${config.statusFilter}`);
                    if (config.countryFilter && config.countryFilter !== 'all') activeSettings.push(`Country: ${config.countryFilter}`);
                    if (config.balanceFilter && config.balanceFilter !== 'all') activeSettings.push(`Balance: ${config.balanceFilter}`);
                    if (config.dateFrom || config.dateTo) {
                      const dateContext = config.dateRangeContext === 'invoice_date' ? 'Invoice dates' :
                                         config.dateRangeContext === 'balance_date' ? 'Balance date' : 'Customer added';
                      activeSettings.push(`${dateContext}: ${config.dateFrom || '...'} to ${config.dateTo || '...'}`);
                    }
                    if (config.minBalance || config.maxBalance) {
                      activeSettings.push(`Balance: $${config.minBalance || '0'} - $${config.maxBalance || '∞'}`);
                    }
                    if (config.minOpenInvoices || config.maxOpenInvoices) {
                      activeSettings.push(`Open invoices: ${config.minOpenInvoices || '0'} - ${config.maxOpenInvoices || '∞'}`);
                    }
                    const excludedCount = config.excludedCustomerIds?.length || 0;

                    return (
                    <div
                      key={filter.id}
                      className="p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {filter.filter_name}
                            </h3>
                            {excludedCount > 0 && (
                              <span className="bg-red-500 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full">
                                {excludedCount} excluded
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>Created {formatDateUtil(filter.created_at)}</span>
                            {filter.last_used_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last used {formatDateUtil(filter.last_used_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleLoadFilter(filter)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteFilter(filter.id)}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            title="Delete filter"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {activeSettings.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {activeSettings.map((setting, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-gray-700"
                            >
                              {setting}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {excludedCustomerIds.size > 0 && (
          <div className="fixed bottom-6 right-6 bg-gray-50 border border-gray-200 rounded-lg shadow-2xl max-w-md z-40">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-900 font-semibold flex items-center gap-2">
                  <EyeOff className="w-5 h-5 text-red-400" />
                  Excluded Customers
                </h3>
                <div className="flex items-center gap-2">
                  <span className="bg-red-500 text-gray-900 text-xs font-bold px-2 py-1 rounded-full">
                    {excludedCustomerIds.size}
                  </span>
                  <button
                    onClick={() => setShowExcludedCustomersPanel(!showExcludedCustomersPanel)}
                    className="text-gray-600 hover:text-gray-700 transition-colors"
                  >
                    {showExcludedCustomersPanel ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {excludedCustomerIds.size} customer{excludedCustomerIds.size !== 1 ? 's' : ''} hidden from list
              </p>
            </div>

            {showExcludedCustomersPanel && (
              <div className="max-h-96 overflow-y-auto">
                <div className="p-4 space-y-2">
                  {Array.from(excludedCustomerIds).map((customerId) => {
                    const customer = displayedCustomers.find(c => c.customer_id === customerId);
                    const exclusionInfo = excludedCustomersWithReasons.get(customerId);
                    return (
                      <div key={customerId} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {customer?.customer_name || customerId}
                            </p>
                            <p className="text-xs text-gray-500">{customerId}</p>
                            {exclusionInfo?.notes && (
                              <div className="mt-1 flex items-start gap-1">
                                <MessageSquare className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-gray-600 italic">{exclusionInfo.notes}</p>
                              </div>
                            )}
                            <p className="text-xs text-gray-600 mt-1">
                              Excluded {formatDateUtil(exclusionInfo?.excluded_at || '')}
                            </p>
                          </div>
                          <button
                            onClick={() => handleIncludeCustomer(customerId)}
                            className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded transition-colors flex-shrink-0"
                            title="Show this customer again"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!showAllExcludedButtonDismissed && (
              <div className="p-4 border-t border-gray-200 space-y-2">
                <div className="relative">
                  <button
                    onClick={handleBulkIncludeCustomers}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Show All {excludedCustomerIds.size} Excluded
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExclusionBannerDismissed(true);
                      setShowAllExcludedButtonDismissed(true);
                      localStorage.setItem('customers_exclusionBannerDismissed', 'true');
                      localStorage.setItem('customers_showAllExcludedButtonDismissed', 'true');
                    }}
                    className="absolute -top-1 -right-1 p-1 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-full transition-colors group"
                    title="Dismiss"
                  >
                    <X className="w-3 h-3 text-gray-600 group-hover:text-gray-700" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assign Customer Modal */}
      {showAssignCustomerModal && customerToAssign && (
        <AssignCustomerModal
          customerId={customerToAssign.id}
          customerName={customerToAssign.name}
          onClose={() => {
            setShowAssignCustomerModal(false);
            setCustomerToAssign(null);
          }}
          onAssignmentComplete={() => {
            loadCustomers();
          }}
        />
      )}

      {/* Quick Filter Manager */}
      {showQuickFilterManager && (
        <QuickFilterManager
          onClose={() => setShowQuickFilterManager(false)}
          onFiltersUpdated={() => {
            loadCustomQuickFilters();
            setShowQuickFilterManager(false);
          }}
        />
      )}
    </div>
  );
}
