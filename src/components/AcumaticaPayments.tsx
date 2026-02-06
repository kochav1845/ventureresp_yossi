import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, DollarSign, Filter, X, CreditCard, User, FileText, ChevronLeft, ChevronRight, Download, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { exportToExcel as exportExcel, formatDate, formatCurrency } from '../lib/excelExport';

interface AcumaticaPaymentsProps {
  onBack?: () => void;
  onNavigate?: (view: string) => void;
}

export default function AcumaticaPayments({ onBack, onNavigate }: AcumaticaPaymentsProps) {
  const { profile } = useAuth();
  const { hasPermission, loading: permissionsLoading } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.PAYMENTS, 'view');
  const canPerformFetch = profile?.role === 'admin' || (profile as any)?.can_perform_fetch;
  const [displayedPayments, setDisplayedPayments] = useState<any[]>([]);
  const [paymentApplications, setPaymentApplications] = useState<Map<string, any[]>>(new Map());
  const [paymentAttachments, setPaymentAttachments] = useState<Map<string, any[]>>(new Map());
  const [invoiceExistence, setInvoiceExistence] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [hasApplicationsFilter, setHasApplicationsFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>('application_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [fetchingPaymentId, setFetchingPaymentId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const pageSize = 1000;

  useEffect(() => {
    loadPayments(0);
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [searchTerm, statusFilter, customerFilter, typeFilter, hasApplicationsFilter, sortBy, sortOrder]);

  const customerMapRef = useRef<Map<string, string>>(new Map());
  const customerMapLoadedRef = useRef(false);

  const ensureCustomerMap = async () => {
    if (customerMapLoadedRef.current && customerMapRef.current.size > 0) {
      return customerMapRef.current;
    }
    const { data: customers } = await supabase
      .from('acumatica_customers')
      .select('customer_id, customer_name');
    const map = new Map(customers?.map(c => [c.customer_id, c.customer_name]) || []);
    customerMapRef.current = map;
    customerMapLoadedRef.current = true;
    return map;
  };

  const loadPayments = async (page = 0) => {
    setLoading(true);
    setIsSearching(false);
    try {
      const [countResult, dataResult, customerMap] = await Promise.all([
        supabase
          .from('acumatica_payments')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('acumatica_payments')
          .select('id, reference_number, type, customer_id, status, application_date, payment_amount, available_balance, currency_id, description, payment_method, payment_ref, cash_account, hold, is_cc_payment, last_modified_datetime, synced_at, created_at, last_sync_timestamp')
          .order('application_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1),
        ensureCustomerMap()
      ]);

      setTotalCount(countResult.count || 0);

      if (dataResult.error) throw dataResult.error;

      const paymentsWithCustomerNames = (dataResult.data || []).map(payment => ({
        ...payment,
        customer_name: customerMap.get(payment.customer_id) || payment.customer_id
      }));

      setDisplayedPayments(paymentsWithCustomerNames);
      setCurrentPage(page);

      await Promise.all([
        loadPaymentApplications(paymentsWithCustomerNames),
        loadPaymentAttachments(paymentsWithCustomerNames)
      ]);
    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const searchTermTrimmed = searchTerm.trim();
    const hasSearchTerm = searchTermTrimmed.length >= 3;
    const hasFilters = hasSearchTerm || statusFilter !== 'all' || customerFilter !== 'all' || typeFilter !== 'all' || hasApplicationsFilter;

    if (!hasFilters) {
      loadPayments(0);
      return;
    }

    if (searchTermTrimmed.length > 0 && searchTermTrimmed.length < 3) {
      return;
    }

    setLoading(true);
    setIsSearching(true);
    try {
      const customerMap = await ensureCustomerMap();

      let matchingCustomerIds: string[] = [];
      if (hasSearchTerm) {
        const searchLower = searchTermTrimmed.toLowerCase();
        matchingCustomerIds = Array.from(customerMap.entries())
          .filter(([, name]) => name?.toLowerCase().includes(searchLower))
          .map(([id]) => id);
      }

      let query = supabase
        .from('acumatica_payments')
        .select('id, reference_number, type, customer_id, status, application_date, payment_amount, available_balance, currency_id, description, payment_method, payment_ref, cash_account, hold, is_cc_payment, last_modified_datetime, synced_at, created_at, last_sync_timestamp');

      if (hasSearchTerm) {
        // Build OR condition that includes customer IDs matching customer names
        const searchConditions = [
          `reference_number.ilike.%${searchTermTrimmed}%`,
          `customer_id.ilike.%${searchTermTrimmed}%`,
          `payment_method.ilike.%${searchTermTrimmed}%`,
          `description.ilike.%${searchTermTrimmed}%`
        ];

        // Add customer ID matches from customer name search
        if (matchingCustomerIds.length > 0) {
          // Limit to first 100 to avoid URL length issues
          const limitedIds = matchingCustomerIds.slice(0, 100);
          searchConditions.push(...limitedIds.map(id => `customer_id.eq.${id}`));
        }

        query = query.or(searchConditions.join(','));
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (customerFilter !== 'all') {
        query = query.eq('customer_id', customerFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter);
      }

      let data: any[];
      let error: any;

      if (hasApplicationsFilter) {
        const { data: appData, error: appError } = await supabase.rpc('get_payment_ids_with_applications');

        if (appError) {
          let allPaymentIds: string[] = [];
          let offset = 0;
          const batchSize = 1000;

          while (true) {
            const { data: batch, error: batchError } = await supabase
              .from('payment_invoice_applications')
              .select('payment_id')
              .range(offset, offset + batchSize - 1);

            if (batchError) throw batchError;
            if (!batch || batch.length === 0) break;

            allPaymentIds.push(...batch.map(app => app.payment_id));

            if (batch.length < batchSize) break;
            offset += batchSize;
          }

          const paymentIdsWithApps = [...new Set(allPaymentIds)];

          if (paymentIdsWithApps.length === 0) {
            setDisplayedPayments([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }

          query = query.in('id', paymentIdsWithApps);
        } else {
          const paymentIdsWithApps = appData || [];

          if (paymentIdsWithApps.length === 0) {
            setDisplayedPayments([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }

          query = query.in('id', paymentIdsWithApps);
        }
      }

      query = query.order('application_date', { ascending: false });

      ({ data, error } = await query);

      if (error) throw error;

      let paymentsWithCustomerNames = (data || []).map(payment => ({
        ...payment,
        customer_name: customerMap.get(payment.customer_id) || payment.customer_id
      }));

      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        paymentsWithCustomerNames.sort((a, b) => {
          const aRefMatch = a.reference_number?.toLowerCase() === searchLower;
          const bRefMatch = b.reference_number?.toLowerCase() === searchLower;

          if (aRefMatch && !bRefMatch) return -1;
          if (!aRefMatch && bRefMatch) return 1;

          const aDateVal = a.application_date || '';
          const bDateVal = b.application_date || '';
          return bDateVal.localeCompare(aDateVal);
        });
      }

      setDisplayedPayments(paymentsWithCustomerNames);
      setTotalCount(data?.length || 0);

      await Promise.all([
        loadPaymentApplications(paymentsWithCustomerNames),
        loadPaymentAttachments(paymentsWithCustomerNames)
      ]);
    } catch (error) {
      console.error('Error searching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToNextPage = () => {
    if ((currentPage + 1) * pageSize < totalCount) {
      loadPayments(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      loadPayments(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fetchSinglePaymentApplications = async (payment: any) => {
    setFetchingPaymentId(payment.id);
    const fetchStartTime = new Date().toISOString();
    let fetchStatus = 'success';
    let errorMessage: string | null = null;
    let applicationsData: any[] = [];

    try {
      console.log(`[${fetchStartTime}] Fetching applications for payment:`, {
        payment_id: payment.id,
        reference_number: payment.reference_number,
        customer_id: payment.customer_id,
        customer_name: payment.customer_name
      });

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/fetch-payment-applications?paymentRef=${encodeURIComponent(payment.reference_number)}&type=${encodeURIComponent(payment.type || 'Payment')}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch: ${errorText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch applications');
      }

      applicationsData = result.applications || [];

      const invoices = result.applications.filter((app: any) =>
        app.docType.toLowerCase().includes('invoice')
      );
      const creditMemos = result.applications.filter((app: any) =>
        app.docType.toLowerCase().includes('credit')
      );

      let message = `Successfully fetched ${result.applications.length} application(s) for payment ${payment.reference_number}\n\n`;

      if (invoices.length > 0) {
        message += `Invoices (${invoices.length}):\n`;
        invoices.forEach((inv: any) => {
          message += `  • ${inv.refNbr} - $${inv.amountPaid.toFixed(2)}\n`;
        });
      }

      if (creditMemos.length > 0) {
        message += `\nCredit Memos (${creditMemos.length}):\n`;
        creditMemos.forEach((cm: any) => {
          message += `  • ${cm.refNbr} - $${cm.amountPaid.toFixed(2)}\n`;
        });
      }

      console.log(`[${new Date().toISOString()}] Successfully fetched ${result.applications.length} applications`);

      alert(message);

      const { data: apps, error } = await supabase
        .from('payment_invoice_applications')
        .select('*')
        .eq('payment_id', payment.id);

      if (!error && apps) {
        setPaymentApplications(prev => {
          const newMap = new Map(prev);
          newMap.set(payment.id, apps);
          return newMap;
        });
      }
    } catch (error) {
      fetchStatus = 'error';
      errorMessage = (error as Error).message;
      console.error(`[${new Date().toISOString()}] Error fetching payment applications:`, error);
      alert('Failed to fetch payment applications: ' + (error as Error).message);
    } finally {
      await supabase
        .from('payment_application_fetch_logs')
        .insert({
          payment_id: payment.id,
          payment_reference_number: payment.reference_number,
          customer_id: payment.customer_id,
          customer_name: payment.customer_name,
          applications_count: applicationsData.length,
          fetched_by: profile?.id,
          fetched_at: fetchStartTime,
          fetch_status: fetchStatus,
          error_message: errorMessage,
          applications_data: applicationsData.length > 0 ? applicationsData : null
        });

      console.log(`[${new Date().toISOString()}] Logged fetch operation for payment ${payment.reference_number} (Status: ${fetchStatus})`);

      setFetchingPaymentId(null);
    }
  };

  const fetchPaymentDetails = async (paymentId: string) => {
    setLoadingPaymentDetails(true);
    try {
      const [paymentResult, customerMap] = await Promise.all([
        supabase.from('acumatica_payments').select('*').eq('id', paymentId).maybeSingle(),
        ensureCustomerMap()
      ]);

      if (paymentResult.error) throw paymentResult.error;

      setSelectedPayment({
        ...paymentResult.data,
        customer_name: customerMap.get(paymentResult.data?.customer_id) || paymentResult.data?.customer_id
      });
    } catch (error) {
      console.error('Error fetching payment details:', error);
      alert('Failed to load payment details');
    } finally {
      setLoadingPaymentDetails(false);
    }
  };

  const handlePaymentClick = (payment: any) => {
    fetchPaymentDetails(payment.id);
  };

  const loadPaymentApplications = async (payments: any[]) => {
    try {
      const paymentIds = payments.map(p => p.id);
      const batchSize = 100;
      const allData: any[] = [];

      for (let i = 0; i < paymentIds.length; i += batchSize) {
        const batch = paymentIds.slice(i, i + batchSize);

        const { data, error } = await supabase
          .from('payment_invoice_applications')
          .select('*')
          .in('payment_id', batch);

        if (error) throw error;
        if (data) allData.push(...data);
      }

      const applicationsMap = new Map<string, any[]>();
      allData.forEach((app: any) => {
        if (!applicationsMap.has(app.payment_id)) {
          applicationsMap.set(app.payment_id, []);
        }
        applicationsMap.get(app.payment_id)!.push(app);
      });

      setPaymentApplications(prev => {
        const newMap = new Map(prev);
        applicationsMap.forEach((apps, paymentId) => {
          newMap.set(paymentId, apps);
        });
        return newMap;
      });

      const uniqueInvoiceRefs = [...new Set(allData.map(app => app.invoice_reference_number))];
      await checkInvoiceExistence(uniqueInvoiceRefs);
    } catch (error) {
      console.error('Error loading payment applications:', error);
    }
  };

  const checkInvoiceExistence = async (invoiceRefs: string[]) => {
    try {
      if (invoiceRefs.length === 0) return;

      const batchSize = 100;
      const existenceMap = new Map<string, boolean>();

      for (let i = 0; i < invoiceRefs.length; i += batchSize) {
        const batch = invoiceRefs.slice(i, i + batchSize);

        const { data, error } = await supabase
          .from('acumatica_invoices')
          .select('reference_number')
          .in('reference_number', batch);

        if (error) throw error;

        const existingRefs = new Set(data?.map(inv => inv.reference_number) || []);

        batch.forEach(ref => {
          existenceMap.set(ref, existingRefs.has(ref));
        });
      }

      setInvoiceExistence(existenceMap);
    } catch (error) {
      console.error('Error checking invoice existence:', error);
    }
  };

  const navigateToInvoice = (invoiceRef: string) => {
    if (onNavigate) {
      localStorage.setItem('invoiceSearchTerm', invoiceRef);
      onNavigate('invoices');
    }
  };

  const handleExportToExcel = () => {
    if (displayedPayments.length === 0) {
      alert('No payments to export');
      return;
    }

    setExporting(true);
    try {
      const exportData = displayedPayments.map(payment => {
        const applications = paymentApplications.get(payment.id) || [];
        const attachments = paymentAttachments.get(payment.id) || [];

        return {
          reference_number: payment.reference_number,
          customer: payment.customer_name || payment.customer_id,
          type: payment.type,
          status: payment.status,
          application_date: payment.application_date || '',
          payment_amount: parseFloat(payment.payment_amount || 0),
          available_balance: parseFloat(payment.available_balance || 0),
          currency: payment.currency_id || '',
          payment_method: payment.payment_method || '',
          payment_ref: payment.payment_ref || '',
          cash_account: payment.cash_account || '',
          description: payment.description || '',
          applications_count: applications.length,
          attachments_count: attachments.length,
          hold: payment.hold ? 'Yes' : 'No',
          is_cc_payment: payment.is_cc_payment ? 'Yes' : 'No'
        };
      });

      exportExcel({
        filename: `payments_${new Date().toISOString().split('T')[0]}`,
        sheetName: 'Payments',
        title: 'Payments Report',
        subtitle: `Generated on ${new Date().toLocaleDateString()} - ${exportData.length} payments`,
        columns: [
          { header: 'Reference Number', key: 'reference_number', width: 20 },
          { header: 'Customer', key: 'customer', width: 30 },
          { header: 'Type', key: 'type', width: 15 },
          { header: 'Status', key: 'status', width: 12 },
          { header: 'Application Date', key: 'application_date', width: 15, format: formatDate },
          { header: 'Payment Amount', key: 'payment_amount', width: 15, format: formatCurrency },
          { header: 'Available Balance', key: 'available_balance', width: 15, format: formatCurrency },
          { header: 'Currency', key: 'currency', width: 10 },
          { header: 'Payment Method', key: 'payment_method', width: 15 },
          { header: 'Payment Ref', key: 'payment_ref', width: 20 },
          { header: 'Cash Account', key: 'cash_account', width: 20 },
          { header: 'Description', key: 'description', width: 30 },
          { header: 'Applications Count', key: 'applications_count', width: 18 },
          { header: 'Attachments Count', key: 'attachments_count', width: 18 },
          { header: 'On Hold', key: 'hold', width: 10 },
          { header: 'CC Payment', key: 'is_cc_payment', width: 12 }
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

  const loadPaymentAttachments = async (payments: any[]) => {
    try {
      const paymentRefs = payments.map(p => p.reference_number);
      const batchSize = 100;
      const allData: any[] = [];

      for (let i = 0; i < paymentRefs.length; i += batchSize) {
        const batch = paymentRefs.slice(i, i + batchSize);

        const { data, error } = await supabase
          .from('payment_attachments')
          .select('*')
          .in('payment_reference_number', batch);

        if (error) throw error;
        if (data) allData.push(...data);
      }

      const attachmentsMap = new Map<string, any[]>();
      allData.forEach((att: any) => {
        const payment = payments.find(p => p.reference_number === att.payment_reference_number);
        if (payment) {
          if (!attachmentsMap.has(payment.id)) {
            attachmentsMap.set(payment.id, []);
          }
          attachmentsMap.get(payment.id)!.push(att);
        }
      });

      setPaymentAttachments(attachmentsMap);
    } catch (error) {
      console.error('Error loading payment attachments:', error);
    }
  };


  const getUniqueCustomers = () => {
    const customers = displayedPayments
      .map(pay => ({ id: pay.customer_id, name: pay.customer_name }))
      .filter(c => c.name)
      .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name));
    return customers;
  };

  const filteredPayments = displayedPayments
    .filter(payment => {
      const matchesSearch = true;
      const matchesStatus = true;
      const matchesCustomer = true;
      const matchesType = true;

      return matchesSearch && matchesStatus && matchesCustomer && matchesType;
    })
    .sort((a, b) => {
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase();
        const aRefMatch = a.reference_number?.toLowerCase() === searchLower;
        const bRefMatch = b.reference_number?.toLowerCase() === searchLower;

        if (aRefMatch && !bRefMatch) return -1;
        if (!aRefMatch && bRefMatch) return 1;
      }

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
    setTypeFilter('all');
    setHasApplicationsFilter(false);
    setSortBy('application_date');
    setSortOrder('desc');
    loadPayments(0);
  };

  const activeFiltersCount = [
    searchTerm !== '',
    statusFilter !== 'all',
    customerFilter !== 'all',
    typeFilter !== 'all',
    hasApplicationsFilter
  ].filter(Boolean).length;


  const formatCurrency = (amount: number) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Wait for permissions to load before checking access
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
              You do not have permission to view Payments.
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Acumatica Payments</h1>
              <p className="text-gray-600">
                {isSearching
                  ? `${displayedPayments.length} search result${displayedPayments.length !== 1 ? 's' : ''}`
                  : `Page ${currentPage + 1} of ${Math.ceil(totalCount / pageSize)} (${totalCount} total payments)`
                }
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadPayments(0)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExportToExcel}
                disabled={loading || exporting || displayedPayments.length === 0}
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
                placeholder="Search by reference number, customer, description, or payment reference (min 3 characters)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
              onClick={handleSearch}
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
            <div className="bg-white border border-gray-300 rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Filter & Sort Options</h3>
                {activeFiltersCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear All Filters
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Type
                  </label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="Payment">Payment</option>
                    <option value="Prepayment">Prepayment</option>
                    <option value="Credit Memo">Credit Memo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer
                  </label>
                  <select
                    value={customerFilter}
                    onChange={(e) => setCustomerFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All Customers</option>
                    {getUniqueCustomers().map(customer => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <input
                    type="checkbox"
                    id="hasApplications"
                    checked={hasApplicationsFilter}
                    onChange={(e) => setHasApplicationsFilter(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="hasApplications" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Show only payments with invoice applications (975 payments)
                  </label>
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
                      <option value="application_date">Application Date</option>
                      <option value="reference_number">Reference Number</option>
                      <option value="customer_id">Customer</option>
                      <option value="payment_amount">Amount</option>
                      <option value="status">Status</option>
                      <option value="type">Type</option>
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
              </div>

              <div className="pt-4 border-t border-gray-300">
                <p className="text-sm text-gray-600">
                  Showing <span className="text-gray-900 font-semibold">{filteredPayments.length}</span> of{' '}
                  <span className="text-gray-900 font-semibold">{displayedPayments.length}</span> loaded
                  {totalCount > displayedPayments.length && (
                    <span> ({totalCount} total in database)</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {!isSearching && !loading && filteredPayments.length > 0 && (
          <div className="flex items-center justify-between mb-4 px-4">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 0 || loading}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
              Previous
            </button>
            <span className="text-gray-600">
              Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)} (Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalCount)})
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
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payments...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="bg-white border border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg mb-2">
              {searchTerm ? 'No payments found matching your search' : 'No payments synced yet'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
            <div className="max-h-[calc(100vh-400px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Reference</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Customer</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Type</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Status</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Application Date</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Payment Method</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Payment Ref</th>
                    <th className="text-right py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Amount</th>
                    <th className="text-right py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Available</th>
                    <th className="text-center py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Applications</th>
                    <th className="text-center py-3 px-4 text-gray-700 font-semibold text-sm border-r border-gray-300">Attachments</th>
                    <th className="text-left py-3 px-4 text-gray-700 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment, index) => {
                    const applications = paymentApplications.get(payment.id) || [];
                    const attachments = paymentAttachments.get(payment.id) || [];

                    return (
                      <React.Fragment key={payment.id}>
                        <tr
                          className={`border-b border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors ${
                            index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                          }`}
                          onClick={() => handlePaymentClick(payment)}
                        >
                          <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                            <span className="font-medium">{payment.reference_number || 'N/A'}</span>
                          </td>
                          <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                            {payment.customer_name || payment.customer_id || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                            {payment.type || 'Payment'}
                          </td>
                          <td className="py-3 px-4 text-sm border-r border-gray-300">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              payment.status === 'Open'
                                ? 'bg-green-100 text-green-800'
                                : payment.status === 'Closed'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {payment.status || 'Unknown'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                            {formatDateUtil(payment.application_date)}
                          </td>
                          <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                            {payment.payment_method || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-gray-900 text-sm border-r border-gray-300">
                            {payment.payment_ref || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-gray-900 text-sm text-right font-medium border-r border-gray-300">
                            {formatCurrency(payment.payment_amount)}
                          </td>
                          <td className="py-3 px-4 text-blue-600 text-sm text-right font-medium border-r border-gray-300">
                            {formatCurrency(payment.available_balance)}
                          </td>
                          <td className="py-3 px-4 text-sm text-center border-r border-gray-300">
                            {applications.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">
                                <FileText className="w-3.5 h-3.5" />
                                {applications.length} app{applications.length !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-center border-r border-gray-300" onClick={(e) => e.stopPropagation()}>
                            {attachments.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {attachments.map((att) => (
                                  <button
                                    key={att.id}
                                    onClick={async () => {
                                      try {
                                        const { data, error } = await supabase.storage
                                          .from('payment-check-images')
                                          .createSignedUrl(att.storage_path, 3600);

                                        if (error) throw error;

                                        if (data?.signedUrl) {
                                          window.open(data.signedUrl, '_blank');
                                        } else {
                                          throw new Error('Failed to generate download URL');
                                        }
                                      } catch (error) {
                                        console.error('Error opening attachment:', error);
                                        alert('Failed to open attachment: ' + (error as Error).message);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-xs font-medium transition-colors"
                                    title={att.file_name}
                                  >
                                    <Download className="w-3 h-3" />
                                    {att.file_name.length > 15
                                      ? att.file_name.substring(0, 12) + '...'
                                      : att.file_name}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                            {canPerformFetch && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetchSinglePaymentApplications(payment);
                                }}
                                disabled={fetchingPaymentId === payment.id}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors"
                                title="Fetch application history for this payment"
                              >
                                {fetchingPaymentId === payment.id ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Fetching...
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3 h-3" />
                                    Fetch Apps
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                        {applications.length > 0 && (
                          <tr key={`${payment.id}-apps`} className="bg-blue-50">
                            <td colSpan={12} className="py-4 px-6">
                              <div className="space-y-2">
                                <h4 className="font-semibold text-gray-900 text-sm mb-3">Payment Applications:</h4>
                                <div className="grid gap-2">
                                  {applications.map((app, idx) => {
                                    const invoiceExists = invoiceExistence.get(app.invoice_reference_number);
                                    const isInvoice = app.doc_type?.toLowerCase().includes('invoice');

                                    return (
                                      <div
                                        key={idx}
                                        className="bg-white border border-blue-200 rounded-lg p-3 text-sm"
                                      >
                                        <div className="grid grid-cols-6 gap-3 mb-2">
                                          <div>
                                            <span className="text-gray-600 text-xs">Doc Type:</span>
                                            <p className="font-medium text-gray-900">{app.doc_type || 'N/A'}</p>
                                          </div>
                                          <div>
                                            <span className="text-gray-600 text-xs">Reference:</span>
                                            {isInvoice && invoiceExists ? (
                                              <button
                                                onClick={() => navigateToInvoice(app.invoice_reference_number)}
                                                className="font-medium text-blue-600 hover:text-blue-800 underline"
                                                title="Click to view invoice"
                                              >
                                                {app.invoice_reference_number}
                                              </button>
                                            ) : (
                                              <p className="font-medium text-gray-900">{app.invoice_reference_number}</p>
                                            )}
                                            {isInvoice && invoiceExists === false && (
                                              <p className="text-xs text-red-600 mt-0.5">Invoice not found in database</p>
                                            )}
                                          </div>
                                          <div>
                                            <span className="text-gray-600 text-xs">Invoice Date:</span>
                                            <p className="text-gray-900">{app.invoice_date ? formatDateUtil(app.invoice_date) : 'N/A'}</p>
                                          </div>
                                          <div>
                                            <span className="text-gray-600 text-xs">Balance:</span>
                                            <p className="text-gray-900">{formatCurrency(app.balance)}</p>
                                          </div>
                                          <div>
                                            <span className="text-gray-600 text-xs">Amount Paid:</span>
                                            <p className="font-semibold text-green-700">{formatCurrency(app.amount_paid)}</p>
                                          </div>
                                          <div>
                                            <span className="text-gray-600 text-xs">Customer Order:</span>
                                            <p className="text-gray-900">{app.customer_order || 'N/A'}</p>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isSearching && filteredPayments.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-gray-50 border-t border-gray-300">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 0 || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 border border-gray-300 rounded-lg transition-colors"
                >
                  <ChevronLeft size={20} />
                  Previous
                </button>
                <span className="text-gray-600">
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
            )}
            {isSearching && (
              <div className="p-4 text-center text-gray-600 text-sm bg-gray-50 border-t border-gray-300">
                Showing {filteredPayments.length} search result{filteredPayments.length !== 1 ? 's' : ''} from entire database
              </div>
            )}
          </div>
        )}

        {(selectedPayment || loadingPaymentDetails) && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            onClick={() => {
              setSelectedPayment(null);
              setLoadingPaymentDetails(false);
            }}
          >
            <div
              className="bg-white border border-gray-300 rounded-lg p-8 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {loadingPaymentDetails ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="ml-3 text-gray-600">Loading payment details...</span>
                </div>
              ) : selectedPayment ? (
                <>
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Payment {selectedPayment.reference_number || 'Details'}
                      </h2>
                      <p className="text-gray-600">{selectedPayment.customer_name || selectedPayment.customer_id}</p>
                    </div>
                    <button
                      onClick={() => setSelectedPayment(null)}
                      className="text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      <span className="sr-only">Close</span>
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {Object.entries(selectedPayment).map(([key, value]) => {
                      if (key === 'id' || key === 'raw_data' || key === 'applied_to_documents' || key === 'applied_to_orders') return null;

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
                      } else if (typeof value === 'number' && (key.includes('balance') || key.includes('amount'))) {
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
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
