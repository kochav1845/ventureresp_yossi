import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Calendar, DollarSign, Database, Filter, X, PieChart, Edit2, Check, ArrowUp, ArrowDown, ArrowUpDown, Sliders, Lock, Users, FileText, TrendingUp, AlertTriangle, Save, FolderOpen, Eye, EyeOff, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import AcumaticaInvoiceTest from './AcumaticaInvoiceTest';
import CustomerDetailView from './CustomerDetailView';
import { formatDate as formatDateUtil } from '../lib/dateUtils';

interface AcumaticaCustomersProps {
  onBack?: () => void;
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
  const [savedFilters, setSavedFilters] = useState<any[]>([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [showLoadFilterModal, setShowLoadFilterModal] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [savingFilter, setSavingFilter] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 100;

  useEffect(() => {
    loadExcludedCustomers();
    loadSavedFilters();
    loadCustomers();
    loadAnalytics();
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
  }, [searchTerm, statusFilter, countryFilter, balanceFilter, sortBy, sortOrder, dateFrom, dateTo, minOpenInvoices, maxOpenInvoices, minBalance, maxBalance]);

  useEffect(() => {
    loadAnalytics();
  }, [searchTerm, statusFilter, countryFilter, dateFrom, dateTo]);

  const loadAnalytics = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_customer_analytics', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null
        });

      if (error) throw error;

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
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const loadExcludedCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('excluded_customers')
        .select('customer_id');

      if (error) throw error;

      const excludedIds = new Set(data?.map(item => item.customer_id) || []);
      setExcludedCustomerIds(excludedIds);
    } catch (error) {
      console.error('Error loading excluded customers:', error);
    }
  };

  const loadSavedFilters = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_customer_filters')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSavedFilters(data || []);
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
  };

  const handleExcludeCustomer = async (customerId: string) => {
    if (!profile?.id) {
      alert('User not authenticated');
      return;
    }

    try {
      const { error } = await supabase
        .from('excluded_customers')
        .insert({
          user_id: profile.id,
          customer_id: customerId
        });

      if (error) throw error;

      setExcludedCustomerIds(prev => new Set([...prev, customerId]));
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
    } catch (error) {
      console.error('Error including customer:', error);
      alert('Failed to include customer');
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
        maxBalance
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

  const handleLoadFilter = (filter: any) => {
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

  const loadCustomers = async (offset = 0, append = false) => {
    if (!append) setLoading(true);
    try {
      const { data: countResult, error: countError } = await supabase
        .rpc('get_customers_with_balance_count', {
          p_search: searchTerm || null,
          p_status_filter: statusFilter,
          p_country_filter: countryFilter,
          p_date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null
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
          p_date_to: dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null
        });

      if (error) throw error;

      let customers = (data || []).map((c: any) => ({
        ...c,
        color_status_counts: { red: c.red_count || 0, yellow: c.yellow_count || 0, green: c.green_count || 0 }
      }));

      // Apply client-side filters for advanced options
      if (balanceFilter === 'positive') {
        customers = customers.filter((c: any) => c.calculated_balance > 0);
      } else if (balanceFilter === 'negative') {
        customers = customers.filter((c: any) => c.calculated_balance < 0);
      } else if (balanceFilter === 'zero') {
        customers = customers.filter((c: any) => c.calculated_balance === 0);
      }

      if (minBalance) {
        customers = customers.filter((c: any) => c.calculated_balance >= parseFloat(minBalance));
      }
      if (maxBalance) {
        customers = customers.filter((c: any) => c.calculated_balance <= parseFloat(maxBalance));
      }
      if (minOpenInvoices) {
        customers = customers.filter((c: any) => c.open_invoice_count >= parseInt(minOpenInvoices));
      }
      if (maxOpenInvoices) {
        customers = customers.filter((c: any) => c.open_invoice_count <= parseInt(maxOpenInvoices));
      }

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

  const clearFilters = () => {
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
        .update({ days_past_due_threshold: newThreshold })
        .eq('customer_id', customerId);

      if (error) throw error;

      setDisplayedCustomers(prev =>
        prev.map(customer =>
          customer.customer_id === customerId
            ? { ...customer, days_past_due_threshold: newThreshold }
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
    balanceFilter !== 'all',
    dateFrom !== '',
    dateTo !== '',
    minOpenInvoices !== '',
    maxOpenInvoices !== '',
    minBalance !== '',
    maxBalance !== ''
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
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="w-full mx-auto">
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Main Menu
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Acumatica Customers</h1>
              <p className="text-slate-400">
                Showing {displayedCustomers.length} of {totalCount} customer{totalCount !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  showAnalytics
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
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
                onClick={() => {
                  setPage(0);
                  setDisplayedCustomers([]);
                  setHasMore(true);
                  loadCustomers();
                  loadAnalytics();
                }}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Analytics Stats Cards */}
        {showAnalytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 font-medium text-sm">Total Customers</span>
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-3xl font-bold text-white">{analyticsStats.totalCustomers.toLocaleString()}</p>
              <p className="text-sm text-slate-500 mt-1">{analyticsStats.activeCustomers} active</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 font-medium text-sm">Total Balance Owed</span>
                <DollarSign className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(analyticsStats.totalBalance)}
              </p>
              <p className="text-sm text-slate-500 mt-1">{analyticsStats.customersWithDebt} customers</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 font-medium text-sm">Avg Balance</span>
                <TrendingUp className="w-5 h-5 text-cyan-400" />
              </div>
              <p className="text-3xl font-bold text-white">
                {formatCurrency(analyticsStats.avgBalance)}
              </p>
              <p className="text-sm text-slate-500 mt-1">per customer with debt</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 font-medium text-sm">Open Invoices</span>
                <FileText className="w-5 h-5 text-orange-400" />
              </div>
              <p className="text-3xl font-bold text-white">{analyticsStats.totalOpenInvoices.toLocaleString()}</p>
              <p className="text-sm text-slate-500 mt-1">{analyticsStats.customersWithOverdue} overdue</p>
            </div>
          </div>
        )}

        <div className="mb-6 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by customer ID, name, email, class, city, or country..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
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
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Filter & Sort Options</h3>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear All Filters
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Hold">Hold</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Country
                  </label>
                  <select
                    value={countryFilter}
                    onChange={(e) => setCountryFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Countries</option>
                    {getUniqueCountries().map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Balance
                  </label>
                  <select
                    value={balanceFilter}
                    onChange={(e) => setBalanceFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Balances</option>
                    <option value="positive">Positive Balance</option>
                    <option value="negative">Negative Balance</option>
                    <option value="zero">Zero Balance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Sort By
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
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
                      className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white hover:bg-slate-800 transition-colors"
                      title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Filters */}
              <div className="pt-4 border-t border-slate-700">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors mb-4"
                >
                  <Sliders className="w-4 h-4" />
                  Advanced Filters
                  {showAdvancedFilters ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                </button>

                {showAdvancedFilters && (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                    <div className="md:col-span-2 lg:col-span-3">
                      <h4 className="text-sm font-medium text-slate-300 mb-3">Invoice Date Range</h4>
                      <p className="text-xs text-slate-500 mb-2">Show customers with invoices created within this date range</p>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">From Date</label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">To Date</label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-3">
                      <h4 className="text-sm font-medium text-slate-300 mb-3">Open Invoices Count</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Minimum</label>
                          <input
                            type="number"
                            value={minOpenInvoices}
                            onChange={(e) => setMinOpenInvoices(e.target.value)}
                            placeholder="e.g., 1"
                            min="0"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Maximum</label>
                          <input
                            type="number"
                            value={maxOpenInvoices}
                            onChange={(e) => setMaxOpenInvoices(e.target.value)}
                            placeholder="e.g., 10"
                            min="0"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 lg:col-span-3">
                      <h4 className="text-sm font-medium text-slate-300 mb-3">Balance Range</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Minimum ($)</label>
                          <input
                            type="number"
                            value={minBalance}
                            onChange={(e) => setMinBalance(e.target.value)}
                            placeholder="e.g., 100"
                            step="0.01"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Maximum ($)</label>
                          <input
                            type="number"
                            value={maxBalance}
                            onChange={(e) => setMaxBalance(e.target.value)}
                            placeholder="e.g., 10000"
                            step="0.01"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400">
                  Showing <span className="text-white font-semibold">{filteredCustomers.length}</span> of{' '}
                  <span className="text-white font-semibold">{displayedCustomers.length}</span> loaded
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
            <p className="text-slate-400">Loading customers...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <p className="text-slate-400 text-lg mb-2">
              {searchTerm ? 'No customers found matching your search' : 'No customers synced yet'}
            </p>
            {!searchTerm && (
              <p className="text-slate-500">
                Use the Acumatica Invoice Test page to fetch customers from Acumatica
              </p>
            )}
          </div>
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div
              ref={topScrollRef}
              className="overflow-x-auto w-full border-b border-slate-700"
              style={{ overflowY: 'hidden', height: '20px' }}
            >
              <div style={{ width: '1600px', height: '20px' }}></div>
            </div>
            <div ref={tableScrollRef} className="overflow-x-auto w-full">
              <table className="w-full divide-y divide-slate-700" style={{ minWidth: '1600px' }}>
                <thead className="bg-slate-900">
                  <tr>
                    <th
                      onClick={() => handleColumnSort('customer_id')}
                      className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Customer ID {getSortIcon('customer_id')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('customer_name')}
                      className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Customer Name {getSortIcon('customer_name')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('balance')}
                      className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center justify-end">
                        Balance Owed {getSortIcon('balance')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('open_invoices')}
                      className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center justify-center">
                        Open Invoices {getSortIcon('open_invoices')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Invoice Colors
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-64">
                      Payment Performance
                    </th>
                    <th
                      onClick={() => handleColumnSort('days_past_due_threshold')}
                      className="px-6 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center justify-center">
                        Red After (Days) {getSortIcon('days_past_due_threshold')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('customer_status')}
                      className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Status {getSortIcon('customer_status')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('city')}
                      className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Location {getSortIcon('city')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('customer_class')}
                      className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Class {getSortIcon('customer_class')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('synced_at')}
                      className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Last Synced {getSortIcon('synced_at')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleColumnSort('email_address')}
                      className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-24 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center">
                        Email {getSortIcon('email_address')}
                      </div>
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredCustomers.map((customer, index) => {
                    const hasOverdueOver90Days = customer.max_days_overdue > 90 && customer.calculated_balance > 0;
                    return (
                    <tr
                      key={customer.id}
                      ref={index === filteredCustomers.length - 1 ? lastCustomerRef : undefined}
                      className={`transition-colors ${
                        hasOverdueOver90Days
                          ? 'bg-red-900/40 hover:bg-red-900/60 border-l-4 border-l-red-500'
                          : 'hover:bg-slate-700/50'
                      }`}
                    >
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.customer_id || 'N/A'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium cursor-pointer"
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
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-500 text-white border border-red-600">
                              {customer.color_status_counts.red}
                            </span>
                          )}
                          {customer.color_status_counts?.yellow > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-yellow-400 text-gray-900 border border-yellow-500">
                              {customer.color_status_counts.yellow}
                            </span>
                          )}
                          {customer.color_status_counts?.green > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-500 text-white border border-green-600">
                              {customer.color_status_counts.green}
                            </span>
                          )}
                          {(!customer.color_status_counts ||
                            (customer.color_status_counts.red === 0 &&
                             customer.color_status_counts.yellow === 0 &&
                             customer.color_status_counts.green === 0)) && (
                            <span className="text-xs text-slate-500">-</span>
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
                              <div className="absolute z-50 left-10 top-0 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-2xl" style={{ width: '280px' }}>
                                <div className="mb-3">
                                  <h4 className="text-sm font-semibold text-white mb-1">Payment Performance</h4>
                                  <p className="text-xs text-slate-400">{customer.payment_performance.total} invoices tracked</p>
                                </div>

                                <div className="flex justify-center mb-3">
                                  {renderPieChartSVG(customer.payment_performance)}
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                      <span className="text-slate-300">≤15 days</span>
                                    </span>
                                    <span className="font-semibold text-white">
                                      {customer.payment_performance.within15} ({((customer.payment_performance.within15 / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                      <span className="text-slate-300">16-45 days</span>
                                    </span>
                                    <span className="font-semibold text-white">
                                      {customer.payment_performance.within45} ({((customer.payment_performance.within45 / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                      <span className="text-slate-300">46-365 days</span>
                                    </span>
                                    <span className="font-semibold text-white">
                                      {customer.payment_performance.withinYear} ({((customer.payment_performance.withinYear / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                      <span className="text-slate-300">&gt;365 days</span>
                                    </span>
                                    <span className="font-semibold text-white">
                                      {customer.payment_performance.overYear} ({((customer.payment_performance.overYear / customer.payment_performance.total) * 100).toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No data</span>
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
                              className="w-16 px-2 py-1 bg-slate-900 border border-blue-500 rounded text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                              className="p-1 bg-slate-600 hover:bg-slate-700 text-white rounded transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-center group">
                            <span className="text-sm font-medium text-white">
                              {customer.days_past_due_threshold || 30}
                            </span>
                            <button
                              onClick={() => startEditingThreshold(customer.customer_id, customer.days_past_due_threshold || 30)}
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
                            : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}>
                          {customer.customer_status || 'Unknown'}
                        </span>
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.city && customer.country
                          ? `${customer.city}, ${customer.country}`
                          : customer.city || customer.country || 'N/A'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-slate-300 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {customer.customer_class || 'N/A'}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        {formatDateUtil(customer.synced_at)}
                      </td>
                      <td
                        className="px-3 py-4 text-sm text-slate-300 w-24 cursor-pointer"
                        onClick={() => setSelectedCustomer(customer.customer_id)}
                      >
                        <div className="truncate" title={customer.email_address || 'N/A'}>
                          {customer.email_address || 'N/A'}
                        </div>
                      </td>
                      <td
                        className="px-3 py-4 text-center w-24"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleExcludeCustomer(customer.customer_id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                          title="Exclude this customer from the list"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            {loadingMore && (
              <div className="text-center py-8 border-t border-slate-700">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-slate-400 text-sm">Loading more customers...</p>
              </div>
            )}
            {!hasMore && displayedCustomers.length > 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">All customers loaded ({displayedCustomers.length} total)</p>
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
              className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {selectedCustomer.customer_name || 'Customer Details'}
                  </h2>
                  <p className="text-slate-400">ID: {selectedCustomer.customer_id}</p>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-slate-400 hover:text-white transition-colors"
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
                      <span className="text-slate-400 text-sm">{label}:</span>
                      <p className="text-white font-medium">{String(displayValue)}</p>
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
              className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-6">Save Current Filter</h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Filter Name
                </label>
                <input
                  type="text"
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="e.g., High Balance Customers"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
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
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {savingFilter ? 'Saving...' : 'Save Filter'}
                </button>
                <button
                  onClick={() => setShowSaveFilterModal(false)}
                  disabled={savingFilter}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
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
              className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Saved Filters</h2>
                <button
                  onClick={() => setShowLoadFilterModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {savedFilters.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-400 mb-4">No saved filters yet</p>
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
                  {savedFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className="flex items-center justify-between p-4 bg-slate-900 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                    >
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          {filter.filter_name}
                        </h3>
                        <p className="text-sm text-slate-400">
                          Created {formatDateUtil(filter.created_at)}
                        </p>
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
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {excludedCustomerIds.size > 0 && (
          <div className="fixed bottom-6 right-6 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-2xl max-w-sm z-40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <EyeOff className="w-5 h-5 text-red-400" />
                Excluded Customers
              </h3>
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                {excludedCustomerIds.size}
              </span>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              {excludedCustomerIds.size} customer{excludedCustomerIds.size !== 1 ? 's' : ''} hidden from list
            </p>
            <button
              onClick={() => {
                if (confirm(`Remove all ${excludedCustomerIds.size} excluded customers?`)) {
                  excludedCustomerIds.forEach(id => handleIncludeCustomer(id));
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Eye className="w-4 h-4" />
              Show All Excluded
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
