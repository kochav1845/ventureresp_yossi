import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, TrendingUp, DollarSign, Users, FileText, RefreshCw, ArrowUpDown, Search, Download, Filter, Menu, X, ExternalLink, ArrowDown, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { batchedInQuery } from '../lib/batchedQuery';
import { getAcumaticaInvoiceUrl } from '../lib/acumaticaLinks';
import * as XLSX from 'xlsx';
import { parseISO, format } from 'date-fns';

interface PaymentAnalyticsProps {
  onBack?: () => void;
}

interface PaymentRow {
  id: string;
  date: string;
  reference_number: string;
  customer_id: string;
  customer_name: string;
  payment_method: string;
  type: string;
  payment_amount: number;
  status: string;
  invoice_applications: string;
  total_applied: number;
  available_balance: number;
  description: string;
}

interface InvoiceApplication {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  invoice_reference_number: string;
  doc_type: string;
  amount_paid: number;
  invoice_date: string | null;
  created_at: string;
  invoice_balance?: number;
  invoice_amount?: number;
  invoice_status?: string;
  invoice_due_date?: string | null;
}

type SortField = keyof PaymentRow;
type SortDirection = 'asc' | 'desc';

const formatDateString = (dateString: string): string => {
  if (!dateString) return 'N/A';
  try {
    if (dateString.includes('T') || dateString.includes(' ')) {
      const date = new Date(dateString);
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      const year = date.getUTCFullYear();
      return `${month}/${day}/${year}`;
    }
    const [year, month, day] = dateString.split('-');
    return `${parseInt(month)}/${parseInt(day)}/${year}`;
  } catch (error) {
    return dateString;
  }
};

export default function PaymentAnalytics({ onBack }: PaymentAnalyticsProps) {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [calendarView, setCalendarView] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyAggregates, setMonthlyAggregates] = useState<{month: number, total: number, count: number}[]>([]);
  const [yearlyAggregates, setYearlyAggregates] = useState<{year: number, total: number, count: number}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [fetchingApplications, setFetchingApplications] = useState(false);
  const [fetchResult, setFetchResult] = useState<any>(null);
  const [fetchingAttachments, setFetchingAttachments] = useState(false);
  const [attachmentResult, setAttachmentResult] = useState<any>(null);
  const [loadingMorePayments, setLoadingMorePayments] = useState(false);
  const [hasMorePayments, setHasMorePayments] = useState(false);
  const [loadingBatchInfo, setLoadingBatchInfo] = useState<string>('');

  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [monthlyPaymentCount, setMonthlyPaymentCount] = useState(0);
  const [monthlyCustomerCount, setMonthlyCustomerCount] = useState(0);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('all');
  const [filterInvoicePeriod, setFilterInvoicePeriod] = useState<string>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Temporary filter states (not yet applied)
  const [tempDateFrom, setTempDateFrom] = useState('');
  const [tempDateTo, setTempDateTo] = useState('');
  const [tempFilterStatus, setTempFilterStatus] = useState<string>('all');
  const [tempFilterType, setTempFilterType] = useState<string>('all');
  const [tempFilterPaymentMethod, setTempFilterPaymentMethod] = useState<string>('all');
  const [tempFilterInvoicePeriod, setTempFilterInvoicePeriod] = useState<string>('all');

  // Applied filter states (triggers data reload)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [invoiceApplications, setInvoiceApplications] = useState<InvoiceApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);

  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState(false);
  const [analyticsMode, setAnalyticsMode] = useState<'payment_timing' | 'open_invoices'>('payment_timing');
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [filteredAnalyticsData, setFilteredAnalyticsData] = useState<any[]>([]);
  const [openInvoiceAnalytics, setOpenInvoiceAnalytics] = useState<any[]>([]);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsDateRange, setAnalyticsDateRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [analyticsGroupBy, setAnalyticsGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const [analyticsPaymentDateFrom, setAnalyticsPaymentDateFrom] = useState('');
  const [analyticsPaymentDateTo, setAnalyticsPaymentDateTo] = useState('');
  const [analyticsMinAmount, setAnalyticsMinAmount] = useState('');
  const [analyticsMaxAmount, setAnalyticsMaxAmount] = useState('');
  const [analyticsCustomerFilter, setAnalyticsCustomerFilter] = useState<'all' | 'include' | 'exclude'>('all');
  const [analyticsSelectedCustomers, setAnalyticsSelectedCustomers] = useState<string[]>([]);
  const [analyticsTimingFilter, setAnalyticsTimingFilter] = useState<string>('all');
  const [analyticsCustomDaysMin, setAnalyticsCustomDaysMin] = useState('');
  const [analyticsCustomDaysMax, setAnalyticsCustomDaysMax] = useState('');
  const [analyticsShowOnlyOverdue, setAnalyticsShowOnlyOverdue] = useState(true);
  const [showAnalyticsFilters, setShowAnalyticsFilters] = useState(true);

  const [appliedPaymentDateFrom, setAppliedPaymentDateFrom] = useState('');

  // Analytics table sorting
  const [analyticsSortField, setAnalyticsSortField] = useState<string>('payment_date');
  const [analyticsSortDirection, setAnalyticsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [appliedPaymentDateTo, setAppliedPaymentDateTo] = useState('');
  const [appliedMinAmount, setAppliedMinAmount] = useState('');
  const [appliedMaxAmount, setAppliedMaxAmount] = useState('');
  const [appliedCustomerFilter, setAppliedCustomerFilter] = useState<'all' | 'include' | 'exclude'>('all');
  const [appliedSelectedCustomers, setAppliedSelectedCustomers] = useState<string[]>([]);
  const [appliedTimingFilter, setAppliedTimingFilter] = useState<string>('all');
  const [appliedCustomDaysMin, setAppliedCustomDaysMin] = useState('');
  const [appliedCustomDaysMax, setAppliedCustomDaysMax] = useState('');
  const [appliedShowOnlyOverdue, setAppliedShowOnlyOverdue] = useState(true);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // View mode state
  const [viewMode, setViewMode] = useState<'payment' | 'application'>('payment');
  const [applicationRows, setApplicationRows] = useState<any[]>([]);
  const [filteredApplicationRows, setFilteredApplicationRows] = useState<any[]>([]);

  // Customer exclusions
  const [excludedCustomerIds, setExcludedCustomerIds] = useState<Set<string>>(new Set());
  const [excludedCustomersWithReasons, setExcludedCustomersWithReasons] = useState<Map<string, { notes: string; excluded_at: string }>>(new Map());
  const [exclusionBannerDismissed, setExclusionBannerDismissed] = useState(false);

  // Intersection observer for infinite scroll
  const observer = useRef<IntersectionObserver | null>(null);

  const loadMorePayments = async () => {
    // Stub function - all payments are loaded at once
    // This could be implemented for pagination if needed
    console.log('Load more payments called');
  };

  const lastPaymentRef = useCallback((node: HTMLTableRowElement) => {
    if (loading || loadingMorePayments) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMorePayments && !loadingMorePayments) {
        loadMorePayments();
      }
    });

    if (node) observer.current.observe(node);
  }, [loading, loadingMorePayments, hasMorePayments]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

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

  useEffect(() => {
    loadExcludedCustomers();
    // Load banner dismissal state from localStorage
    const dismissed = localStorage.getItem('paymentAnalytics_exclusionBannerDismissed');
    if (dismissed === 'true') {
      setExclusionBannerDismissed(true);
    }
  }, []);

  // Load data based on view type
  useEffect(() => {
    const loadViewData = async () => {
      if (calendarView === 'monthly') {
        await loadMonthlyAggregates(selectedYear);
      } else if (calendarView === 'yearly') {
        await loadYearlyAggregates();
      } else {
        // Daily view - load detailed payments for the month
        await loadMonthlyData();
      }
    };
    loadViewData();
  }, [calendarView, selectedYear, selectedMonth, dateFrom, dateTo, excludedCustomerIds]);

  useEffect(() => {
    filterAndSortPayments();
  }, [payments, searchTerm, sortField, sortDirection, filterStatus, filterType, filterPaymentMethod, filterInvoicePeriod, selectedDate, excludedCustomerIds]);

  // Create application rows when filtered payments change
  useEffect(() => {
    if (viewMode === 'application') {
      createApplicationRows(filteredPayments);
    }
  }, [filteredPayments, viewMode]);

  // Filter application rows based on search term
  useEffect(() => {
    if (viewMode === 'application') {
      let filtered = [...applicationRows];

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(app =>
          app.invoice_reference_number?.toLowerCase().includes(search) ||
          app.payment_reference?.toLowerCase().includes(search) ||
          app.customer_name?.toLowerCase().includes(search) ||
          app.customer_id?.toLowerCase().includes(search) ||
          app.payment_method?.toLowerCase().includes(search) ||
          app.doc_type?.toLowerCase().includes(search)
        );
      }

      setFilteredApplicationRows(filtered);
    }
  }, [applicationRows, searchTerm, viewMode]);

  useEffect(() => {
    filterAnalyticsData();
  }, [analyticsData, appliedPaymentDateFrom, appliedPaymentDateTo, appliedMinAmount, appliedMaxAmount, appliedCustomerFilter, appliedSelectedCustomers, appliedTimingFilter, appliedCustomDaysMin, appliedCustomDaysMax, appliedShowOnlyOverdue, excludedCustomerIds, analyticsSortField, analyticsSortDirection]);

  // Update summary stats based on filtered payments (including date selection)
  useEffect(() => {
    const total = filteredPayments.reduce((sum, p) => sum + p.payment_amount, 0);
    const uniqueCustomers = new Set(filteredPayments.map(p => p.customer_id).filter(Boolean));

    setMonthlyTotal(total);
    setMonthlyPaymentCount(filteredPayments.length);
    setMonthlyCustomerCount(uniqueCustomers.size);
  }, [filteredPayments]);

  // Initialize temp filters with applied filter values on mount
  useEffect(() => {
    setTempFilterStatus(filterStatus);
    setTempFilterType(filterType);
    setTempFilterPaymentMethod(filterPaymentMethod);
    setTempFilterInvoicePeriod(filterInvoicePeriod);
    setTempDateFrom(dateFrom);
    setTempDateTo(dateTo);
  }, []);

  const filterAnalyticsData = () => {
    let filtered = [...analyticsData];

    // Filter out excluded customers
    if (excludedCustomerIds.size > 0) {
      filtered = filtered.filter(app => !excludedCustomerIds.has(app.customer_id));
    }

    if (appliedPaymentDateFrom) {
      filtered = filtered.filter(app => new Date(app.payment_date) >= new Date(appliedPaymentDateFrom));
    }

    if (appliedPaymentDateTo) {
      filtered = filtered.filter(app => new Date(app.payment_date) <= new Date(appliedPaymentDateTo));
    }

    if (appliedMinAmount) {
      const min = parseFloat(appliedMinAmount);
      if (!isNaN(min)) {
        filtered = filtered.filter(app => app.amount_paid >= min);
      }
    }

    if (appliedMaxAmount) {
      const max = parseFloat(appliedMaxAmount);
      if (!isNaN(max)) {
        filtered = filtered.filter(app => app.amount_paid <= max);
      }
    }

    if (appliedCustomerFilter !== 'all' && appliedSelectedCustomers.length > 0) {
      if (appliedCustomerFilter === 'include') {
        filtered = filtered.filter(app => appliedSelectedCustomers.includes(app.customer));
      } else if (appliedCustomerFilter === 'exclude') {
        filtered = filtered.filter(app => !appliedSelectedCustomers.includes(app.customer));
      }
    }

    if (appliedTimingFilter !== 'all') {
      filtered = filtered.filter(app => app.days_to_pay !== null);

      if (appliedTimingFilter === 'below_30') {
        filtered = filtered.filter(app => app.days_to_pay < 30);
      } else if (appliedTimingFilter === '30_60') {
        filtered = filtered.filter(app => app.days_to_pay >= 30 && app.days_to_pay <= 60);
      } else if (appliedTimingFilter === '60_90') {
        filtered = filtered.filter(app => app.days_to_pay > 60 && app.days_to_pay <= 90);
      } else if (appliedTimingFilter === 'above_90') {
        filtered = filtered.filter(app => app.days_to_pay > 90);
      } else if (appliedTimingFilter === 'custom') {
        const min = appliedCustomDaysMin ? parseInt(appliedCustomDaysMin) : null;
        const max = appliedCustomDaysMax ? parseInt(appliedCustomDaysMax) : null;

        if (min !== null && max !== null) {
          filtered = filtered.filter(app => app.days_to_pay >= min && app.days_to_pay <= max);
        } else if (min !== null) {
          filtered = filtered.filter(app => app.days_to_pay >= min);
        } else if (max !== null) {
          filtered = filtered.filter(app => app.days_to_pay <= max);
        }
      }
    }

    // Apply overdue filter (only show payments paid after their due date)
    if (appliedShowOnlyOverdue) {
      filtered = filtered.filter(app => app.is_overdue === true);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal = a[analyticsSortField];
      let bVal = b[analyticsSortField];

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      // Handle numeric fields
      if (analyticsSortField === 'days_to_pay' || analyticsSortField === 'amount_paid') {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }

      // Handle date fields
      if (analyticsSortField === 'payment_date' || analyticsSortField === 'invoice_date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return analyticsSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return analyticsSortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredAnalyticsData(filtered);
  };

  const applyAnalyticsFilters = () => {
    const datesChanged =
      appliedPaymentDateFrom !== analyticsPaymentDateFrom ||
      appliedPaymentDateTo !== analyticsPaymentDateTo;

    setAppliedPaymentDateFrom(analyticsPaymentDateFrom);
    setAppliedPaymentDateTo(analyticsPaymentDateTo);
    setAppliedMinAmount(analyticsMinAmount);
    setAppliedMaxAmount(analyticsMaxAmount);
    setAppliedCustomerFilter(analyticsCustomerFilter);
    setAppliedSelectedCustomers(analyticsSelectedCustomers);
    setAppliedTimingFilter(analyticsTimingFilter);
    setAppliedCustomDaysMin(analyticsCustomDaysMin);
    setAppliedCustomDaysMax(analyticsCustomDaysMax);
    setAppliedShowOnlyOverdue(analyticsShowOnlyOverdue);

    // If date filters changed, reload data from database based on mode
    if (datesChanged) {
      if (analyticsMode === 'payment_timing') {
        loadAnalyticsDashboard();
      } else {
        loadOpenInvoiceAnalytics();
      }
    }
  };

  const clearAnalyticsFilters = () => {
    const hadDateFilters = appliedPaymentDateFrom || appliedPaymentDateTo;

    setAnalyticsPaymentDateFrom('');
    setAnalyticsPaymentDateTo('');
    setAnalyticsMinAmount('');
    setAnalyticsMaxAmount('');
    setAnalyticsCustomerFilter('all');
    setAnalyticsSelectedCustomers([]);
    setAnalyticsTimingFilter('all');
    setAnalyticsCustomDaysMin('');
    setAnalyticsCustomDaysMax('');
    setAnalyticsShowOnlyOverdue(true);
    setAppliedPaymentDateFrom('');
    setAppliedPaymentDateTo('');
    setAppliedMinAmount('');
    setAppliedMaxAmount('');
    setAppliedCustomerFilter('all');
    setAppliedSelectedCustomers([]);
    setAppliedTimingFilter('all');
    setAppliedCustomDaysMin('');
    setAppliedCustomDaysMax('');
    setAppliedShowOnlyOverdue(true);

    // If we had date filters, reload with default range based on mode
    if (hadDateFilters) {
      if (analyticsMode === 'payment_timing') {
        setTimeout(() => loadAnalyticsDashboard(), 0);
      } else {
        setTimeout(() => loadOpenInvoiceAnalytics(), 0);
      }
    }
  };

  const fetchMonthApplications = async () => {
    setFetchingApplications(true);
    setFetchResult(null);
    try {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-month-applications`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ month, year })
      });

      const result = await response.json();
      setFetchResult(result);

      if (result.success) {
        await loadMonthlyData();
      }
    } catch (error: any) {
      console.error('Error fetching applications:', error);
      setFetchResult({ success: false, error: error.message });
    } finally {
      setFetchingApplications(false);
    }
  };

  const fetchMonthAttachments = async () => {
    setFetchingAttachments(true);
    setAttachmentResult(null);
    try {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      // Get all payments for the selected month
      const { data: monthPayments, error } = await supabase
        .from('acumatica_payments')
        .select('reference_number')
        .neq('status', 'Voided')
        .gte('application_date', startDate.toISOString().split('T')[0])
        .lte('application_date', endDate.toISOString().split('T')[0])
        .order('application_date', { ascending: true });

      if (error) throw error;

      if (!monthPayments || monthPayments.length === 0) {
        setAttachmentResult({ success: false, error: 'No payments found for this month' });
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-payment-attachments`;
      let successful = 0;
      let failed = 0;
      let noFiles = 0;

      for (const payment of monthPayments) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paymentRefNumber: payment.reference_number })
          });

          const result = await response.json();

          if (result.filesProcessed > 0) {
            successful++;
          } else if (result.filesProcessed === 0) {
            noFiles++;
          } else {
            failed++;
          }
        } catch (err) {
          failed++;
        }
      }

      setAttachmentResult({
        success: true,
        total: monthPayments.length,
        successful,
        failed,
        noFiles,
        message: `Processed ${monthPayments.length} payments: ${successful} with attachments, ${noFiles} without files, ${failed} failed`
      });

      await loadMonthlyData();
    } catch (error: any) {
      console.error('Error fetching attachments:', error);
      setAttachmentResult({ success: false, error: error.message });
    } finally {
      setFetchingAttachments(false);
    }
  };

  const loadMonthlyAggregates = async (year: number) => {
    setLoading(true);
    setLoadingBatchInfo('Loading monthly data...');
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const aggregates = Array.from({ length: 12 }, (_, month) => ({ month, total: 0, count: 0 }));

      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      let batchCount = 0;

      while (hasMore) {
        batchCount++;
        setLoadingBatchInfo(`Loading monthly data batch ${batchCount}...`);

        const { data, error } = await supabase
          .from('acumatica_payments')
          .select('application_date, payment_amount')
          .neq('type', 'Credit Memo')
          .neq('status', 'Voided')
          .gte('application_date', startStr)
          .lte('application_date', endStr)
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        data.forEach(payment => {
          const paymentDate = new Date(payment.application_date);
          const month = paymentDate.getMonth();
          aggregates[month].total += payment.payment_amount || 0;
          aggregates[month].count += 1;
        });

        if (data.length < batchSize) {
          hasMore = false;
        }

        offset += batchSize;
      }

      setMonthlyAggregates(aggregates);
    } catch (error) {
      console.error('Error loading monthly aggregates:', error);
    } finally {
      setLoading(false);
      setLoadingBatchInfo('');
    }
  };

  const loadYearlyAggregates = async () => {
    setLoading(true);
    setLoadingBatchInfo('Loading yearly data...');
    try {
      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear - 5, 0, 1);
      const endDate = new Date(currentYear, 11, 31);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const yearMap = new Map<number, { total: number, count: number }>();

      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      let batchCount = 0;

      while (hasMore) {
        batchCount++;
        setLoadingBatchInfo(`Loading yearly data batch ${batchCount}...`);

        const { data, error } = await supabase
          .from('acumatica_payments')
          .select('application_date, payment_amount')
          .neq('type', 'Credit Memo')
          .neq('status', 'Voided')
          .gte('application_date', startStr)
          .lte('application_date', endStr)
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        data.forEach(payment => {
          const paymentDate = new Date(payment.application_date);
          const year = paymentDate.getFullYear();

          if (!yearMap.has(year)) {
            yearMap.set(year, { total: 0, count: 0 });
          }

          const yearData = yearMap.get(year)!;
          yearData.total += payment.payment_amount || 0;
          yearData.count += 1;
        });

        if (data.length < batchSize) {
          hasMore = false;
        }

        offset += batchSize;
      }

      const aggregates = [];
      for (let year = currentYear; year >= currentYear - 5; year--) {
        const data = yearMap.get(year) || { total: 0, count: 0 };
        if (data.total > 0 || year === currentYear) {
          aggregates.push({ year, total: data.total, count: data.count });
        }
      }

      setYearlyAggregates(aggregates);
    } catch (error) {
      console.error('Error loading yearly aggregates:', error);
    } finally {
      setLoading(false);
      setLoadingBatchInfo('');
    }
  };

  const loadMonthlyData = async () => {
    setLoading(true);
    setLoadingBatchInfo('');
    setPayments([]); // Clear previous payments

    try {
      let startStr: string;
      let endStr: string;
      let useInclusiveEnd = false; // Flag to determine if we should include the end date

      // Use custom date range if provided, otherwise use selected month
      if (dateFrom && dateTo) {
        startStr = dateFrom;
        endStr = dateTo;
        useInclusiveEnd = true; // User-specified dates should be inclusive
        console.log(`Using custom date range: ${startStr} to ${endStr} (inclusive)`);
      } else if (dateFrom) {
        // If only start date provided, use it to current date
        startStr = dateFrom;
        endStr = new Date().toISOString().split('T')[0];
        useInclusiveEnd = true; // Include today
        console.log(`Using from date to today: ${startStr} to ${endStr} (inclusive)`);
      } else {
        // Default to selected month
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 1);
        startStr = startDate.toISOString().split('T')[0];
        endStr = endDate.toISOString().split('T')[0];
        useInclusiveEnd = false; // Exclude the first day of next month
        console.log(`Using selected month: ${startStr} to ${endStr} (exclusive)`);
      }

      // Fetch all payments in batches to avoid 1000-row limit
      let allPaymentRows: PaymentRow[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      let batchCount = 0;

      while (hasMore) {
        batchCount++;
        console.log(`Fetching payment batch ${batchCount}...`);
        setLoadingBatchInfo(`Loading batch ${batchCount}...`);

        // Build query with appropriate end date filter
        let query = supabase
          .from('acumatica_payments')
          .select('*')
          .neq('type', 'Credit Memo')
          .neq('status', 'Voided')
          .gte('application_date', startStr);

        // Use .lte() for inclusive end dates (custom range), .lt() for exclusive (month boundary)
        if (useInclusiveEnd) {
          query = query.lte('application_date', endStr);
        } else {
          query = query.lt('application_date', endStr);
        }

        const { data: batch, error } = await query
          .order('application_date', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          // Process this batch immediately
          const paymentIds = batch.map(p => p.id);

          // Fetch applications for this batch
          const applications = await batchedInQuery(
            supabase,
            'payment_invoice_applications',
            'payment_id, doc_type, amount_paid, invoice_reference_number',
            'payment_id',
            paymentIds
          );

          const applicationsByPayment = new Map<string, any[]>();
          applications?.forEach(app => {
            if (!applicationsByPayment.has(app.payment_id)) {
              applicationsByPayment.set(app.payment_id, []);
            }
            applicationsByPayment.get(app.payment_id)!.push(app);
          });

          // Fetch customer names for this batch
          const customerIds = [...new Set(batch.map(p => p.customer_id).filter(Boolean))];
          const { data: customers } = await supabase
            .from('acumatica_customers')
            .select('customer_id, customer_name')
            .in('customer_id', customerIds);

          const customerMap = new Map(customers?.map(c => [c.customer_id, c.customer_name]) || []);

          // Create payment rows for this batch
          const batchPaymentRows: PaymentRow[] = batch.map((payment: any) => {
            const apps = applicationsByPayment.get(payment.id) || [];
            const totalApplied = apps
              .filter(app => app.doc_type === 'Invoice')
              .reduce((sum, app) => sum + (parseFloat(app.amount_paid) || 0), 0);
            const invoiceList = apps.map(app => `${app.doc_type}: ${app.invoice_reference_number}`).join(', ');

            return {
              id: payment.id,
              date: payment.application_date || '',
              reference_number: payment.reference_number || '',
              customer_id: payment.customer_id || '',
              customer_name: customerMap.get(payment.customer_id) || payment.customer_id || 'N/A',
              payment_method: payment.payment_method || '',
              type: payment.type || 'Payment',
              payment_amount: parseFloat(payment.payment_amount) || 0,
              status: payment.status || '',
              invoice_applications: invoiceList || 'None',
              total_applied: totalApplied,
              available_balance: parseFloat(payment.available_balance) || 0,
              description: payment.description || ''
            };
          });

          // Append to all payments
          allPaymentRows = [...allPaymentRows, ...batchPaymentRows];

          // Update state immediately with current payments
          setPayments([...allPaymentRows]);
          console.log(`Loaded ${allPaymentRows.length} payments so far...`);
          setLoadingBatchInfo(`Loaded ${allPaymentRows.length} payments...`);

          // Update running totals (excluding excluded customers)
          const nonExcludedPayments = allPaymentRows.filter(p => !excludedCustomerIds.has(p.customer_id));
          const runningTotal = nonExcludedPayments.reduce((sum, p) => sum + p.payment_amount, 0);
          const runningUniqueCustomers = new Set(nonExcludedPayments.map(p => p.customer_id).filter(Boolean));

          setMonthlyTotal(runningTotal);
          setMonthlyPaymentCount(nonExcludedPayments.length);
          setMonthlyCustomerCount(runningUniqueCustomers.size);

          offset += batchSize;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`Total payments loaded: ${allPaymentRows.length}`);
    } catch (error) {
      console.error('Error loading monthly data:', error);
    } finally {
      setLoading(false);
      setLoadingBatchInfo('');
    }
  };

  const createApplicationRows = async (paymentsToProcess: PaymentRow[]) => {
    if (paymentsToProcess.length === 0) {
      setApplicationRows([]);
      return;
    }

    try {
      const paymentIds = paymentsToProcess.map(p => p.id);

      // Fetch all invoice applications for these payments
      const applications = await batchedInQuery(
        supabase,
        'payment_invoice_applications',
        '*',
        'payment_id',
        paymentIds
      );

      if (!applications || applications.length === 0) {
        setApplicationRows([]);
        return;
      }

      // Create a map of payments for quick lookup
      const paymentMap = new Map(paymentsToProcess.map(p => [p.id, p]));

      // Create flattened rows - one row per invoice application
      const flattenedRows = applications.map((app: any) => {
        const payment = paymentMap.get(app.payment_id);

        return {
          // Application-specific fields
          application_id: app.id,
          invoice_reference_number: app.invoice_reference_number,
          doc_type: app.doc_type,
          amount_paid: parseFloat(app.amount_paid) || 0,
          invoice_date: app.invoice_date,
          invoice_due_date: app.invoice_due_date,
          invoice_balance: app.invoice_balance,
          invoice_amount: app.invoice_amount,
          invoice_status: app.invoice_status,

          // Payment fields
          payment_id: app.payment_id,
          payment_date: payment?.date || '',
          payment_reference: payment?.reference_number || '',
          payment_amount: payment?.payment_amount || 0,
          payment_method: payment?.payment_method || '',
          payment_type: payment?.type || '',
          payment_status: payment?.status || '',
          payment_available_balance: payment?.available_balance || 0,
          payment_description: payment?.description || '',
          customer_id: payment?.customer_id || '',
          customer_name: payment?.customer_name || ''
        };
      });

      setApplicationRows(flattenedRows);
    } catch (error) {
      console.error('Error creating application rows:', error);
      setApplicationRows([]);
    }
  };

  const filterAndSortPayments = () => {
    let filtered = [...payments];

    // Filter out credit memos and voided payments
    filtered = filtered.filter(p => p.type !== 'Credit Memo' && p.status !== 'Voided');

    // Filter out excluded customers
    if (excludedCustomerIds.size > 0) {
      filtered = filtered.filter(p => !excludedCustomerIds.has(p.customer_id));
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.reference_number.toLowerCase().includes(search) ||
        p.customer_name.toLowerCase().includes(search) ||
        p.customer_id.toLowerCase().includes(search) ||
        p.payment_method.toLowerCase().includes(search) ||
        p.type.toLowerCase().includes(search) ||
        p.invoice_applications.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === filterStatus);
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.type === filterType);
    }

    if (filterPaymentMethod !== 'all') {
      filtered = filtered.filter(p => p.payment_method === filterPaymentMethod);
    }

    if (filterInvoicePeriod !== 'all') {
      filtered = filtered.filter(p => {
        // Filter by invoice applications containing invoices from specific period
        const apps = p.invoice_applications.toLowerCase();
        if (filterInvoicePeriod === 'has_applications') {
          return apps !== 'none' && apps !== '';
        } else if (filterInvoicePeriod === 'no_applications') {
          return apps === 'none' || apps === '';
        }
        return true;
      });
    }

    if (selectedDate) {
      const selectedDateStr = selectedDate.toISOString().split('T')[0];
      filtered = filtered.filter(p => p.date.split('T')[0] === selectedDateStr);
    }

    filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    setFilteredPayments(filtered);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getCalendarDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start on Sunday

    const days = [];
    const currentDate = new Date(startDate);

    while (currentDate <= lastDay || currentDate.getDay() !== 0) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
      if (days.length >= 42) break; // Max 6 weeks
    }

    return days;
  };

  const getDayPayments = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return payments.filter(p => p.type !== 'Credit Memo' && p.date.split('T')[0] === dateStr);
  };

  const getMonthlyData = () => {
    return monthlyAggregates.map(agg => ({
      month: agg.month,
      name: new Date(selectedYear, agg.month, 1).toLocaleDateString('en-US', { month: 'long' }),
      total: agg.total,
      count: agg.count
    }));
  };

  const getYearlyData = () => {
    return yearlyAggregates;
  };

  const previousPeriod = () => {
    if (calendarView === 'daily') {
      setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1));
    } else if (calendarView === 'monthly') {
      setSelectedYear(selectedYear - 1);
    } else if (calendarView === 'yearly') {
      // For yearly view, we could shift the range, but let's keep it simple for now
      setSelectedYear(selectedYear - 6);
    }
  };

  const nextPeriod = () => {
    if (calendarView === 'daily') {
      setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1));
    } else if (calendarView === 'monthly') {
      setSelectedYear(selectedYear + 1);
    } else if (calendarView === 'yearly') {
      setSelectedYear(selectedYear + 6);
    }
  };

  const exportToExcel = () => {
    if (viewMode === 'payment') {
      // Export payment view
      const exportData = filteredPayments.map(p => ({
        'Date': p.date,
        'Reference': p.reference_number,
        'Customer ID': p.customer_id,
        'Customer Name': p.customer_name,
        'Payment Method': p.payment_method,
        'Type': p.type,
        'Amount': p.payment_amount,
        'Status': p.status,
        'Invoice Applications': p.invoice_applications,
        'Total Applied': p.total_applied,
        'Available Balance': p.available_balance,
        'Description': p.description
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment Analytics');
      XLSX.writeFile(workbook, `payment_analytics_${selectedMonth.getFullYear()}_${selectedMonth.getMonth() + 1}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      // Export application view
      const exportData = filteredApplicationRows.map(app => ({
        'Payment Date': formatDateString(app.payment_date),
        'Payment Reference': app.payment_reference,
        'Customer ID': app.customer_id,
        'Customer Name': app.customer_name,
        'Payment Method': app.payment_method,
        'Payment Type': app.payment_type,
        'Payment Amount': app.payment_amount,
        'Payment Status': app.payment_status,
        'Invoice Reference': app.invoice_reference_number,
        'Document Type': app.doc_type,
        'Invoice Date': app.invoice_date ? formatDateString(app.invoice_date) : 'N/A',
        'Invoice Due Date': app.invoice_due_date ? formatDateString(app.invoice_due_date) : 'N/A',
        'Amount Applied': app.amount_paid,
        'Invoice Balance': app.invoice_balance != null ? app.invoice_balance : 'N/A',
        'Invoice Status': app.invoice_status || 'N/A'
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice Applications');
      XLSX.writeFile(workbook, `invoice_applications_${selectedMonth.getFullYear()}_${selectedMonth.getMonth() + 1}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const exportAnalyticsToExcel = () => {
    const exportData = filteredAnalyticsData.map(app => ({
      'Payment Date': app.payment_date ? formatDateString(app.payment_date) : 'N/A',
      'Invoice Date': app.invoice_date ? formatDateString(app.invoice_date) : 'N/A',
      'Days to Pay': app.days_to_pay !== null ? app.days_to_pay : 'N/A',
      'Payment Reference': app.payment_ref,
      'Invoice Reference': app.invoice_ref,
      'Customer': app.customer,
      'Amount': app.amount_paid,
      'Payment Method': app.payment_method,
      'Payment Type': app.payment_type || 'N/A',
      'Is Overdue': app.is_overdue ? 'Yes' : 'No'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payment Application Details');

    const dateRange = appliedPaymentDateFrom && appliedPaymentDateTo
      ? `${appliedPaymentDateFrom}_to_${appliedPaymentDateTo}`
      : appliedPaymentDateFrom
      ? `from_${appliedPaymentDateFrom}`
      : analyticsDateRange;

    XLSX.writeFile(workbook, `payment_application_details_${dateRange}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleAnalyticsSort = (field: string) => {
    if (analyticsSortField === field) {
      setAnalyticsSortDirection(analyticsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setAnalyticsSortField(field);
      setAnalyticsSortDirection('asc');
    }
  };

  const AnalyticsSortableHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      onClick={() => handleAnalyticsSort(field)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${analyticsSortField === field ? 'text-blue-600' : 'text-gray-400'}`} />
      </div>
    </th>
  );

  const monthName = selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const uniqueStatuses = ['all', ...new Set(payments.map(p => p.status).filter(Boolean))];
  const uniqueTypes = ['all', ...new Set(payments.map(p => p.type).filter(Boolean))];
  const uniquePaymentMethods = ['all', ...new Set(payments.map(p => p.payment_method).filter(Boolean))];

  const applyFilters = () => {
    setFilterStatus(tempFilterStatus);
    setFilterType(tempFilterType);
    setFilterPaymentMethod(tempFilterPaymentMethod);
    setFilterInvoicePeriod(tempFilterInvoicePeriod);
    setDateFrom(tempDateFrom);
    setDateTo(tempDateTo);
  };

  const clearFilters = () => {
    // Clear temp filters
    setTempFilterStatus('all');
    setTempFilterType('all');
    setTempFilterPaymentMethod('all');
    setTempFilterInvoicePeriod('all');
    setTempDateFrom('');
    setTempDateTo('');

    // Clear applied filters
    setFilterStatus('all');
    setFilterType('all');
    setFilterPaymentMethod('all');
    setFilterInvoicePeriod('all');
    setSearchTerm('');
    setSelectedDate(null);
    setDateFrom('');
    setDateTo('');
  };

  const loadAnalyticsDashboard = async () => {
    setLoadingAnalytics(true);
    try {
      let startStr: string;
      let endStr: string;

      // If custom date filters are set, use those instead of preset ranges
      if (analyticsPaymentDateFrom && analyticsPaymentDateTo) {
        startStr = new Date(analyticsPaymentDateFrom).toISOString();
        endStr = new Date(analyticsPaymentDateTo + 'T23:59:59').toISOString();
        console.log('Using custom date range for analytics:', startStr, 'to', endStr);
      } else if (analyticsPaymentDateFrom) {
        // If only start date, use it to current date
        startStr = new Date(analyticsPaymentDateFrom).toISOString();
        endStr = new Date().toISOString();
        console.log('Using from date to now for analytics:', startStr, 'to', endStr);
      } else {
        // Use preset ranges based on selection
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();

        let startDate: Date;
        let endDate: Date;

        if (analyticsDateRange === 'month') {
          startDate = new Date(year, month, 1);
          endDate = new Date(year, month + 1, 0, 23, 59, 59);
        } else if (analyticsDateRange === 'quarter') {
          const quarterStart = Math.floor(month / 3) * 3;
          startDate = new Date(year, quarterStart, 1);
          endDate = new Date(year, quarterStart + 3, 0, 23, 59, 59);
        } else {
          startDate = new Date(year, 0, 1);
          endDate = new Date(year, 11, 31, 23, 59, 59);
        }

        startStr = startDate.toISOString();
        endStr = endDate.toISOString();
        console.log('Using preset range for analytics:', analyticsDateRange, startStr, 'to', endStr);
      }

      // First, get payments in the date range - use batched fetching to avoid 1000-row limit
      let allPayments: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      console.log('Fetching payments for analytics...');

      while (hasMore) {
        const { data: batch, error: paymentsError } = await supabase
          .from('acumatica_payments')
          .select('id, reference_number, customer_id, payment_method, type, payment_amount, application_date, status')
          .neq('status', 'Voided')
          .gte('application_date', startStr)
          .lte('application_date', endStr)
          .not('application_date', 'is', null)
          .range(offset, offset + batchSize - 1);

        if (paymentsError) {
          console.error('Payments query error:', paymentsError);
          throw paymentsError;
        }

        if (batch && batch.length > 0) {
          allPayments = [...allPayments, ...batch];
          offset += batchSize;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      const payments = allPayments;
      console.log('Payments in range:', payments?.length);

      if (payments.length === 0) {
        console.log('No payments found in date range');
        setAnalyticsData([]);
        return;
      }

      // Fetch customer names using batched queries
      const customerIds = [...new Set(
        payments.map(p => p.customer_id).filter(Boolean)
      )];

      console.log('Customer IDs to fetch:', customerIds.length);

      const customers = await batchedInQuery(
        supabase,
        'acumatica_customers',
        'customer_id, customer_name, exclude_from_payment_analytics',
        'customer_id',
        customerIds
      );

      // Create maps for customer name and exclusion status
      const customerMap = new Map(
        customers?.map(c => [c.customer_id, c.customer_name]) || []
      );

      const excludedCustomerIds = new Set(
        customers?.filter(c => c.exclude_from_payment_analytics).map(c => c.customer_id) || []
      );

      // Filter out payments from excluded customers
      const filteredPayments = payments.filter(p => !excludedCustomerIds.has(p.customer_id));

      console.log('Payments after exclusion filter:', filteredPayments.length);

      if (filteredPayments.length === 0) {
        console.log('No payments found after applying exclusions');
        setAnalyticsData([]);
        return;
      }

      const paymentIds = filteredPayments.map(p => p.id);

      // Now get applications for those payments using batched queries
      console.log(`Fetching applications for ${paymentIds.length} payments in batches...`);
      const applications = await batchedInQuery(
        supabase,
        'payment_invoice_applications',
        'payment_id, amount_paid, invoice_reference_number, invoice_date, due_date, doc_type',
        'payment_id',
        paymentIds
      );

      console.log('Total applications found:', applications?.length);

      // Group applications by payment_id
      const applicationsByPayment = new Map<string, any[]>();
      applications?.forEach((app: any) => {
        if (!applicationsByPayment.has(app.payment_id)) {
          applicationsByPayment.set(app.payment_id, []);
        }
        applicationsByPayment.get(app.payment_id)!.push(app);
      });

      // Map over FILTERED PAYMENTS (excluding analytics-excluded customers)
      const enrichedData = filteredPayments.map((payment: any, index: number) => {
        const paymentApps = applicationsByPayment.get(payment.id) || [];

        // Use the first application's invoice date if available, otherwise null
        const firstApp = paymentApps[0];
        const invoiceDate = firstApp?.invoice_date || null;
        const invoiceDueDate = firstApp?.due_date || null;
        const invoiceRef = firstApp?.invoice_reference_number || null;
        const amountPaid = firstApp?.amount_paid || payment.payment_amount;

        const paymentDate = payment.application_date;

        if (index < 3) {
          console.log(`Processing payment ${index}:`, {
            payment_ref: payment.reference_number,
            invoice_ref: invoiceRef,
            invoice_date: invoiceDate,
            invoice_due_date: invoiceDueDate,
            payment_date: paymentDate,
            applications_count: paymentApps.length
          });
        }

        const daysCalculation = invoiceDate && paymentDate
          ? Math.floor((new Date(paymentDate).getTime() - new Date(invoiceDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // Calculate if payment is overdue (paid after due date)
        const isOverdue = invoiceDueDate && paymentDate
          ? new Date(paymentDate).getTime() > new Date(invoiceDueDate).getTime()
          : false;

        return {
          payment_date: paymentDate,
          invoice_date: invoiceDate,
          invoice_due_date: invoiceDueDate,
          invoice_ref: invoiceRef,
          payment_ref: payment.reference_number,
          customer: customerMap.get(payment.customer_id) || payment.customer_id,
          amount_paid: parseFloat(amountPaid || 0),
          payment_method: payment.payment_method,
          doc_type: firstApp?.doc_type || payment.type,
          payment_amount: parseFloat(payment.payment_amount || 0),
          days_to_pay: daysCalculation,
          has_applications: paymentApps.length > 0,
          is_overdue: isOverdue
        };
      }).filter(payment => payment.payment_date !== null);

      console.log('Enriched data count (all payments):', enrichedData.length);
      console.log('Payments with applications:', enrichedData.filter(p => p.has_applications).length);
      console.log('Sample enriched data:', enrichedData.slice(0, 3));

      setAnalyticsData(enrichedData);
    } catch (error) {
      console.error('Error loading analytics:', error);
      setAnalyticsData([]);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadOpenInvoiceAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      let startStr: string;
      let endStr: string;

      // Use same date logic as payment timing analytics
      if (analyticsPaymentDateFrom && analyticsPaymentDateTo) {
        startStr = new Date(analyticsPaymentDateFrom).toISOString();
        endStr = new Date(analyticsPaymentDateTo + 'T23:59:59').toISOString();
      } else if (analyticsPaymentDateFrom) {
        startStr = new Date(analyticsPaymentDateFrom).toISOString();
        endStr = new Date().toISOString();
      } else {
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();

        let startDate: Date;
        let endDate: Date;

        if (analyticsDateRange === 'month') {
          startDate = new Date(year, month, 1);
          endDate = new Date(year, month + 1, 0, 23, 59, 59);
        } else if (analyticsDateRange === 'quarter') {
          const quarterStart = Math.floor(month / 3) * 3;
          startDate = new Date(year, quarterStart, 1);
          endDate = new Date(year, quarterStart + 3, 0, 23, 59, 59);
        } else {
          startDate = new Date(year, 0, 1);
          endDate = new Date(year, 11, 31, 23, 59, 59);
        }

        startStr = startDate.toISOString();
        endStr = endDate.toISOString();
      }

      console.log('Loading open invoices for period:', startStr, 'to', endStr);

      // Fetch invoices that were created in the date range and still have balance > 0
      let allInvoices: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, customer, customer_name, date, due_date, balance, amount, status')
          .gte('date', startStr)
          .lte('date', endStr)
          .gt('balance', 0)
          .order('customer_name', { ascending: true })
          .range(offset, offset + batchSize - 1);

        if (error) throw error;

        if (batch && batch.length > 0) {
          allInvoices = [...allInvoices, ...batch];
          offset += batchSize;
          hasMore = batch.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      console.log('Found', allInvoices.length, 'open invoices from that period');

      // Group by customer
      const customerMap = new Map<string, any>();

      allInvoices.forEach(invoice => {
        const customerKey = invoice.customer_name || invoice.customer || 'Unknown';

        if (!customerMap.has(customerKey)) {
          customerMap.set(customerKey, {
            customer_name: customerKey,
            customer_id: invoice.customer,
            invoice_count: 0,
            total_balance: 0,
            invoices: []
          });
        }

        const customer = customerMap.get(customerKey);
        customer.invoice_count++;
        customer.total_balance += parseFloat(invoice.balance || 0);
        customer.invoices.push(invoice);
      });

      // Convert to array and sort by total balance descending
      const customerAnalytics = Array.from(customerMap.values())
        .sort((a, b) => b.total_balance - a.total_balance);

      console.log('Grouped into', customerAnalytics.length, 'customers');
      setOpenInvoiceAnalytics(customerAnalytics);
    } catch (error) {
      console.error('Error loading open invoice analytics:', error);
      setOpenInvoiceAnalytics([]);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const toggleCustomerExpansion = (customerName: string) => {
    const newExpanded = new Set(expandedCustomers);
    if (newExpanded.has(customerName)) {
      newExpanded.delete(customerName);
    } else {
      newExpanded.add(customerName);
    }
    setExpandedCustomers(newExpanded);
  };

  const loadInvoiceApplications = async (payment: PaymentRow) => {
    setSelectedPayment(payment);
    setShowInvoiceModal(true);
    setLoadingApplications(true);

    try {
      const { data: applications, error } = await supabase
        .from('payment_invoice_applications')
        .select('*')
        .eq('payment_id', payment.id)
        .order('invoice_date', { ascending: false });

      if (error) throw error;

      if (applications) {
        const invoiceRefs = applications
          .map(app => app.invoice_reference_number)
          .filter(Boolean);

        const { data: invoices } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, date, balance, amount, status, due_date')
          .in('reference_number', invoiceRefs);

        const invoiceMap = new Map(
          invoices?.map(inv => [inv.reference_number, inv]) || []
        );

        const enrichedApplications: InvoiceApplication[] = applications.map(app => {
          const invoice = invoiceMap.get(app.invoice_reference_number);
          return {
            ...app,
            invoice_balance: invoice ? parseFloat(invoice.balance) : undefined,
            invoice_amount: invoice ? parseFloat(invoice.amount) : undefined,
            invoice_status: invoice?.status,
            invoice_due_date: invoice?.due_date || null
          };
        });

        setInvoiceApplications(enrichedApplications);
      }
    } catch (error) {
      console.error('Error loading invoice applications:', error);
      setInvoiceApplications([]);
    } finally {
      setLoadingApplications(false);
    }
  };

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors border-r border-gray-200 sticky top-0 z-10"
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-blue-600' : 'text-gray-400'}`} />
      </div>
    </th>
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg transition-colors shadow-sm"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-600" />
                Payment Analytics
              </h1>
              <p className="text-gray-600 mt-1">Monthly payment tracking and analysis</p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowAnalyticsDashboard(!showAnalyticsDashboard);
              if (!showAnalyticsDashboard) {
                loadAnalyticsDashboard();
              }
            }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-lg ${
              showAnalyticsDashboard
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-gray-700'
                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            {showAnalyticsDashboard ? 'Hide Analytics' : 'Show Analytics Dashboard'}
          </button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      {showAnalyticsDashboard && (
        <div className="bg-gray-50 border-b border-gray-200 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                  {analyticsMode === 'payment_timing' ? 'Payment Timing Analytics' : 'Open Invoice Analytics'}
                </h2>
                {((analyticsMode === 'payment_timing' && analyticsData.length > 0) ||
                  (analyticsMode === 'open_invoices' && openInvoiceAnalytics.length > 0)) && (
                  <p className="text-sm text-gray-500 mt-1 ml-9">
                    {analyticsPaymentDateFrom && analyticsPaymentDateTo ? (
                      <>
                        Loaded: <span className="font-semibold text-blue-600">{formatDateString(analyticsPaymentDateFrom)}</span>
                        {' → '}
                        <span className="font-semibold text-blue-600">{formatDateString(analyticsPaymentDateTo)}</span>
                      </>
                    ) : analyticsPaymentDateFrom ? (
                      <>
                        Loaded: <span className="font-semibold text-blue-600">{formatDateString(analyticsPaymentDateFrom)}</span>
                        {' → '}
                        <span className="font-semibold text-blue-600">Today</span>
                      </>
                    ) : (
                      <>Loaded: <span className="font-semibold text-blue-600">{analyticsDateRange === 'month' ? 'This Month' : analyticsDateRange === 'quarter' ? 'This Quarter' : 'This Year'}</span></>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                {/* Mode Toggle */}
                <div className="flex bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
                  <button
                    onClick={() => {
                      setAnalyticsMode('payment_timing');
                      loadAnalyticsDashboard();
                    }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      analyticsMode === 'payment_timing'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Payment Timing
                  </button>
                  <button
                    onClick={() => {
                      setAnalyticsMode('open_invoices');
                      loadOpenInvoiceAnalytics();
                    }}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      analyticsMode === 'open_invoices'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Open Invoices
                  </button>
                </div>

                <button
                  onClick={() => setShowAnalyticsFilters(!showAnalyticsFilters)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Filter className="w-4 h-4" />
                  {showAnalyticsFilters ? 'Hide Filters' : 'Show Filters'}
                </button>
                <select
                  value={analyticsDateRange}
                  onChange={(e) => {
                    setAnalyticsDateRange(e.target.value as 'month' | 'quarter' | 'year');
                    if (analyticsMode === 'payment_timing') {
                      loadAnalyticsDashboard();
                    } else {
                      loadOpenInvoiceAnalytics();
                    }
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                >
                  <option value="month">This Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                </select>
                <select
                  value={analyticsGroupBy}
                  onChange={(e) => setAnalyticsGroupBy(e.target.value as 'day' | 'week' | 'month')}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                >
                  <option value="day">By Day</option>
                  <option value="week">By Week</option>
                  <option value="month">By Month</option>
                </select>
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showAnalyticsFilters && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Filter className="w-5 h-5 text-blue-600" />
                    Advanced Filters
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={clearAnalyticsFilters}
                      className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={applyAnalyticsFilters}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>

                {/* Overdue Filter Toggle - Prominent */}
                {analyticsMode === 'payment_timing' && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={analyticsShowOnlyOverdue}
                        onChange={(e) => setAnalyticsShowOnlyOverdue(e.target.checked)}
                        className="w-5 h-5 text-amber-600 border-amber-300 rounded focus:ring-amber-500 focus:ring-2"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-amber-900">
                          Only show overdue payments
                        </span>
                        <p className="text-xs text-amber-700 mt-1">
                          Only include payments that were paid after their invoice due date (late payments)
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Date Range */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {analyticsMode === 'payment_timing' ? 'Payment Date Range' : 'Invoice Date Range'}
                    </h4>
                    <p className="text-xs text-blue-600 font-medium">
                      Changing dates will reload data from database
                    </p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <input
                          type="date"
                          value={analyticsPaymentDateFrom}
                          onChange={(e) => setAnalyticsPaymentDateFrom(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                        <input
                          type="date"
                          value={analyticsPaymentDateTo}
                          onChange={(e) => setAnalyticsPaymentDateTo(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Invoice Amount Range */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Invoice Amount Range
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Min Amount</label>
                        <input
                          type="number"
                          placeholder="e.g., 200"
                          value={analyticsMinAmount}
                          onChange={(e) => setAnalyticsMinAmount(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Max Amount</label>
                        <input
                          type="number"
                          placeholder="e.g., 10000"
                          value={analyticsMaxAmount}
                          onChange={(e) => setAnalyticsMaxAmount(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment Timing (Days) - Only show in payment_timing mode */}
                  {analyticsMode === 'payment_timing' && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Days Between Invoice & Payment
                      </h4>
                    <div className="space-y-2">
                      <select
                        value={analyticsTimingFilter}
                        onChange={(e) => setAnalyticsTimingFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All Timing Ranges</option>
                        <option value="below_30">Below 30 days</option>
                        <option value="30_60">30-60 days</option>
                        <option value="60_90">60-90 days</option>
                        <option value="above_90">Above 90 days</option>
                        <option value="custom">Custom Range</option>
                      </select>
                      {analyticsTimingFilter === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Min Days</label>
                            <input
                              type="number"
                              placeholder="e.g., 30"
                              value={analyticsCustomDaysMin}
                              onChange={(e) => setAnalyticsCustomDaysMin(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Max Days</label>
                            <input
                              type="number"
                              placeholder="e.g., 45"
                              value={analyticsCustomDaysMax}
                              onChange={(e) => setAnalyticsCustomDaysMax(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  )}

                  {/* Customer Filter */}
                  <div className="space-y-3 md:col-span-2 lg:col-span-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Customer Filter
                    </h4>
                    <div className="space-y-3">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="all"
                            checked={analyticsCustomerFilter === 'all'}
                            onChange={(e) => setAnalyticsCustomerFilter(e.target.value as 'all' | 'include' | 'exclude')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">All Customers</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="include"
                            checked={analyticsCustomerFilter === 'include'}
                            onChange={(e) => setAnalyticsCustomerFilter(e.target.value as 'all' | 'include' | 'exclude')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">Include Only</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="exclude"
                            checked={analyticsCustomerFilter === 'exclude'}
                            onChange={(e) => setAnalyticsCustomerFilter(e.target.value as 'all' | 'include' | 'exclude')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">Exclude</span>
                        </label>
                      </div>
                      {analyticsCustomerFilter !== 'all' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Select Customers</label>
                          <input
                            type="text"
                            placeholder="Search customers..."
                            value={customerSearchTerm}
                            onChange={(e) => setCustomerSearchTerm(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            multiple
                            value={analyticsSelectedCustomers}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions, option => option.value);
                              setAnalyticsSelectedCustomers(selected);
                            }}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-64 overflow-y-auto"
                            size={10}
                          >
                            {[...new Set(analyticsData.map(app => app.customer))]
                              .sort()
                              .filter(customer => customer.toLowerCase().includes(customerSearchTerm.toLowerCase()))
                              .map(customer => (
                                <option key={customer} value={customer}>
                                  {customer}
                                </option>
                              ))}
                          </select>
                          <p className="text-xs text-gray-500">
                            Hold Ctrl/Cmd to select multiple. Selected: {analyticsSelectedCustomers.length} customer{analyticsSelectedCustomers.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Active Filters Summary */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      Showing <span className="font-bold text-blue-600">{filteredAnalyticsData.length}</span> of{' '}
                      <span className="font-bold">{analyticsData.length}</span> payments
                    </p>
                    {(appliedPaymentDateFrom || appliedPaymentDateTo || appliedMinAmount || appliedMaxAmount ||
                      appliedCustomerFilter !== 'all' || appliedTimingFilter !== 'all') && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                        Filters Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {loadingAnalytics ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                <span className="ml-3 text-gray-500">Loading analytics...</span>
              </div>
            ) : analyticsMode === 'payment_timing' ? (
              filteredAnalyticsData.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-gray-500">
                  {analyticsData.length === 0
                    ? 'No payment data available for this period.'
                    : 'No payments match your filter criteria.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Total Payments</p>
                    <p className="text-2xl font-bold text-gray-700">{filteredAnalyticsData.length}</p>
                    <p className="text-xs text-blue-400 mt-1">Payments in Date Range</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Total Applied (Invoices Only)</p>
                    <p className="text-2xl font-bold text-gray-700">
                      {formatCurrency(filteredAnalyticsData.filter(app => app.doc_type === 'Invoice').reduce((sum, app) => sum + app.amount_paid, 0))}
                    </p>
                    <p className="text-xs text-green-400 mt-1">{filteredAnalyticsData.filter(app => app.doc_type === 'Invoice').length} invoice applications</p>
                  </div>
                  <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 border border-yellow-500/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Avg. Days to Pay</p>
                    <p className="text-2xl font-bold text-gray-700">
                      {(() => {
                        const withDays = filteredAnalyticsData.filter(app => app.days_to_pay !== null);
                        if (withDays.length === 0) return 'N/A';
                        const avg = withDays.reduce((sum, app) => sum + app.days_to_pay, 0) / withDays.length;
                        return Math.round(avg);
                      })()}
                    </p>
                    <p className="text-xs text-yellow-400 mt-1">From Invoice Date</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Unique Customers</p>
                    <p className="text-2xl font-bold text-gray-700">
                      {new Set(filteredAnalyticsData.map(app => app.customer)).size}
                    </p>
                    <p className="text-xs text-purple-400 mt-1">Made Payments</p>
                  </div>
                </div>

                {/* Application Status Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const paymentsWithApplications = filteredAnalyticsData.filter(app => app.invoice_ref !== null && app.invoice_ref !== '').length;
                    const paymentsWithoutApplications = filteredAnalyticsData.filter(app => app.invoice_ref === null || app.invoice_ref === '').length;
                    const totalApplications = filteredAnalyticsData.filter(app => app.invoice_ref !== null && app.invoice_ref !== '').length;
                    const total = filteredAnalyticsData.length;

                    return (
                      <>
                        <div className="bg-white border-2 border-emerald-300 shadow-md rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Payments with Applications</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-emerald-500/20 text-emerald-600">
                              {total > 0 ? Math.round((paymentsWithApplications / total) * 100) : 0}%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-emerald-600">{paymentsWithApplications}</p>
                          <p className="text-xs text-gray-600 mt-1">Linked to invoices</p>
                        </div>
                        <div className="bg-white border-2 border-amber-300 shadow-md rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Payments without Applications</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-amber-500/20 text-amber-600">
                              {total > 0 ? Math.round((paymentsWithoutApplications / total) * 100) : 0}%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-amber-600">{paymentsWithoutApplications}</p>
                          <p className="text-xs text-gray-600 mt-1">Not linked to invoices</p>
                        </div>
                        <div className="bg-white border-2 border-blue-300 shadow-md rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Total Applications</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-blue-500/20 text-blue-600">
                              100%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-blue-600">{totalApplications}</p>
                          <p className="text-xs text-gray-600 mt-1">Invoice linkages found</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Payment Timing Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {(() => {
                    const withDays = filteredAnalyticsData.filter(app => app.days_to_pay !== null);
                    const withoutDays = filteredAnalyticsData.filter(app => app.days_to_pay === null);
                    const early = withDays.filter(app => app.days_to_pay < 0).length;
                    const onTime = withDays.filter(app => app.days_to_pay >= 0 && app.days_to_pay <= 30).length;
                    const late = withDays.filter(app => app.days_to_pay > 30).length;
                    const total = filteredAnalyticsData.length;

                    return (
                      <>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Early Payments</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-green-500/20 text-green-400">
                              {total > 0 ? Math.round((early / total) * 100) : 0}%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-green-400">{early}</p>
                          <p className="text-xs text-gray-600 mt-1">Paid before invoice date</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">On-Time Payments</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-blue-500/20 text-blue-400">
                              {total > 0 ? Math.round((onTime / total) * 100) : 0}%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-blue-400">{onTime}</p>
                          <p className="text-xs text-gray-600 mt-1">Paid within 30 days</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Late Payments</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-red-500/20 text-red-400">
                              {total > 0 ? Math.round((late / total) * 100) : 0}%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-red-400">{late}</p>
                          <p className="text-xs text-gray-600 mt-1">Paid after 30 days</p>
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">No Invoice Data</p>
                            <span className="px-2 py-1 text-xs font-bold rounded bg-gray-500/20 text-gray-600">
                              {total > 0 ? Math.round((withoutDays.length / total) * 100) : 0}%
                            </span>
                          </div>
                          <p className="text-3xl font-bold text-gray-600">{withoutDays.length}</p>
                          <p className="text-xs text-gray-600 mt-1">No application records</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Detailed Applications Table */}
                <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-700">Payment Application Details</h3>
                    <button
                      onClick={exportAnalyticsToExcel}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-sm text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Export to Excel
                    </button>
                  </div>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <AnalyticsSortableHeader field="payment_date" label="Payment Date" />
                          <AnalyticsSortableHeader field="invoice_date" label="Invoice Date" />
                          <AnalyticsSortableHeader field="days_to_pay" label="Days to Pay" />
                          <AnalyticsSortableHeader field="payment_ref" label="Payment Ref" />
                          <AnalyticsSortableHeader field="invoice_ref" label="Invoice Ref" />
                          <AnalyticsSortableHeader field="customer" label="Customer" />
                          <AnalyticsSortableHeader field="amount_paid" label="Amount" />
                          <AnalyticsSortableHeader field="payment_method" label="Method" />
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredAnalyticsData.map((app, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                              {formatDateString(app.payment_date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                              {app.invoice_date ? formatDateString(app.invoice_date) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap">
                              {app.days_to_pay !== null ? (
                                <span className={`font-semibold ${
                                  app.days_to_pay < 0
                                    ? 'text-green-400'
                                    : app.days_to_pay <= 30
                                    ? 'text-blue-400'
                                    : 'text-red-400'
                                }`}>
                                  {app.days_to_pay > 0 ? '+' : ''}{app.days_to_pay} days
                                </span>
                              ) : (
                                <span className="text-gray-600">N/A</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                              {app.payment_ref}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                              {app.invoice_ref}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                              {app.customer}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-green-400 whitespace-nowrap">
                              {formatCurrency(app.amount_paid)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                              {app.payment_method}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <a
                                href={getAcumaticaInvoiceUrl(app.invoice_ref)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                title="Open in Acumatica"
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )
            ) : (
              /* Open Invoice Analytics Mode */
              openInvoiceAnalytics.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-gray-500">
                    No open invoices found for this period.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Total Customers</p>
                      <p className="text-2xl font-bold text-gray-700">{openInvoiceAnalytics.length}</p>
                      <p className="text-xs text-blue-400 mt-1">With Open Invoices</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Total Open Invoices</p>
                      <p className="text-2xl font-bold text-gray-700">
                        {openInvoiceAnalytics.reduce((sum, c) => sum + c.invoice_count, 0)}
                      </p>
                      <p className="text-xs text-green-400 mt-1">From Selected Period</p>
                    </div>
                    <div className="bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Total Outstanding</p>
                      <p className="text-2xl font-bold text-gray-700">
                        {formatCurrency(openInvoiceAnalytics.reduce((sum, c) => sum + c.total_balance, 0))}
                      </p>
                      <p className="text-xs text-red-400 mt-1">Unpaid Balance</p>
                    </div>
                  </div>

                  {/* Customer List with Open Invoices */}
                  <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-700">Customers with Open Invoices</h3>
                      <p className="text-xs text-gray-500 mt-1">Click on a customer to view individual invoices</p>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {openInvoiceAnalytics.map((customer, idx) => (
                        <div key={idx}>
                          {/* Customer Summary Row */}
                          <div
                            onClick={() => toggleCustomerExpansion(customer.customer_name)}
                            className="px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className={`transform transition-transform ${expandedCustomers.has(customer.customer_name) ? 'rotate-90' : ''}`}>
                                  <ChevronRight className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{customer.customer_name}</p>
                                  <p className="text-sm text-gray-500">{customer.customer_id}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-gray-700">
                                    {customer.invoice_count} {customer.invoice_count === 1 ? 'Invoice' : 'Invoices'}
                                  </p>
                                  <p className="text-xs text-gray-500">Open</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-bold text-red-600">
                                    {formatCurrency(customer.total_balance)}
                                  </p>
                                  <p className="text-xs text-gray-500">Outstanding</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Invoice Details */}
                          {expandedCustomers.has(customer.customer_name) && (
                            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-white">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Invoice</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Due Date</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Amount</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Balance</th>
                                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 bg-white">
                                    {customer.invoices.map((invoice: any, invIdx: number) => (
                                      <tr key={invIdx} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-900 font-medium">
                                          {invoice.reference_number}
                                        </td>
                                        <td className="px-3 py-2 text-gray-700">
                                          {formatDateString(invoice.date)}
                                        </td>
                                        <td className="px-3 py-2 text-gray-700">
                                          {invoice.due_date ? formatDateString(invoice.due_date) : 'N/A'}
                                        </td>
                                        <td className="px-3 py-2 text-gray-700">
                                          {formatCurrency(parseFloat(invoice.amount || 0))}
                                        </td>
                                        <td className="px-3 py-2 font-semibold text-red-600">
                                          {formatCurrency(parseFloat(invoice.balance || 0))}
                                        </td>
                                        <td className="px-3 py-2">
                                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                                            invoice.status === 'Open'
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : invoice.status === 'Overdue'
                                              ? 'bg-red-100 text-red-700'
                                              : 'bg-gray-100 text-gray-700'
                                          }`}>
                                            {invoice.status || 'Open'}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Exclusion Indicator */}
      {excludedCustomerIds.size > 0 && !exclusionBannerDismissed && (
        <div className="bg-yellow-900/20 border-b border-yellow-600/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <EyeOff className="w-5 h-5 text-yellow-500" />
            <div className="flex-1">
              <p className="text-yellow-200 font-medium">
                {excludedCustomerIds.size} customer{excludedCustomerIds.size !== 1 ? 's' : ''} excluded from payment analytics
              </p>
              <p className="text-yellow-300/70 text-sm mt-1">
                These customers' payments won't appear in the table or affect analytics totals. Manage exclusions in the Customers section.
              </p>
            </div>
            <button
              onClick={() => {
                setExclusionBannerDismissed(true);
                localStorage.setItem('paymentAnalytics_exclusionBannerDismissed', 'true');
              }}
              className="p-2 hover:bg-yellow-700/30 rounded-lg transition-colors group"
              title="Dismiss"
            >
              <X className="w-5 h-5 text-yellow-400 group-hover:text-yellow-300" />
            </button>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <div className={`${sidebarCollapsed ? 'w-16' : 'w-80'} bg-gray-50 border-r border-gray-200 transition-all duration-300 overflow-hidden`}>
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
                  <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Total Revenue</p>
                    <p className="text-xl font-bold text-gray-700">{formatCurrency(monthlyTotal)}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Payments</p>
                    <p className="text-xl font-bold text-gray-700">{monthlyPaymentCount}</p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Customers</p>
                    <p className="text-xl font-bold text-gray-700">{monthlyCustomerCount}</p>
                  </div>
                </div>

                {/* Filters */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filter Options
                  </h3>

                  {/* Status Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Status</label>
                    <select
                      value={tempFilterStatus}
                      onChange={(e) => setTempFilterStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {uniqueStatuses.map(status => (
                        <option key={status} value={status}>
                          {status === 'all' ? 'All Statuses' : status}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Type Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
                    <select
                      value={tempFilterType}
                      onChange={(e) => setTempFilterType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {uniqueTypes.map(type => (
                        <option key={type} value={type}>
                          {type === 'all' ? 'All Types' : type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Payment Method Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Payment Method</label>
                    <select
                      value={tempFilterPaymentMethod}
                      onChange={(e) => setTempFilterPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {uniquePaymentMethods.map(method => (
                        <option key={method} value={method}>
                          {method === 'all' ? 'All Methods' : method}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Invoice Period Filter */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Invoice Applications</label>
                    <select
                      value={tempFilterInvoicePeriod}
                      onChange={(e) => setTempFilterInvoicePeriod(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Payments</option>
                      <option value="has_applications">With Applications</option>
                      <option value="no_applications">Without Applications</option>
                    </select>
                  </div>

                  {/* Date Range Filter */}
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
                          Will show payments {tempDateFrom && tempDateTo
                            ? `from ${formatDateString(tempDateFrom)} to ${formatDateString(tempDateTo)}`
                            : tempDateFrom
                            ? `from ${formatDateString(tempDateFrom)}`
                            : `up to ${formatDateString(tempDateTo)}`
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Apply and Clear Filters Buttons */}
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
                </div>

                {/* Selected Date Filter */}
                {selectedDate && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Selected Date</p>
                    <p className="text-sm font-semibold text-blue-400">
                      {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="text-xs text-blue-400 hover:text-blue-300 mt-2"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Filter Results */}
                <div className="bg-white rounded-lg p-3 border border-gray-300 shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">Showing</p>
                  <p className="text-lg font-bold text-gray-700">{filteredPayments.length}</p>
                  <p className="text-xs text-gray-500">
                    {(dateFrom || dateTo) ?
                      `in selected date range (${payments.length} total loaded)` :
                      `of ${payments.length} payments`
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
                  calendarView === 'daily'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setCalendarView('monthly')}
                className={`px-6 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  calendarView === 'monthly'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setCalendarView('yearly')}
                className={`px-6 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  calendarView === 'yearly'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Yearly
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <button
              onClick={previousPeriod}
              className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-700 flex items-center gap-2 justify-center">
                <Calendar className="w-6 h-6 text-blue-400" />
                {calendarView === 'daily' ? monthName : calendarView === 'monthly' ? selectedYear : `${selectedYear - 5} - ${selectedYear}`}
              </h2>
              {selectedDate && calendarView === 'daily' && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                >
                  Clear date filter
                </button>
              )}
            </div>
            <button
              onClick={nextPeriod}
              className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="mb-6 max-w-full">
            {calendarView === 'daily' ? (
              <>
                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>
                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-2">
                  {getCalendarDays().map((date, idx) => {
                    const dayPayments = getDayPayments(date);
                    const isCurrentMonth = date.getMonth() === selectedMonth.getMonth();
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    const dayTotal = dayPayments.reduce((sum, p) => sum + p.payment_amount, 0);

                    return (
                      <button
                        key={idx}
                        onClick={() => isCurrentMonth ? setSelectedDate(date) : null}
                        className={`
                          relative p-2 rounded-lg border transition-all
                          ${isCurrentMonth ? 'bg-blue-50 border-blue-200 hover:bg-blue-100 hover:border-blue-300' : 'bg-white border-gray-200 opacity-40'}
                          ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/20' : ''}
                          ${isToday ? 'border-blue-400' : ''}
                          ${isCurrentMonth ? 'cursor-pointer' : 'cursor-not-allowed'}
                        `}
                        disabled={!isCurrentMonth}
                      >
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          {date.getDate()}
                        </div>
                        {dayPayments.length > 0 && isCurrentMonth && (
                          <div className="space-y-0.5">
                            <div className="text-xs text-green-400 font-medium">
                              {formatCurrency(dayTotal)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {dayPayments.length} payment{dayPayments.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : calendarView === 'monthly' ? (
              /* Monthly View */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {getMonthlyData().map((monthData) => {
                  const isCurrentMonth = monthData.month === new Date().getMonth() && selectedYear === new Date().getFullYear();
                  return (
                    <button
                      key={monthData.month}
                      onClick={() => {
                        setSelectedMonth(new Date(selectedYear, monthData.month, 1));
                        setCalendarView('daily');
                      }}
                      className={`
                        p-5 rounded-lg border transition-all hover:shadow-lg cursor-pointer
                        ${isCurrentMonth ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400' : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-200'}
                      `}
                    >
                      <div className="text-base font-bold text-gray-700 mb-3">
                        {monthData.name}
                      </div>
                      {monthData.count > 0 ? (
                        <div className="space-y-1">
                          <div className="text-xl font-semibold text-green-600">
                            {formatCurrency(monthData.total)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {monthData.count} payment{monthData.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">No payments</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Yearly View */
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
                        p-8 rounded-xl border-2 transition-all hover:shadow-xl cursor-pointer
                        ${isCurrentYear ? 'bg-blue-50 border-blue-400 ring-4 ring-blue-200' : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300'}
                      `}
                    >
                      <div className="text-3xl font-bold text-gray-700 mb-4">
                        {yearData.year}
                      </div>
                      {yearData.count > 0 ? (
                        <div className="space-y-2">
                          <div className="text-3xl font-bold text-green-600">
                            {formatCurrency(yearData.total)}
                          </div>
                          <div className="text-sm text-gray-500">
                            {yearData.count} payment{yearData.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="text-base text-gray-400">No payments</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 max-w-full">
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                  <DollarSign className="w-5 h-5 text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Total Revenue</p>
                  <p className="text-base font-bold text-gray-700 break-words">{formatCurrency(monthlyTotal)}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Total Payments</p>
                  <p className="text-base font-bold text-gray-700 break-words">{monthlyPaymentCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 rounded-lg p-4 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg flex-shrink-0">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-500 text-xs mb-1">Unique Customers</p>
                  <p className="text-base font-bold text-gray-700 break-words">{monthlyCustomerCount}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-6 max-w-full">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                placeholder="Search by reference, customer, payment method..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchMonthApplications}
              disabled={fetchingApplications}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-sm ${
                fetchingApplications
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <RefreshCw className={`w-5 h-5 ${fetchingApplications ? 'animate-spin' : ''}`} />
              {fetchingApplications ? 'Fetching...' : 'Fetch Applications'}
            </button>
            <button
              onClick={fetchMonthAttachments}
              disabled={fetchingAttachments}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all shadow-sm ${
                fetchingAttachments
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
            >
              <RefreshCw className={`w-5 h-5 ${fetchingAttachments ? 'animate-spin' : ''}`} />
              {fetchingAttachments ? 'Fetching...' : 'Fetch Attachments'}
            </button>
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1 border border-gray-300">
              <button
                onClick={() => setViewMode('payment')}
                className={`px-4 py-2 rounded-md font-semibold transition-all ${
                  viewMode === 'payment'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                By Payment
              </button>
              <button
                onClick={() => setViewMode('application')}
                className={`px-4 py-2 rounded-md font-semibold transition-all ${
                  viewMode === 'application'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                By Invoice
              </button>
            </div>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-all shadow-sm"
            >
              <Download className="w-5 h-5" />
              Export Excel
            </button>
          </div>

          {fetchResult && (
            <div className={`mb-6 p-4 rounded-lg border ${
              fetchResult.success
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {fetchResult.success ? (
                <div>
                  <p className="font-semibold">{fetchResult.message || 'Applications fetched successfully!'}</p>
                  <p className="text-sm mt-1">
                    Processed: {fetchResult.processed} | Found: {fetchResult.applicationsFound}
                  </p>
                </div>
              ) : (
                <p className="font-semibold">{fetchResult.error}</p>
              )}
            </div>
          )}

          {attachmentResult && (
            <div className={`mb-6 p-4 rounded-lg border ${
              attachmentResult.success
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {attachmentResult.success ? (
                <div>
                  <p className="font-semibold">{attachmentResult.message || 'Attachments fetched successfully!'}</p>
                  <p className="text-sm mt-1">
                    Total: {attachmentResult.total} | With Files: {attachmentResult.successful} | No Files: {attachmentResult.noFiles} | Failed: {attachmentResult.failed}
                  </p>
                </div>
              ) : (
                <p className="font-semibold">{attachmentResult.error}</p>
              )}
            </div>
          )}

        {/* Loading Batch Info Banner */}
        {loadingBatchInfo && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <div>
                <p className="text-blue-400 font-semibold">{loadingBatchInfo}</p>
                <p className="text-blue-300 text-sm">Displaying results as they load...</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 shadow-lg rounded-xl overflow-hidden max-w-full">
          <div
            className="max-h-[calc(100vh-300px)] overflow-x-auto overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#64748b #1e293b'
            }}
          >
            {viewMode === 'payment' ? (
              <>
            {loading && filteredPayments.length === 0 ? (
              <table className="divide-y divide-gray-200" style={{ minWidth: '1400px', width: 'max-content' }}>
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Applied</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Available</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Applications</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {[...Array(8)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded animate-shimmer bg-[length:200%_100%]"></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.1s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-3/4 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.2s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-2/3 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.3s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-1/2 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.4s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200 text-right">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded ml-auto w-20 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.5s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200 text-right">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded ml-auto w-20 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.6s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200 text-right">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded ml-auto w-20 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.7s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-16 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.8s' }}></div>
                      </td>
                      <td className="px-4 py-4 border-r border-gray-200">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded w-3/4 animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '0.9s' }}></div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: '1s' }}></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : filteredPayments.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                {searchTerm ? 'No payments found matching your search.' : (
                  loading ? (
                    <div>
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
                      <p>Loading payments...</p>
                      {loadingBatchInfo && <p className="text-sm text-blue-400 mt-2">{loadingBatchInfo}</p>}
                    </div>
                  ) : 'No payments found for this month.'
                )}
              </div>
            ) : (
              <table className="divide-y divide-gray-200" style={{ minWidth: '1400px', width: 'max-content' }}>
                <thead>
                  <tr>
                    <SortableHeader field="date" label="Date" />
                    <SortableHeader field="reference_number" label="Reference" />
                    <SortableHeader field="customer_name" label="Customer" />
                    <SortableHeader field="payment_method" label="Payment Method" />
                    <SortableHeader field="type" label="Type" />
                    <SortableHeader field="payment_amount" label="Amount" />
                    <SortableHeader field="total_applied" label="Applied" />
                    <SortableHeader field="available_balance" label="Available" />
                    <SortableHeader field="status" label="Status" />
                    <SortableHeader field="description" label="Description" />
                    <SortableHeader field="invoice_applications" label="Applications" />
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayments.map((payment, index) => (
                    <tr
                      key={payment.id}
                      ref={index === filteredPayments.length - 1 ? lastPaymentRef : null}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                        {formatDateString(payment.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 border-r border-gray-200/50">
                        {payment.reference_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200/50 max-w-xs truncate" title={payment.customer_name}>
                        {payment.customer_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                        {payment.payment_method}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                        {payment.type}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-green-600 border-r border-gray-200/50">
                        {formatCurrency(payment.payment_amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-blue-600 border-r border-gray-200/50">
                        {formatCurrency(payment.total_applied)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                        {formatCurrency(payment.available_balance)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap border-r border-gray-200/50">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          payment.status === 'Open'
                            ? 'bg-green-500/20 text-green-600'
                            : payment.status === 'Closed'
                            ? 'bg-blue-500/20 text-blue-600'
                            : 'bg-gray-500/20 text-gray-600'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200/50 max-w-xs truncate" title={payment.description || '-'}>
                        {payment.description || '-'}
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-gray-700 max-w-md truncate cursor-pointer hover:text-blue-600 hover:bg-gray-50 transition-colors"
                        title="Click to view invoice details"
                        onClick={() => loadInvoiceApplications(payment)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate">{payment.invoice_applications}</span>
                          {payment.invoice_applications !== 'None' && (
                            <ExternalLink className="w-4 h-4 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700 border-r border-gray-200">
                      TOTAL ({filteredPayments.length} payments)
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-green-600 border-r border-gray-200">
                      {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.payment_amount, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-blue-600 border-r border-gray-200">
                      {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.total_applied, 0))}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-700 border-r border-gray-200">
                      {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.available_balance, 0))}
                    </td>
                    <td colSpan={3} className="px-4 py-3 text-sm text-gray-500"></td>
                  </tr>
                </tfoot>
              </table>
            )}
              </>
            ) : (
              /* Application View */
              loading && filteredApplicationRows.length === 0 ? (
                <table className="divide-y divide-gray-200" style={{ minWidth: '1600px', width: 'max-content' }}>
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Method</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Invoice Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Doc Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Invoice Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Due Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Amount Applied</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Invoice Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {[...Array(8)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {[...Array(12)].map((_, j) => (
                          <td key={j} className="px-4 py-4 border-r border-gray-200">
                            <div className="h-4 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded animate-shimmer bg-[length:200%_100%]" style={{ animationDelay: `${j * 0.1}s` }}></div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="divide-y divide-gray-200" style={{ minWidth: '1600px', width: 'max-content' }}>
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Method</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Payment Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Invoice Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Doc Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Invoice Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Due Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Amount Applied</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Invoice Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 sticky top-0 z-10">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredApplicationRows.map((app, index) => (
                      <tr key={app.application_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                          {formatDateString(app.payment_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 border-r border-gray-200/50">
                          {app.payment_reference}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200/50 max-w-xs truncate" title={app.customer_name}>
                          {app.customer_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                          {app.payment_method}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-green-600 border-r border-gray-200/50">
                          {formatCurrency(app.payment_amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 border-r border-gray-200/50">
                          {app.invoice_reference_number}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap border-r border-gray-200/50">
                          <span className={`px-2 py-1 text-xs font-semibold rounded ${
                            app.doc_type === 'Invoice'
                              ? 'bg-blue-500/20 text-blue-600'
                              : app.doc_type === 'Credit Memo'
                              ? 'bg-orange-500/20 text-orange-600'
                              : 'bg-gray-500/20 text-gray-600'
                          }`}>
                            {app.doc_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                          {app.invoice_date ? formatDateString(app.invoice_date) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                          {app.invoice_due_date ? formatDateString(app.invoice_due_date) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-600 border-r border-gray-200/50">
                          {formatCurrency(app.amount_paid)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200/50">
                          {app.invoice_balance != null ? formatCurrency(app.invoice_balance) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap border-r border-gray-200/50">
                          {app.invoice_status && (
                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                              app.invoice_status === 'Open'
                                ? 'bg-green-500/20 text-green-600'
                                : app.invoice_status === 'Closed'
                                ? 'bg-blue-500/20 text-blue-600'
                                : 'bg-gray-500/20 text-gray-600'
                            }`}>
                              {app.invoice_status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700 border-r border-gray-200">
                        TOTAL ({filteredApplicationRows.length} invoice applications)
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-green-600 border-r border-gray-200">
                        {formatCurrency(filteredApplicationRows.reduce((sum, a) => sum + a.payment_amount, 0))}
                      </td>
                      <td colSpan={4} className="px-4 py-3 text-sm text-gray-500 border-r border-gray-200"></td>
                      <td className="px-4 py-3 text-sm font-bold text-blue-600 border-r border-gray-200">
                        {formatCurrency(filteredApplicationRows.reduce((sum, a) => sum + a.amount_paid, 0))}
                      </td>
                      <td colSpan={2} className="px-4 py-3 text-sm text-gray-500"></td>
                    </tr>
                  </tfoot>
                </table>
              )
            )}
          </div>

          {/* Loading indicator for infinite scroll */}
          {loadingMorePayments && viewMode === 'payment' && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex justify-center">
              <div className="flex items-center gap-2 text-gray-600">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading more payments...</span>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Invoice Applications Modal */}
      {showInvoiceModal && selectedPayment && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-700 flex items-center gap-3">
                  <FileText className="w-6 h-6" />
                  Invoice Applications
                </h2>
                <p className="text-blue-100 text-sm mt-1">
                  Payment: {selectedPayment.reference_number} | {selectedPayment.customer_name}
                </p>
              </div>
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="p-2 hover:bg-blue-500/30 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-700" />
              </button>
            </div>

            {/* Payment Summary */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Payment Date</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {formatDateString(selectedPayment.date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Payment Amount</p>
                  <p className="text-sm font-semibold text-green-600">
                    {formatCurrency(selectedPayment.payment_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Applied</p>
                  <p className="text-sm font-semibold text-blue-600">
                    {formatCurrency(selectedPayment.total_applied)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Available Balance</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {formatCurrency(selectedPayment.available_balance)}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingApplications ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                  <span className="ml-3 text-gray-500">Loading invoice applications...</span>
                </div>
              ) : invoiceApplications.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-gray-500">No invoice applications found for this payment.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {invoiceApplications.map((app) => (
                    <div
                      key={app.id}
                      className="bg-white border border-gray-200 shadow-sm rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-bold text-gray-700">
                              {app.invoice_reference_number}
                            </h3>
                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                              app.doc_type === 'Invoice'
                                ? 'bg-blue-500/20 text-blue-600'
                                : app.doc_type === 'Credit Memo'
                                ? 'bg-orange-500/20 text-orange-600'
                                : 'bg-gray-500/20 text-gray-600'
                            }`}>
                              {app.doc_type}
                            </span>
                            {app.invoice_status && (
                              <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                app.invoice_status === 'Open'
                                  ? 'bg-green-500/20 text-green-600'
                                  : app.invoice_status === 'Closed'
                                  ? 'bg-gray-500/20 text-gray-600'
                                  : 'bg-gray-500/20 text-gray-600'
                              }`}>
                                {app.invoice_status}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Amount Paid</p>
                          <p className="text-xl font-bold text-green-600">
                            {formatCurrency(parseFloat(app.amount_paid.toString()))}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Invoice Date</p>
                          <p className="text-gray-700 font-medium">
                            {app.invoice_date
                              ? formatDateString(app.invoice_date)
                              : 'N/A'}
                          </p>
                        </div>
                        {app.invoice_due_date && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Due Date</p>
                            <p className="text-gray-700 font-medium">
                              {formatDateString(app.invoice_due_date)}
                            </p>
                          </div>
                        )}
                        {app.invoice_amount !== undefined && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Original Amount</p>
                            <p className="text-gray-700 font-medium">
                              {formatCurrency(app.invoice_amount)}
                            </p>
                          </div>
                        )}
                        {app.invoice_balance !== undefined && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Current Balance</p>
                            <p className={`font-medium ${
                              app.invoice_balance > 0 ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                              {formatCurrency(app.invoice_balance)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                        <p className="text-xs text-gray-600">
                          Application Date: {new Date(app.created_at).toLocaleString()}
                        </p>
                        <a
                          href={getAcumaticaInvoiceUrl(app.invoice_reference_number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          title="Open in Acumatica"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          View in Acumatica
                        </a>
                      </div>
                    </div>
                  ))}

                  {/* Summary Footer */}
                  <div className="bg-gradient-to-r from-blue-900/30 to-blue-800/20 border border-blue-700/30 rounded-lg p-4 mt-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Total Invoices</p>
                        <p className="text-2xl font-bold text-gray-700">
                          {invoiceApplications.length}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Total Applied (Invoices)</p>
                        <p className="text-2xl font-bold text-green-400">
                          {formatCurrency(
                            invoiceApplications
                              .filter(app => app.doc_type === 'Invoice')
                              .reduce(
                                (sum, app) => sum + parseFloat(app.amount_paid.toString()),
                                0
                              )
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Remaining Balance</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {formatCurrency(
                            invoiceApplications.reduce(
                              (sum, app) => sum + (app.invoice_balance || 0),
                              0
                            )
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowInvoiceModal(false)}
                className="px-6 py-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
