import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { batchedInQuery } from '../lib/batchedQuery';
import { ArrowLeft, Plus, CreditCard as Edit2, Trash2, Users, RefreshCw, Mail, CheckSquare, Square, FileText, Clock, Calendar, PauseCircle, Play, ChevronLeft, ChevronRight, Search, Download, Lock, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, TrendingUp, Filter, X } from 'lucide-react';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import CustomerFiles from './CustomerFiles';
import { exportToExcel as exportExcel, formatDate, formatCurrency } from '../lib/excelExport';
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
  // Analytics fields
  customer_id?: string;
  balance?: number;
  invoice_count?: number;
  oldest_invoice_date?: string | null;
  newest_invoice_date?: string | null;
  max_days_overdue?: number;
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
  sortBy: 'name' | 'email' | 'balance' | 'invoice_count' | 'max_days_overdue' | 'created_at';
  sortOrder: 'asc' | 'desc';
};

const PRESET_FILTERS = [
  { label: 'High Balance (>$10k)', filter: { minBalance: 10000, maxBalance: Infinity, minInvoiceCount: 0, maxInvoiceCount: Infinity, minInvoiceAmount: 0, maxInvoiceAmount: Infinity, minDaysOverdue: 0, maxDaysOverdue: Infinity } },
  { label: 'Medium Balance ($5k-$10k)', filter: { minBalance: 5000, maxBalance: 10000, minInvoiceCount: 0, maxInvoiceCount: Infinity, minInvoiceAmount: 0, maxInvoiceAmount: Infinity, minDaysOverdue: 0, maxDaysOverdue: Infinity } },
  { label: 'Balance >$500 & >10 Invoices', filter: { minBalance: 500, maxBalance: Infinity, minInvoiceCount: 10, maxInvoiceCount: Infinity, minInvoiceAmount: 0, maxInvoiceAmount: Infinity, minDaysOverdue: 0, maxDaysOverdue: Infinity } },
  { label: 'Small Invoices ($30-$2k)', filter: { minBalance: 0, maxBalance: Infinity, minInvoiceCount: 0, maxInvoiceCount: Infinity, minInvoiceAmount: 30, maxInvoiceAmount: 2000, minDaysOverdue: 0, maxDaysOverdue: Infinity } },
  { label: 'Many Open Invoices (>20)', filter: { minBalance: 0, maxBalance: Infinity, minInvoiceCount: 20, maxInvoiceCount: Infinity, minInvoiceAmount: 0, maxInvoiceAmount: Infinity, minDaysOverdue: 0, maxDaysOverdue: Infinity } },
  { label: 'Overdue >90 Days', filter: { minBalance: 0, maxBalance: Infinity, minInvoiceCount: 0, maxInvoiceCount: Infinity, minInvoiceAmount: 0, maxInvoiceAmount: Infinity, minDaysOverdue: 90, maxDaysOverdue: Infinity } },
  { label: 'Critical: >$20k OR >30 Invoices', filter: { minBalance: 20000, maxBalance: Infinity, minInvoiceCount: 30, maxInvoiceCount: Infinity, minInvoiceAmount: 0, maxInvoiceAmount: Infinity, minDaysOverdue: 0, maxDaysOverdue: Infinity }, logic: 'OR' as const },
];

type CustomersProps = {
  onBack?: () => void;
};

export default function Customers({ onBack }: CustomersProps) {
  const { hasPermission, loading: permissionsLoading } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.CUSTOMERS_VIEW, 'view');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewingFiles, setViewingFiles] = useState<{ id: string; name: string } | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<{ id: string; name: string } | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [grandTotalCustomers, setGrandTotalCustomers] = useState(0); // Unfiltered total
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [stats, setStats] = useState({
    total_customers: 0,
    active_customers: 0,
    total_balance: 0,
    avg_balance: 0,
    customers_with_debt: 0,
    total_open_invoices: 0,
    customers_with_overdue: 0
  });

  const [filters, setFilters] = useState<FilterConfig>({
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
  });

  const pageSize = 50;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });

  useEffect(() => {
    loadCustomersWithAnalytics();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, allCustomers]);

  const loadCustomersWithAnalytics = async () => {
    setLoading(true);
    setIsSearching(false);
    try {
      // Get GRAND TOTAL count from acumatica_customers (unfiltered)
      const { count: totalCustomersCount, error: countError } = await supabase
        .from('acumatica_customers')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error getting total count:', countError);
      } else {
        setGrandTotalCustomers(totalCustomersCount || 0);
      }

      // Get customers from customers table
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customerError) throw customerError;

      // Get customers with analytics (balance, invoice counts) - NO FILTERS
      const { data: analyticsData, error: analyticsError } = await supabase
        .rpc('get_customers_with_balance', {
          p_search: null,
          p_status_filter: 'all',
          p_country_filter: 'all',
          p_sort_by: 'customer_name',
          p_sort_order: 'asc',
          p_limit: 10000,
          p_offset: 0,
          p_date_from: null,
          p_date_to: null,
          p_balance_filter: 'all',
          p_min_balance: null,
          p_max_balance: null,
          p_min_open_invoices: null,
          p_max_open_invoices: null,
          p_min_invoice_amount: null,
          p_max_invoice_amount: null
        });

      if (analyticsError) {
        console.error('Analytics error:', analyticsError);
      }

      // Create a map of analytics data by customer_id
      const analyticsMap = new Map();
      (analyticsData || []).forEach((item: any) => {
        analyticsMap.set(item.customer_id, {
          balance: item.calculated_balance || 0,
          invoice_count: item.open_invoice_count || 0,
          max_days_overdue: item.max_days_overdue || 0,
          red_count: item.red_count || 0,
          yellow_count: item.yellow_count || 0,
          green_count: item.green_count || 0
        });
      });

      // Merge customer data with analytics
      const mergedData = (customerData || []).map(customer => {
        const analytics = analyticsMap.get(customer.id);
        return {
          ...customer,
          customer_id: customer.id,
          balance: analytics?.balance || 0,
          invoice_count: analytics?.invoice_count || 0,
          max_days_overdue: analytics?.max_days_overdue || 0,
          red_count: analytics?.red_count || 0,
          yellow_count: analytics?.yellow_count || 0,
          green_count: analytics?.green_count || 0
        };
      });

      setAllCustomers(mergedData);
      setTotalCount(mergedData.length);

      // Calculate analytics from loaded data (NO FILTERS on initial load)
      loadAnalytics(mergedData);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = useCallback((customers: Customer[]) => {
    // Calculate analytics from the filtered customer data
    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.is_active).length;
    const totalBalance = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const customersWithDebt = customers.filter(c => (c.balance || 0) > 0).length;
    const totalOpenInvoices = customers.reduce((sum, c) => sum + (c.invoice_count || 0), 0);
    const customersWithOverdue = customers.filter(c => (c.max_days_overdue || 0) > 0).length;
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
  }, []);

  const applyFilters = useCallback(async () => {
    // Check if invoice amount filter is applied - if so, we need to query the database
    const hasInvoiceAmountFilter = filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity;

    if (hasInvoiceAmountFilter) {
      // Query database with invoice amount filter
      setLoading(true);
      try {
        const { data: analyticsData, error: analyticsError } = await supabase
          .rpc('get_customers_with_balance', {
            p_search: searchQuery.trim() || null,
            p_status_filter: 'all',
            p_country_filter: 'all',
            p_sort_by: 'customer_name',
            p_sort_order: 'asc',
            p_limit: 10000,
            p_offset: 0,
            p_date_from: filters.dateFrom || null,
            p_date_to: filters.dateTo || null,
            p_balance_filter: 'all',
            p_min_balance: filters.minBalance > 0 ? filters.minBalance : null,
            p_max_balance: filters.maxBalance !== Infinity ? filters.maxBalance : null,
            p_min_open_invoices: filters.minInvoiceCount > 0 ? filters.minInvoiceCount : null,
            p_max_open_invoices: filters.maxInvoiceCount !== Infinity ? filters.maxInvoiceCount : null,
            p_min_invoice_amount: filters.minInvoiceAmount > 0 ? filters.minInvoiceAmount : null,
            p_max_invoice_amount: filters.maxInvoiceAmount !== Infinity ? filters.maxInvoiceAmount : null
          });

        if (analyticsError) throw analyticsError;

        // Map analytics data to customer format
        const filtered = (analyticsData || []).map((item: any) => ({
          id: item.customer_id,
          customer_id: item.customer_id,
          name: item.customer_name,
          email: item.email_address || '',
          is_active: true,
          responded_this_month: false,
          postpone_until: null,
          postpone_reason: null,
          created_at: item.created_at,
          updated_at: item.updated_at,
          balance: item.calculated_balance || 0,
          invoice_count: item.open_invoice_count || 0,
          max_days_overdue: item.max_days_overdue || 0,
          oldest_invoice_date: null,
          newest_invoice_date: null
        }));

        setFilteredCustomers(filtered);
        setTotalCount(filtered.length);
        loadAnalytics(filtered);

        // Paginate
        const start = currentPage * pageSize;
        const end = start + pageSize;
        setCustomers(filtered.slice(start, end));
      } catch (error) {
        console.error('Error applying invoice amount filter:', error);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Otherwise, use client-side filtering
    let filtered = [...allCustomers];

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query)
      );
    }

    // Apply date filters
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(customer => {
        if (!customer.oldest_invoice_date) return false;

        const oldestDate = new Date(customer.oldest_invoice_date);
        const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
        const toDate = filters.dateTo ? new Date(filters.dateTo) : null;

        if (fromDate && toDate) {
          const newestDate = customer.newest_invoice_date ? new Date(customer.newest_invoice_date) : oldestDate;
          return (oldestDate <= toDate && newestDate >= fromDate);
        } else if (fromDate) {
          return oldestDate >= fromDate;
        } else if (toDate) {
          return oldestDate <= toDate;
        }
        return true;
      });
    }

    // Apply balance, invoice count, and days overdue filters with logic operator
    if (filters.logicOperator === 'AND') {
      filtered = filtered.filter(customer => {
        const balanceMatch = (customer.balance || 0) >= filters.minBalance &&
                            (filters.maxBalance === Infinity || (customer.balance || 0) <= filters.maxBalance);
        const invoiceMatch = (customer.invoice_count || 0) >= filters.minInvoiceCount &&
                            (filters.maxInvoiceCount === Infinity || (customer.invoice_count || 0) <= filters.maxInvoiceCount);
        const overdueMatch = (customer.max_days_overdue || 0) >= filters.minDaysOverdue &&
                            (filters.maxDaysOverdue === Infinity || (customer.max_days_overdue || 0) <= filters.maxDaysOverdue);
        return balanceMatch && invoiceMatch && overdueMatch;
      });
    } else {
      filtered = filtered.filter(customer => {
        const balanceMatch = (customer.balance || 0) >= filters.minBalance &&
                            (filters.maxBalance === Infinity || (customer.balance || 0) <= filters.maxBalance);
        const invoiceMatch = (customer.invoice_count || 0) >= filters.minInvoiceCount &&
                            (filters.maxInvoiceCount === Infinity || (customer.invoice_count || 0) <= filters.maxInvoiceCount);
        const overdueMatch = (customer.max_days_overdue || 0) >= filters.minDaysOverdue &&
                            (filters.maxDaysOverdue === Infinity || (customer.max_days_overdue || 0) <= filters.maxDaysOverdue);
        return balanceMatch || invoiceMatch || overdueMatch;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      const sortBy = filters.sortBy;

      if (sortBy === 'balance') {
        comparison = (a.balance || 0) - (b.balance || 0);
      } else if (sortBy === 'invoice_count') {
        comparison = (a.invoice_count || 0) - (b.invoice_count || 0);
      } else if (sortBy === 'max_days_overdue') {
        comparison = (a.max_days_overdue || 0) - (b.max_days_overdue || 0);
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'email') {
        comparison = a.email.localeCompare(b.email);
      } else if (sortBy === 'created_at') {
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    setFilteredCustomers(filtered);
    setTotalCount(filtered.length);
    loadAnalytics(filtered);

    // Paginate
    const start = currentPage * pageSize;
    const end = start + pageSize;
    setCustomers(filtered.slice(start, end));
  }, [allCustomers, filters, searchQuery, currentPage, pageSize, loadAnalytics]);

  const handleSearch = () => {
    setCurrentPage(0);
    setIsSearching(!!searchQuery.trim());
    applyFilters();
  };

  const goToNextPage = () => {
    if ((currentPage + 1) * pageSize < totalCount) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
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
    if (filters.sortBy !== column) {
      return <ArrowUpDown size={14} className="text-gray-400" />;
    }
    return filters.sortOrder === 'asc' ?
      <ArrowUp size={14} className="text-blue-600" /> :
      <ArrowDown size={14} className="text-blue-600" />;
  };

  const resetFilters = () => {
    setFilters({
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
    });
    setSearchQuery('');
    setCurrentPage(0);
  };

  const applyPresetFilter = (preset: typeof PRESET_FILTERS[0]) => {
    setFilters({
      ...filters,
      minBalance: preset.filter.minBalance,
      maxBalance: preset.filter.maxBalance,
      minInvoiceCount: preset.filter.minInvoiceCount,
      maxInvoiceCount: preset.filter.maxInvoiceCount,
      minInvoiceAmount: preset.filter.minInvoiceAmount,
      maxInvoiceAmount: preset.filter.maxInvoiceAmount,
      minDaysOverdue: preset.filter.minDaysOverdue,
      maxDaysOverdue: preset.filter.maxDaysOverdue,
      logicOperator: preset.logic || 'AND'
    });
    setCurrentPage(0);
    setShowFilters(true);
  };

  const handleCreate = () => {
    setEditingCustomer(null);
    setFormData({ name: '', email: '' });
    setShowForm(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer? This will also delete all their assignments and email logs.')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadCustomersWithAnalytics();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error deleting customer');
    }
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: !currentValue })
        .eq('id', id);

      if (error) throw error;

      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, is_active: !currentValue } : c));
    } catch (error) {
      console.error('Error updating customer status:', error);
      alert('Error updating customer status');
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleResponded = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customers')
        .update({ responded_this_month: !currentValue })
        .eq('id', id);

      if (error) throw error;

      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, responded_this_month: !currentValue } : c));
    } catch (error) {
      console.error('Error updating response status:', error);
      alert('Error updating response status');
    } finally {
      setUpdating(null);
    }
  };

  const handleUnpostpone = async (id: string) => {
    if (!confirm('Remove the postponement for this customer? They will start receiving scheduled emails again.')) return;

    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          postpone_until: null,
          postpone_reason: null
        })
        .eq('id', id);

      if (error) throw error;

      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, postpone_until: null, postpone_reason: null } : c));
    } catch (error) {
      console.error('Error removing postponement:', error);
      alert('Error removing postponement');
    } finally {
      setUpdating(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Please enter a customer name');
      return;
    }

    if (!formData.email.trim()) {
      alert('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({
            name: formData.name,
            email: formData.email,
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert({
            name: formData.name,
            email: formData.email,
          });

        if (error) throw error;
      }

      setShowForm(false);
      await loadCustomersWithAnalytics();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      if (error.code === '23505') {
        alert('A customer with this email already exists');
      } else {
        alert('Error saving customer');
      }
    }
  };

  const loadScheduledEmails = async (customerId: string) => {
    setLoadingSchedule(true);
    try {
      const { data, error } = await supabase
        .from('customer_assignments')
        .select(`
          id,
          start_day_of_month,
          timezone,
          email_formulas!inner (
            name,
            schedule
          ),
          email_templates!inner (
            name
          )
        `)
        .eq('customer_id', customerId)
        .eq('is_active', true);

      if (error) throw error;

      const upcomingEmails: ScheduledEmail[] = [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      data?.forEach((assignment: any) => {
        const startDay = assignment.start_day_of_month;
        const schedule = assignment.email_formulas?.schedule || [];

        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
          const targetDate = new Date(currentYear, currentMonth + monthOffset, startDay);

          schedule.forEach((scheduleItem: any) => {
            const times = scheduleItem.times || [];

            times.forEach((sendTime: string) => {
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

      upcomingEmails.sort((a, b) =>
        new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
      );

      setScheduledEmails(upcomingEmails.slice(0, 10));
    } catch (error) {
      console.error('Error loading scheduled emails:', error);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredCustomers.map((customer, index) => ({
      'Rank': index + 1,
      'Customer Name': customer.name,
      'Email': customer.email,
      'Active': customer.is_active ? 'Yes' : 'No',
      'Responded This Month': customer.responded_this_month ? 'Yes' : 'No',
      'Customer ID': customer.customer_id || customer.id,
      'Open Invoices': customer.invoice_count || 0,
      'Outstanding Balance': customer.balance || 0,
      'Max Days Overdue': customer.max_days_overdue || 0,
      'Oldest Invoice Date': customer.oldest_invoice_date || 'N/A',
      'Newest Invoice Date': customer.newest_invoice_date || 'N/A',
      'Created': new Date(customer.created_at).toLocaleDateString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    XLSX.writeFile(workbook, `customers_analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const activeFilterCount = [
    filters.minBalance > 0,
    filters.maxBalance !== Infinity,
    filters.minInvoiceCount > 0,
    filters.maxInvoiceCount !== Infinity,
    filters.minInvoiceAmount > 0,
    filters.maxInvoiceAmount !== Infinity,
    filters.minDaysOverdue > 0,
    filters.maxDaysOverdue !== Infinity,
    filters.dateFrom !== '',
    filters.dateTo !== '',
    searchQuery.trim() !== ''
  ].filter(Boolean).length;

  if (viewingSchedule) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => {
              setViewingSchedule(null);
              setScheduledEmails([]);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            Back to Customers
          </button>

          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-600 p-2 rounded-lg">
                  <Clock size={24} className="text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Upcoming Emails</h2>
                  <p className="text-gray-600">{viewingSchedule.name}</p>
                </div>
              </div>
              <button
                onClick={() => loadScheduledEmails(viewingSchedule.id)}
                disabled={loadingSchedule}
                className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-lg transition-colors"
              >
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
                    <div
                      key={email.id}
                      className={`p-4 rounded-lg border transition-all ${
                        isToday
                          ? 'bg-orange-50 border-orange-300'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Mail size={16} className={isToday ? 'text-orange-600' : 'text-blue-600'} />
                          <span className={`text-sm font-medium ${isToday ? 'text-orange-800' : 'text-gray-900'}`}>
                            {email.template_name}
                          </span>
                        </div>
                        {isToday && (
                          <span className="px-2 py-0.5 bg-orange-200 border border-orange-400 text-orange-800 text-xs rounded">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={12} />
                          <span>
                            {scheduledDate.toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock size={12} />
                          <span>
                            {scheduledDate.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })} ({email.timezone?.replace('America/', '').replace('_', ' ') || 'UTC'})
                          </span>
                        </div>
                        <div className="text-gray-500">
                          Formula: {email.formula_name}
                        </div>
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
              You do not have permission to view Customers.
            </p>
            <p className="text-sm text-gray-500">
              Please contact your administrator if you believe you should have access to this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (viewingFiles) {
    return (
      <CustomerFiles
        customerId={viewingFiles.id}
        customerName={viewingFiles.name}
        onBack={() => setViewingFiles(null)}
      />
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setShowForm(false)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Customers
          </button>

          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., john@example.com"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="max-w-[95%] mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-blue-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Customers & Analytics</h1>
              <p className="text-gray-600">Manage customers with real-time analytics and filtering</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showAnalytics ? 'bg-blue-600 text-white' : 'bg-white border-2 border-blue-600 text-blue-600'
              }`}
            >
              <TrendingUp size={18} />
              {showAnalytics ? 'Hide Analytics' : 'Show Analytics'}
            </button>
            <button
              onClick={exportToExcel}
              disabled={loading || filteredCustomers.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Download size={18} />
              Export to Excel
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-600 text-white' : 'bg-white border-2 border-blue-600 text-blue-600'
              }`}
            >
              <Filter size={18} />
              Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <button
              onClick={() => loadCustomersWithAnalytics()}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add Customer
            </button>
          </div>
        </div>

        {/* Analytics Stats Cards */}
        {showAnalytics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Total Customers</span>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.total_customers.toLocaleString()}</p>
              <p className="text-sm text-gray-600 mt-1">{stats.active_customers.toLocaleString()} active</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">With Debt</span>
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.customers_with_debt.toLocaleString()}</p>
              <p className="text-sm text-gray-600 mt-1">{stats.total_open_invoices.toLocaleString()} open invoices</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Total Balance Owed</span>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                ${stats.total_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-600 mt-1">{stats.customers_with_debt.toLocaleString()} customers</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-600 font-medium text-sm">Avg Balance</span>
                <TrendingUp className="w-5 h-5 text-cyan-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                ${stats.avg_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-600 mt-1">per customer with debt</p>
            </div>
          </div>
        )}

        {/* Preset Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          {PRESET_FILTERS.map((preset, index) => (
            <button
              key={index}
              onClick={() => applyPresetFilter(preset)}
              className="px-4 py-2 bg-white border-2 border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors text-sm font-medium"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Advanced Filters</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="col-span-full">
                <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Customer Total Balance Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Min Balance</label>
                <input
                  type="number"
                  value={filters.minBalance || ''}
                  onChange={(e) => setFilters({ ...filters, minBalance: Number(e.target.value) || 0 })}
                  placeholder="e.g., 500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Balance</label>
                <input
                  type="number"
                  value={filters.maxBalance === Infinity ? '' : filters.maxBalance}
                  onChange={(e) => setFilters({ ...filters, maxBalance: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 10000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="col-span-full mt-4">
                <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Individual Invoice Amount Range</h4>
                <p className="text-xs text-gray-600 mb-3">
                  Filter customers by their individual invoice amounts. Only invoices within this range will be counted.
                  Example: Min $30, Max $2000 will show customers who have invoices between $30-$2000, and only those invoices will be included in the balance and count.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Min Invoice Amount</label>
                <input
                  type="number"
                  value={filters.minInvoiceAmount || ''}
                  onChange={(e) => setFilters({ ...filters, minInvoiceAmount: Number(e.target.value) || 0 })}
                  placeholder="e.g., 30"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Invoice Amount</label>
                <input
                  type="number"
                  value={filters.maxInvoiceAmount === Infinity ? '' : filters.maxInvoiceAmount}
                  onChange={(e) => setFilters({ ...filters, maxInvoiceAmount: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 2000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="col-span-full mt-4">
                <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Invoice Count Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Min Invoice Count</label>
                <input
                  type="number"
                  value={filters.minInvoiceCount || ''}
                  onChange={(e) => setFilters({ ...filters, minInvoiceCount: Number(e.target.value) || 0 })}
                  placeholder="e.g., 10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Invoice Count</label>
                <input
                  type="number"
                  value={filters.maxInvoiceCount === Infinity ? '' : filters.maxInvoiceCount}
                  onChange={(e) => setFilters({ ...filters, maxInvoiceCount: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="col-span-full mt-4">
                <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Days Overdue Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Min Days Overdue</label>
                <input
                  type="number"
                  value={filters.minDaysOverdue || ''}
                  onChange={(e) => setFilters({ ...filters, minDaysOverdue: Number(e.target.value) || 0 })}
                  placeholder="e.g., 30"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Max Days Overdue</label>
                <input
                  type="number"
                  value={filters.maxDaysOverdue === Infinity ? '' : filters.maxDaysOverdue}
                  onChange={(e) => setFilters({ ...filters, maxDaysOverdue: e.target.value ? Number(e.target.value) : Infinity })}
                  placeholder="e.g., 90"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="col-span-full mt-4">
                <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Invoice Date Range</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="col-span-full mt-4">
                <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-300">Additional Options</h4>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Filter Logic</label>
                <select
                  value={filters.logicOperator}
                  onChange={(e) => setFilters({ ...filters, logicOperator: e.target.value as 'AND' | 'OR' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="AND">AND (All conditions)</option>
                  <option value="OR">OR (Any condition)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="balance">Balance</option>
                  <option value="invoice_count">Invoice Count</option>
                  <option value="max_days_overdue">Days Overdue</option>
                  <option value="name">Customer Name</option>
                  <option value="email">Email</option>
                  <option value="created_at">Created Date</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Sort Order</label>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value as 'asc' | 'desc' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="desc">Highest First</option>
                  <option value="asc">Lowest First</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={resetFilters}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Reset All Filters
              </button>
              <div className="flex-1"></div>
              <div className="text-sm text-gray-600 py-2">
                Showing <span className="font-bold text-blue-600">{filteredCustomers.length}</span> of {grandTotalCustomers.toLocaleString()} customers
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by name, email, or customer ID..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              Search
            </button>
            {(isSearching || searchQuery) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearching(false);
                  setCurrentPage(0);
                }}
                className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Customers Table */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading customers...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-200">
            <Users className="text-gray-400 mx-auto mb-4" size={48} />
            <p className="text-gray-600 mb-4">No customers found</p>
            {activeFilterCount > 0 ? (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            ) : (
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus size={18} />
                Add Your First Customer
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Pagination Top */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 0 || loading}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
                Previous
              </button>
              <span className="text-gray-600 font-medium">
                Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)} • Showing {Math.min(currentPage * pageSize + 1, totalCount)}-{Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount}
              </span>
              <button
                onClick={goToNextPage}
                disabled={(currentPage + 1) * pageSize >= totalCount || loading}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
              >
                Next
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200 sticky top-0">
                  <tr>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Customer</span>
                        {getSortIcon('name')}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-gray-700 font-semibold text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('email')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Email</span>
                        {getSortIcon('email')}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-4 text-gray-700 font-semibold text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('invoice_count')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Invoices</span>
                        {getSortIcon('invoice_count')}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-4 text-gray-700 font-semibold text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('balance')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Balance</span>
                        {getSortIcon('balance')}
                      </div>
                    </th>
                    <th
                      className="text-right py-3 px-4 text-gray-700 font-semibold text-sm cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('max_days_overdue')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Days Overdue</span>
                        {getSortIcon('max_days_overdue')}
                      </div>
                    </th>
                    <th className="text-center py-3 px-4 text-gray-700 font-semibold text-sm">Active</th>
                    <th className="text-center py-3 px-4 text-gray-700 font-semibold text-sm">Responded</th>
                    <th className="text-center py-3 px-4 text-gray-700 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer, index) => (
                    <tr key={customer.id} className={`border-b border-gray-200 hover:bg-blue-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-full bg-blue-100">
                            <Mail size={18} className="text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900 font-semibold">{customer.name}</span>
                              {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                                <button
                                  onClick={() => handleUnpostpone(customer.id)}
                                  disabled={updating === customer.id}
                                  className={`flex items-center gap-1 px-2 py-0.5 bg-yellow-100 border border-yellow-300 hover:bg-yellow-200 rounded text-xs text-yellow-800 transition-colors ${updating === customer.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={`${customer.postpone_reason || 'Postponed'} - Click to remove`}
                                >
                                  <PauseCircle size={12} />
                                  <span>Until {new Date(customer.postpone_until).toLocaleDateString()}</span>
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {customer.oldest_invoice_date && customer.newest_invoice_date && (
                                <span>{customer.oldest_invoice_date} → {customer.newest_invoice_date}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-700 text-sm">{customer.email}</td>
                      <td className="py-3 px-4 text-right text-gray-900 font-medium">
                        {customer.invoice_count || 0}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900 font-bold">
                        ${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-semibold ${
                          (customer.max_days_overdue || 0) > 90 ? 'text-red-600' :
                          (customer.max_days_overdue || 0) > 60 ? 'text-orange-600' :
                          (customer.max_days_overdue || 0) > 30 ? 'text-yellow-600' :
                          'text-gray-600'
                        }`}>
                          {customer.max_days_overdue || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleToggleActive(customer.id, customer.is_active)}
                            disabled={updating === customer.id}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                              customer.is_active ? 'bg-green-600' : 'bg-gray-300'
                            } ${updating === customer.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                customer.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleToggleResponded(customer.id, customer.responded_this_month)}
                            disabled={updating === customer.id}
                            className={`p-1 rounded-lg transition-colors ${
                              updating === customer.id ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
                            }`}
                          >
                            {customer.responded_this_month ? (
                              <CheckSquare className="text-green-600" size={20} />
                            ) : (
                              <Square className="text-gray-400" size={20} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-center gap-1">
                          {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                            <button
                              onClick={() => handleUnpostpone(customer.id)}
                              disabled={updating === customer.id}
                              className={`p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors ${updating === customer.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title="Remove Postponement"
                            >
                              <Play size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setViewingSchedule({ id: customer.id, name: customer.name });
                              loadScheduledEmails(customer.id);
                            }}
                            className="p-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                            title="View Schedule"
                          >
                            <Clock size={16} />
                          </button>
                          <button
                            onClick={() => setViewingFiles({ id: customer.id, name: customer.name })}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            title="View Files"
                          >
                            <FileText size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(customer)}
                            className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Bottom */}
            <div className="flex items-center justify-between p-4 border-t border-gray-200">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 0 || loading}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} />
                Previous
              </button>
              <span className="text-gray-600 font-medium">
                Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)}
              </span>
              <button
                onClick={goToNextPage}
                disabled={(currentPage + 1) * pageSize >= totalCount || loading}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
              >
                Next
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
