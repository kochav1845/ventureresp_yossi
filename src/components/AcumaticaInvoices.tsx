import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Calendar, DollarSign, Database, Filter, X, FileText, User, ChevronLeft, ChevronRight, MessageSquare, Lock, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import AcumaticaInvoiceFetch from './AcumaticaInvoiceFetch';
import InvoiceMemoModal from './InvoiceMemoModal';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { exportToExcel as exportExcel, formatDate, formatCurrency } from '../lib/excelExport';

interface AcumaticaInvoicesProps {
  onBack?: () => void;
}

export default function AcumaticaInvoices({ onBack }: AcumaticaInvoicesProps) {
  const { profile, user } = useAuth();
  const { hasPermission, loading: permissionsLoading } = useUserPermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handleBack = onBack || (() => navigate(-1));
  const canPerformFetch = profile?.role === 'admin' || (profile as any)?.can_perform_fetch;

  // Get invoice from URL if present
  const invoiceFromUrl = searchParams.get('invoice');

  const hasAccess = hasPermission(PERMISSION_KEYS.INVOICES, 'view');
  const [displayedInvoices, setDisplayedInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState(invoiceFromUrl || '');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [loadingInvoiceDetails, setLoadingInvoiceDetails] = useState(false);
  const [showFetchPage, setShowFetchPage] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [balanceFilter, setBalanceFilter] = useState<string>('all');
  const [colorFilter, setColorFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [memoModalInvoice, setMemoModalInvoice] = useState<any>(null);
  const [availableCustomers, setAvailableCustomers] = useState<{id: string, name: string}[]>([]);
  const [availableColors, setAvailableColors] = useState<{color: string, userName: string}[]>([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const searchAbortController = useRef<AbortController | null>(null);
  const pageSize = 50;

  const enrichInvoicesWithUserColors = async (invoices: any[]) => {
    if (invoices.length === 0) return invoices;

    const invoiceRefs = invoices.map(inv => inv.reference_nbr || inv.reference_number);
    const refLimit = 1000;
    const refsSlice = invoiceRefs.slice(0, refLimit);

    const [memosResult, statusResult, assignmentsResult] = await Promise.all([
      supabase
        .from('invoice_memos')
        .select('invoice_reference, created_by_user_id, created_at')
        .in('invoice_reference', refsSlice)
        .order('created_at', { ascending: false })
        .limit(refLimit),
      supabase
        .from('invoice_status_history')
        .select('invoice_reference, changed_by, changed_at')
        .in('invoice_reference', refsSlice)
        .order('changed_at', { ascending: false })
        .limit(refLimit),
      supabase
        .from('invoice_assignments')
        .select(`
          invoice_reference_number,
          assigned_collector_id,
          user_profiles!invoice_assignments_assigned_collector_id_fkey(
            id,
            email,
            full_name,
            assigned_color
          )
        `)
        .in('invoice_reference_number', refsSlice)
    ]);

    const lastMemos = memosResult.data;
    const lastStatusChanges = statusResult.data;
    const assignments = assignmentsResult.data;

    const lastActivityMap = new Map();

    lastMemos?.forEach(memo => {
      if (!lastActivityMap.has(memo.invoice_reference)) {
        lastActivityMap.set(memo.invoice_reference, {
          userId: memo.created_by_user_id,
          timestamp: memo.created_at
        });
      } else {
        const existing = lastActivityMap.get(memo.invoice_reference);
        if (new Date(memo.created_at) > new Date(existing.timestamp)) {
          lastActivityMap.set(memo.invoice_reference, {
            userId: memo.created_by_user_id,
            timestamp: memo.created_at
          });
        }
      }
    });

    lastStatusChanges?.forEach(change => {
      if (!lastActivityMap.has(change.invoice_reference)) {
        lastActivityMap.set(change.invoice_reference, {
          userId: change.changed_by,
          timestamp: change.changed_at
        });
      } else {
        const existing = lastActivityMap.get(change.invoice_reference);
        if (new Date(change.changed_at) > new Date(existing.timestamp)) {
          lastActivityMap.set(change.invoice_reference, {
            userId: change.changed_by,
            timestamp: change.changed_at
          });
        }
      }
    });

    const userIds = Array.from(new Set(
      Array.from(lastActivityMap.values()).map(a => a.userId)
    ));
    console.log('🎨 [ENRICH] Fetching colors for', userIds.length, 'users');

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, assigned_color')
      .in('id', userIds);
    console.log('🎨 [ENRICH] Found', users?.length || 0, 'user profiles');

    const userColorMap = new Map(
      users?.map(u => [u.id, u.assigned_color]) || []
    );
    console.log('🎨 [ENRICH] Created color map with', userColorMap.size, 'entries');

    const assignmentMap = new Map(
      assignments?.map(a => [
        a.invoice_reference_number,
        {
          collectorId: a.assigned_collector_id,
          collectorName: a.user_profiles?.full_name || a.user_profiles?.email || 'Unknown',
          collectorColor: a.user_profiles?.assigned_color
        }
      ]) || []
    );

    console.log('🎨 [ENRICH] Mapping enriched data to invoices...');
    const enriched = invoices.map(invoice => {
      const refNum = invoice.reference_nbr || invoice.reference_number;
      const lastActivity = lastActivityMap.get(refNum);
      const assignment = assignmentMap.get(refNum);

      return {
        ...invoice,
        last_activity_user_color: lastActivity ? userColorMap.get(lastActivity.userId) : null,
        assigned_collector_name: assignment?.collectorName,
        assigned_collector_color: assignment?.collectorColor
      };
    });
    console.log('🎨 [ENRICH] Enrichment complete! Returning', enriched.length, 'invoices');
    return enriched;
  };

  const fetchInvoiceDetails = async (invoiceId: string) => {
    setLoadingInvoiceDetails(true);
    try {
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('*')
        .eq('id', invoiceId)
        .maybeSingle();

      if (error) throw error;
      setSelectedInvoice(data);
    } catch (error) {
      console.error('Error fetching invoice details:', error);
      alert('Failed to load invoice details');
    } finally {
      setLoadingInvoiceDetails(false);
    }
  };

  const handleInvoiceClick = (invoice: any) => {
    fetchInvoiceDetails(invoice.id);
  };

  const handleColorStatusChange = async (invoiceId: string, newStatus: string | null, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!user?.id) return;

    try {
      const invoice = displayedInvoices.find(inv => inv.id === invoiceId);
      const oldStatus = invoice?.color_status;

      const { error } = await supabase.rpc('update_invoice_color_status', {
        p_invoice_id: invoiceId,
        p_color_status: newStatus,
        p_user_id: user.id
      });

      if (error) throw error;

      await supabase
        .from('invoice_activity_log')
        .insert({
          invoice_id: invoiceId,
          user_id: user?.id,
          activity_type: 'color_change',
          old_value: oldStatus || 'No Color',
          new_value: newStatus || 'No Color',
          description: `Changed status from ${oldStatus || 'No Color'} to ${newStatus || 'No Color'}`
        });

      setDisplayedInvoices(prev =>
        prev.map(inv =>
          inv.id === invoiceId ? { ...inv, color_status: newStatus } : inv
        )
      );
    } catch (error) {
      console.error('Error updating color status:', error);
      alert('Failed to update status');
    }
  };

  useEffect(() => {
    // If invoice parameter in URL, use that
    if (invoiceFromUrl) {
      setSearchTerm(invoiceFromUrl);
    } else {
      const savedSearchTerm = localStorage.getItem('invoiceSearchTerm');
      if (savedSearchTerm) {
        setSearchTerm(savedSearchTerm);
        localStorage.removeItem('invoiceSearchTerm');
      }
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    if (searchAbortController.current) {
      searchAbortController.current.abort();
    }

    const debounceTimer = setTimeout(() => {
      handleSearch(true);
    }, 300);

    return () => {
      clearTimeout(debounceTimer);
      if (searchAbortController.current) {
        searchAbortController.current.abort();
      }
    };
  }, [searchTerm, statusFilter, customerFilter, selectedCustomers, balanceFilter, colorFilter, dateFrom, dateTo, sortBy, sortOrder]);

  const loadInitialData = async () => {
    await Promise.all([
      loadInvoices(),
      loadAvailableCustomers(),
      loadAvailableColors()
    ]);
  };

  const loadAvailableCustomers = async () => {
    try {
      let allCustomers: any[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name')
          .order('customer_name')
          .range(from, from + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allCustomers = [...allCustomers, ...data];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`Loaded ${allCustomers.length} customers`);

      setAvailableCustomers(
        allCustomers.map(c => ({
          id: c.customer_id,
          name: c.customer_name || c.customer_id
        }))
      );
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const loadAvailableColors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, assigned_color')
        .not('assigned_color', 'is', null);

      if (error) throw error;

      setAvailableColors(
        (data || []).map(u => ({
          color: u.assigned_color,
          userName: u.email?.split('@')[0] || 'User'
        }))
      );
    } catch (error) {
      console.error('Error loading colors:', error);
    }
  };

  const buildInvoiceQuery = (offset: number, searchTermTrimmed: string | null) => {
    const selectCols = 'id, customer, customer_name, reference_number, type, status, color_status, date, due_date, amount, balance, terms, last_modified_by_color, customer_order, description';

    let query = supabase.from('acumatica_invoices').select(selectCols);

    if (searchTermTrimmed) {
      const isNumeric = /^\d+$/.test(searchTermTrimmed);
      if (isNumeric) {
        const padded = searchTermTrimmed.padStart(6, '0');
        query = query.or(`reference_number.eq.${searchTermTrimmed},reference_number.eq.${padded}`);
      } else {
        query = query.or(`reference_number.ilike.%${searchTermTrimmed}%,customer_name.ilike.%${searchTermTrimmed}%`);
      }
    }

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (customerFilter !== 'all') query = query.eq('customer', customerFilter);
    if (selectedCustomers.length > 0) query = query.in('customer', selectedCustomers);
    if (balanceFilter === 'paid') query = query.eq('balance', 0);
    if (balanceFilter === 'unpaid') query = query.gt('balance', 0);
    if (colorFilter !== 'all') query = query.eq('color_status', colorFilter);
    if (dateFrom) query = query.gte('date', dateFrom);
    if (dateTo) query = query.lte('date', dateTo);

    const ascending = sortOrder === 'asc';
    const sortCol = sortBy === 'color' ? 'color_status' : sortBy === 'customer_name' ? 'customer_name' : sortBy;
    query = query.order(sortCol, { ascending, nullsFirst: false });
    if (sortCol !== 'date') query = query.order('date', { ascending: false, nullsFirst: false });

    query = query.range(offset, offset + pageSize - 1);
    return query;
  };

  const processInvoiceResults = async (data: any[], append: boolean) => {
    const invoices = (data || []).map(invoice => ({
      ...invoice,
      customer_name: invoice.customer_name || invoice.customer,
      userAssignedColor: invoice.last_modified_by_color || 'none',
      reference_nbr: invoice.reference_number
    }));

    const enrichedInvoices = await enrichInvoicesWithUserColors(invoices);

    if (append) {
      setDisplayedInvoices(prev => [...prev, ...enrichedInvoices]);
    } else {
      setDisplayedInvoices(enrichedInvoices);
    }

    setHasMoreResults(enrichedInvoices.length === pageSize);
  };

  const loadInvoices = async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setDisplayedInvoices([]);
    }
    setIsSearching(false);

    try {
      const offset = append ? displayedInvoices.length : 0;
      const { data, error } = await buildInvoiceQuery(offset, null);

      if (error) throw error;
      await processInvoiceResults(data || [], append);
    } catch (error: any) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSearch = async (resetResults = true) => {
    const searchTermTrimmed = searchTerm.trim();
    const hasSearchTerm = searchTermTrimmed.length >= 3;
    const hasFilters = hasSearchTerm || statusFilter !== 'all' || customerFilter !== 'all' ||
                       selectedCustomers.length > 0 || balanceFilter !== 'all' || colorFilter !== 'all' ||
                       dateFrom || dateTo;

    if (!hasFilters) {
      loadInvoices();
      return;
    }

    if (searchTermTrimmed.length > 0 && searchTermTrimmed.length < 3) return;

    searchAbortController.current = new AbortController();
    const currentController = searchAbortController.current;

    if (resetResults) {
      setLoading(true);
      setDisplayedInvoices([]);
    } else {
      setLoadingMore(true);
    }
    setIsSearching(true);

    try {
      if (currentController.signal.aborted) return;

      const offset = resetResults ? 0 : displayedInvoices.length;
      const { data, error } = await buildInvoiceQuery(offset, hasSearchTerm ? searchTermTrimmed : null);

      if (error) throw error;
      await processInvoiceResults(data || [], !resetResults);
    } catch (error: any) {
      console.error('Search error:', error);
      if (error?.code === '57014') {
        alert('Search timed out. Please add more specific filters or search terms.');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreResults = () => {
    if (isSearching) {
      handleSearch(false);
    } else {
      loadInvoices(true);
    }
  };

  const getUniqueCustomers = () => {
    const customers = displayedInvoices
      .map(inv => ({ id: inv.customer, name: inv.customer_name }))
      .filter(c => c.name)
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name));
    return customers;
  };

  const filteredInvoices = displayedInvoices
    .filter(invoice => {
      let matchesBalance = true;
      if (balanceFilter === 'positive' && invoice.balance <= 0) matchesBalance = false;
      if (balanceFilter === 'negative' && invoice.balance >= 0) matchesBalance = false;
      if (balanceFilter === 'zero' && invoice.balance !== 0) matchesBalance = false;
      if (balanceFilter === 'paid' && invoice.balance !== 0) matchesBalance = false;

      return matchesBalance;
    })
    .sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCustomerFilter('all');
    setSelectedCustomers([]);
    setBalanceFilter('all');
    setColorFilter('all');
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    setDateFrom(sixMonthsAgo.toISOString().split('T')[0]);
    setDateTo('');
    setSortBy('date');
    setSortOrder('desc');
    loadInvoices();
  };

  const showAllInvoices = () => {
    setDateFrom('');
    setDateTo('');
  };

  const handleExportToExcel = () => {
    if (displayedInvoices.length === 0) {
      alert('No invoices to export');
      return;
    }

    setExporting(true);
    try {
      const exportData = displayedInvoices.map(inv => ({
        reference_number: inv.reference_nbr || inv.reference_number,
        customer: inv.customer_name || inv.customer,
        date: inv.date,
        due_date: inv.due_date,
        type: inv.type,
        status: inv.status,
        total: parseFloat(inv.dac_total || 0),
        balance: parseFloat(inv.balance || 0),
        description: inv.description || '',
        terms: inv.terms || '',
        location: inv.location || ''
      }));

      exportExcel({
        filename: `invoices_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Invoices',
        title: 'Invoices Report',
        subtitle: `Generated on ${new Date().toLocaleDateString()} - ${exportData.length} invoices`,
        columns: [
          { header: 'Reference Number', key: 'reference_number', width: 20 },
          { header: 'Customer', key: 'customer', width: 30 },
          { header: 'Date', key: 'date', width: 15, format: formatDate },
          { header: 'Due Date', key: 'due_date', width: 15, format: formatDate },
          { header: 'Type', key: 'type', width: 15 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Total', key: 'total', width: 15, format: formatCurrency },
          { header: 'Balance', key: 'balance', width: 15, format: formatCurrency },
          { header: 'Description', key: 'description', width: 30 },
          { header: 'Terms', key: 'terms', width: 20 },
          { header: 'Location', key: 'location', width: 20 }
        ],
        data: exportData
      });
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting data');
    } finally {
      setExporting(false);
    }
  };

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomers(prev =>
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return sortOrder === 'asc' ?
      <ArrowUp size={14} className="text-blue-600" /> :
      <ArrowDown size={14} className="text-blue-600" />;
  };

  const isInvoiceOver90Days = (invoiceDate: string) => {
    const today = new Date();
    const invDate = new Date(invoiceDate);
    const diffTime = today.getTime() - invDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 90;
  };

  const activeFiltersCount = [
    searchTerm !== '',
    statusFilter !== 'all',
    customerFilter !== 'all',
    selectedCustomers.length > 0,
    balanceFilter !== 'all',
    colorFilter !== 'all',
    dateFrom !== '',
    dateTo !== ''
  ].filter(Boolean).length;

  const formatDateDisplay = formatDateUtil;

  const formatCurrencyDisplay = (amount: number) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (showFetchPage) {
    return <AcumaticaInvoiceFetch onBack={() => setShowFetchPage(false)} />;
  }

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

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
              You do not have permission to view Invoices.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-[95%] mx-auto">
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Main Menu
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Acumatica Invoices</h1>
              <p className="text-gray-600">
                Showing {displayedInvoices.length} invoices {hasMoreResults && '(Load more to see additional results)'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {canPerformFetch && (
                <button
                  onClick={() => setShowFetchPage(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Database className="w-5 h-5" />
                  Fetch Invoices
                </button>
              )}

              <button
                onClick={() => loadInvoices()}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExportToExcel}
                disabled={loading || exporting || displayedInvoices.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                <Download className={`w-5 h-5 ${exporting ? 'animate-bounce' : ''}`} />
                {exporting ? 'Exporting...' : 'Export to Excel'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by reference number, customer, order, description, or type (min 3 characters)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(true)}
                className={`w-full pl-12 pr-4 py-3 bg-white border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 transition-colors ${
                  searchTerm.trim().length > 0 && searchTerm.trim().length < 3
                    ? 'border-yellow-400 focus:border-yellow-500 focus:ring-yellow-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
              />
              {searchTerm.trim().length > 0 && searchTerm.trim().length < 3 && (
                <div className="absolute left-0 top-full mt-1 text-xs text-yellow-600">
                  Type at least 3 characters to search
                </div>
              )}
            </div>
            <button
              onClick={() => handleSearch(true)}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              Search
            </button>
            {isSearching && (
              <button
                onClick={clearFilters}
                className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                showFilters || activeFiltersCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
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
            <div className="bg-white border border-gray-300 rounded-lg p-6 space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Filter & Sort Options</h3>
                <div className="flex items-center gap-2">
                  {dateFrom && !dateTo && (
                    <button
                      onClick={showAllInvoices}
                      className="flex items-center gap-2 text-sm px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      Show All Time
                    </button>
                  )}
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              {dateFrom && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                  <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <strong>Performance Tip:</strong> Showing invoices from {new Date(dateFrom).toLocaleDateString()} onwards for faster loading. Click "Show All Time" above to remove date filter.
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                    <option value="Hold">Hold</option>
                    <option value="Pending Print">Pending Print</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Balance
                  </label>
                  <select
                    value={balanceFilter}
                    onChange={(e) => setBalanceFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Balances</option>
                    <option value="paid">Paid (Zero Balance)</option>
                    <option value="unpaid">Outstanding Balance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    User Color
                  </label>
                  <select
                    value={colorFilter}
                    onChange={(e) => setColorFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Colors</option>
                    {availableColors.map(({ color, userName }) => (
                      <option key={color} value={color}>
                        {userName} ({color})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Customers {selectedCustomers.length > 0 && `(${selectedCustomers.length} selected)`}
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search customers..."
                      value={customerSearchTerm}
                      onChange={(e) => setCustomerSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="bg-white border border-gray-300 rounded-lg p-3 max-h-64 overflow-y-auto">
                    {availableCustomers.length === 0 ? (
                      <p className="text-gray-500 text-sm">Loading all customers...</p>
                    ) : (() => {
                      const filteredCustomers = availableCustomers.filter(customer =>
                        customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                        customer.id.toLowerCase().includes(customerSearchTerm.toLowerCase())
                      );

                      if (filteredCustomers.length === 0) {
                        return <p className="text-gray-500 text-sm">No customers found matching "{customerSearchTerm}"</p>;
                      }

                      return (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-500 mb-2">
                            Showing {filteredCustomers.length} of {availableCustomers.length} customers
                          </div>
                          {filteredCustomers.map((customer) => (
                            <label key={customer.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                              <input
                                type="checkbox"
                                checked={selectedCustomers.includes(customer.id)}
                                onChange={() => toggleCustomerSelection(customer.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-gray-900 text-sm">{customer.name}</span>
                              <span className="text-gray-500 text-xs ml-auto">({customer.id})</span>
                            </label>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort By
                </label>
                <div className="flex gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="date">Invoice Date</option>
                    <option value="due_date">Due Date</option>
                    <option value="reference_number">Reference Number</option>
                    <option value="customer">Customer</option>
                    <option value="amount">Amount</option>
                    <option value="balance">Balance</option>
                    <option value="status">Status</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
                    title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-300">
                <p className="text-sm text-gray-600">
                  Showing <span className="text-gray-900 font-semibold">{filteredInvoices.length}</span> of{' '}
                  <span className="text-gray-900 font-semibold">{displayedInvoices.length}</span> loaded invoices
                </p>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading invoices...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white border border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg mb-2">
              {searchTerm ? 'No invoices found matching your search' : 'No invoices synced yet'}
            </p>
            {!searchTerm && (
              <p className="text-gray-500">
                Use the Fetch Invoices button to import invoices from Acumatica
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
            <div className="max-h-[calc(100vh-400px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('reference_number')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Reference</span>
                        {getSortIcon('reference_number')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('customer')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Customer</span>
                        {getSortIcon('customer')}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Assigned To</th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Type</span>
                        {getSortIcon('type')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Status</span>
                        {getSortIcon('status')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('color_status')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Color Status</span>
                        {getSortIcon('color_status')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Invoice Date</span>
                        {getSortIcon('date')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('due_date')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Due Date</span>
                        {getSortIcon('due_date')}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Amount</span>
                        {getSortIcon('amount')}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('balance')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Balance</span>
                        {getSortIcon('balance')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('terms')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Terms</span>
                        {getSortIcon('terms')}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice, index) => {
                    const isOver90Days = isInvoiceOver90Days(invoice.date);
                    const bgColor = isOver90Days
                      ? '#fee2e2'
                      : invoice.assigned_collector_color
                      ? `${invoice.assigned_collector_color}20`
                      : (index % 2 === 0 ? 'white' : '#f9fafb');

                    return (
                      <tr
                        key={invoice.id}
                        className={`border-b border-gray-300 cursor-pointer transition-all ${
                          isOver90Days ? 'hover:bg-red-100' : 'hover:opacity-90'
                        }`}
                        style={{ backgroundColor: bgColor }}
                        onClick={() => handleInvoiceClick(invoice)}
                      >
                        <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300 relative">
                          {invoice.last_activity_user_color && (
                            <div
                              className="absolute top-0 left-0 w-1 h-full"
                              style={{ backgroundColor: invoice.last_activity_user_color }}
                              title="Last activity by user"
                            />
                          )}
                          <span className="font-medium">{invoice.reference_number || 'N/A'}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                          {invoice.customer_name || invoice.customer || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                          {invoice.assigned_collector_name ? (
                            <div className="flex items-center gap-2">
                              {invoice.assigned_collector_color && (
                                <div
                                  className="w-3 h-3 rounded-full border border-gray-300"
                                  style={{ backgroundColor: invoice.assigned_collector_color }}
                                />
                              )}
                              <span className="font-medium">{invoice.assigned_collector_name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Unassigned</span>
                          )}
                        </td>
                      <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                        {invoice.type || 'Invoice'}
                      </td>
                      <td className="py-3 px-4 text-sm border-r border-gray-300">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          invoice.status === 'Open'
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'Closed'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {invoice.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm border-r border-gray-300" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={invoice.color_status || ''}
                          onChange={(e) => handleColorStatusChange(invoice.id, e.target.value || null, e as any)}
                          onClick={(e) => e.stopPropagation()}
                          className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            invoice.color_status === 'green'
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : invoice.color_status === 'orange'
                              ? 'bg-orange-100 text-orange-800 border-orange-300'
                              : invoice.color_status === 'red'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          <option value="">No Color</option>
                          <option value="green">Will Pay</option>
                          <option value="orange">Will Take Care</option>
                          <option value="red">Will Not Pay</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                        {formatDateDisplay(invoice.date)}
                      </td>
                      <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                        {formatDateDisplay(invoice.due_date)}
                      </td>
                      <td className="py-3 px-4 text-gray-900 text-sm text-right font-medium border-r border-gray-300">
                        {formatCurrencyDisplay(invoice.amount)}
                      </td>
                      <td className={`py-3 px-4 text-sm text-right font-medium border-r border-gray-300 ${
                        invoice.balance === 0
                          ? 'text-green-600'
                          : invoice.balance > 0
                          ? 'text-yellow-600'
                          : 'text-blue-600'
                      }`}>
                        {formatCurrencyDisplay(invoice.balance)}
                      </td>
                      <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                        {invoice.terms || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMemoModalInvoice(invoice);
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Memo
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasMoreResults && (
              <div className="p-4 text-center bg-gray-50 border-t border-gray-300">
                <button
                  onClick={loadMoreResults}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    `Load More (${displayedInvoices.length} loaded)`
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {(selectedInvoice || loadingInvoiceDetails) && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            onClick={() => {
              setSelectedInvoice(null);
              setLoadingInvoiceDetails(false);
            }}
          >
            <div
              className="bg-white border border-gray-300 rounded-lg p-8 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {loadingInvoiceDetails ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="ml-3 text-gray-600">Loading invoice details...</span>
                </div>
              ) : selectedInvoice ? (
                <>
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Invoice {selectedInvoice.reference_number || 'Details'}
                      </h2>
                      <p className="text-gray-600">{selectedInvoice.customer_name || selectedInvoice.customer}</p>
                    </div>
                    <button
                      onClick={() => setSelectedInvoice(null)}
                      className="text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      <span className="sr-only">Close</span>
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {Object.entries(selectedInvoice).map(([key, value]) => {
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
                        displayValue = formatDateDisplay(value as string);
                      } else if (typeof value === 'number' && (key.includes('balance') || key.includes('limit') || key.includes('amount') || key.includes('total') || key.includes('tax'))) {
                        displayValue = formatCurrencyDisplay(value);
                      }

                      return (
                        <div key={key}>
                          <span className="text-gray-600 text-sm">{label}:</span>
                          <p className="text-gray-900 font-medium">{String(displayValue)}</p>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {memoModalInvoice && (
          <InvoiceMemoModal
            invoice={memoModalInvoice}
            onClose={() => setMemoModalInvoice(null)}
          />
        )}
      </div>
    </div>
  );
}
