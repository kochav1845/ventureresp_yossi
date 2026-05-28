import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ArrowLeft, DollarSign, FileText, CreditCard, Calendar, TrendingUp, AlertCircle, TrendingDown, MessageSquare, Send, Tag, Clock, User, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Ticket, ChevronRight, PauseCircle } from 'lucide-react';
import { supabase, logActivity } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePageCache } from '../contexts/PageCacheContext';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { getAcumaticaInvoiceUrl, getAcumaticaPaymentUrl } from '../lib/acumaticaLinks';
import InvoiceFilterPanel from './InvoiceFilterPanel';
import CustomerTimelineChart from './CustomerTimelineChart';
import CustomerMonthlySheet from './CustomerMonthlySheet';

interface CustomerDetailViewProps {
  customerId: string;
  onBack?: () => void;
}

interface CustomerNote {
  id: string;
  note_text: string;
  note_type: string;
  created_by_user_name: string;
  created_by_user_email: string;
  created_at: string;
}

interface CustomerData {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_status: string | null;
  email_address: string | null;
  phone1: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  customer_class: string | null;
  terms: string | null;
  credit_limit: number | null;
  calculated_balance: number | null;
  gross_balance: number | null;
  credit_memo_balance: number | null;
  open_invoice_count: number | null;
  balanced_invoice_count: number | null;
  balanced_invoice_balance: number | null;
  red_count: number | null;
  yellow_count: number | null;
  green_count: number | null;
  max_days_overdue: number | null;
  customer_type?: string;
  contact_status?: string;
  last_contact_date?: string;
  last_order_date?: string;
  days_from_invoice_threshold?: number;
}

interface InvoiceData {
  id: string;
  acumatica_id: string;
  reference_number: string;
  type: string;
  status: string;
  date: string;
  due_date: string | null;
  amount: number;
  balance: number;
  color_status: string | null;
  description: string | null;
}

interface PaymentData {
  id: string;
  acumatica_id: string;
  reference_number: string;
  payment_date: string;
  payment_method: string | null;
  amount: number;
  payment_amount?: number;
  application_date?: string;
  unapplied_balance: number | null;
  status: string;
  type?: string;
  description?: string;
  available_balance?: number;
}

interface TicketData {
  id: string;
  ticket_number: string;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
  assigned_collector_id: string | null;
  collector_name: string | null;
  collector_email: string | null;
  invoice_count: number;
}

export default function CustomerDetailView({ customerId, onBack }: CustomerDetailViewProps) {
  const { profile } = useAuth();
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
  const handleBack = onBack || (() => rawNavigate(-1));
  const { getCachedState, setCachedState } = usePageCache(`customer-detail-${customerId}`);
  const cachedDetail = useRef(getCachedState());
  const cd = cachedDetail.current;

  const inheritedAmountMin = searchParams.get('amountMin') || '';
  const inheritedAmountMax = searchParams.get('amountMax') || '';
  const inheritedDaysMin = searchParams.get('daysMin') || '';
  const inheritedDaysMax = searchParams.get('daysMax') || '';
  const inheritedDateFrom = searchParams.get('dateFrom') || '';
  const inheritedDateTo = searchParams.get('dateTo') || '';
  const [customer, setCustomer] = useState<CustomerData | null>(() => cd?.customer ?? null);
  const [displayedInvoices, setDisplayedInvoices] = useState<InvoiceData[]>(() => cd?.displayedInvoices ?? []);
  const [payments, setPayments] = useState<PaymentData[]>(() => cd?.payments ?? []);
  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>(() => cd?.customerNotes ?? []);
  const [tickets, setTickets] = useState<TicketData[]>(() => cd?.tickets ?? []);
  const [loadingCustomer, setLoadingCustomer] = useState(() => !cd);
  const [loadingChart, setLoadingChart] = useState(() => !cd);
  const [loadingInvoices, setLoadingInvoices] = useState(() => !cd);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(() => !cd);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'open-invoices' | 'balanced-invoices' | 'paid-invoices' | 'payments' | 'email-tracking'>(() => cd?.activeTab ?? 'open-invoices');
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [savingNote, setSavingNote] = useState(false);
  const [invoiceCounts, setInvoiceCounts] = useState(() => cd?.invoiceCounts ?? { total: 0, open: 0, paid: 0, balanced: 0 });
  const [invoiceColorCounts, setInvoiceColorCounts] = useState(() => cd?.invoiceColorCounts ?? { red: 0, yellow: 0, green: 0, total: 0 });
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(() => cd?.hasMore ?? true);
  const observer = useRef<IntersectionObserver | null>(null);
  const ITEMS_PER_PAGE = 50;

  const [advancedFilters, setAdvancedFilters] = useState(() => cd?.advancedFilters ?? {
    dateFrom: inheritedDateFrom,
    dateTo: inheritedDateTo,
    amountMin: inheritedAmountMin,
    amountMax: inheritedAmountMax,
    daysOverdueMin: inheritedDaysMin,
    daysOverdueMax: inheritedDaysMax,
    colorStatus: '',
    invoiceStatus: '',
    sortBy: 'date',
    sortOrder: 'desc' as 'asc' | 'desc'
  });
  const [invoiceStats, setInvoiceStats] = useState<any>(() => cd?.invoiceStats ?? null);
  const [filteredStats, setFilteredStats] = useState<any>(() => cd?.filteredStats ?? null);
  const [changingColorForInvoice, setChangingColorForInvoice] = useState<string | null>(null);
  const [avgDaysToCollect, setAvgDaysToCollect] = useState<number | null>(() => cd?.avgDaysToCollect ?? null);
  const [excludeCreditMemos, setExcludeCreditMemos] = useState(() => cd?.excludeCreditMemos ?? false);

  const restoredFromCache = useRef(!!cd);

  const stateRef = useRef<Record<string, any>>({});
  useEffect(() => {
    stateRef.current = {
      customer, displayedInvoices, payments, customerNotes, tickets, activeTab,
      invoiceCounts, invoiceColorCounts, advancedFilters, invoiceStats, filteredStats,
      avgDaysToCollect, excludeCreditMemos, hasMore,
    };
  });

  useEffect(() => {
    return () => { setCachedState(stateRef.current); };
  }, []);

  useEffect(() => {
    if (restoredFromCache.current) {
      return;
    }
    loadCustomerBasicInfo();
    loadInvoiceStats();
    loadChartData();
    loadTickets();
  }, [customerId]);

  useEffect(() => {
    if (restoredFromCache.current) return;
    loadCustomerBasicInfo();
  }, [excludeCreditMemos]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.color-picker-container')) {
        setChangingColorForInvoice(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (page > 0) {
      loadMoreInvoices();
    }
  }, [page]);

  useEffect(() => {
    if (restoredFromCache.current) {
      restoredFromCache.current = false;
      return;
    }
    setPage(0);
    setDisplayedInvoices([]);
    setHasMore(true);
    loadInvoices(0, false);
    loadFilteredStats();
  }, [activeTab, JSON.stringify(advancedFilters), excludeCreditMemos]);

  // Load customer basic info first (fastest - shows immediately)
  const loadCustomerBasicInfo = async () => {
    setLoadingCustomer(true);
    try {
      const { data: custRow, error: custError } = await supabase
        .from('acumatica_customers')
        .select('*')
        .eq('customer_id', customerId)
        .maybeSingle();

      if (custError) throw custError;

      if (!custRow) {
        setCustomer(null);
        setLoadingCustomer(false);
        return;
      }

      const { data: outstandingInvoices, error: invError } = await supabase
        .from('acumatica_invoices')
        .select('balance, type, status')
        .eq('customer', customerId)
        .in('status', ['Open', 'Balanced'])
        .gt('balance', 0);

      let calculatedBalance = 0;
      let grossBalance = 0;
      let creditMemoBalance = 0;
      let openInvoiceCount = 0;
      let balancedInvoiceCount = 0;
      let balancedInvoiceBalance = 0;

      if (!invError && outstandingInvoices) {
        outstandingInvoices.forEach((inv: any) => {
          if (inv.type === 'Credit Memo') {
            creditMemoBalance += inv.balance;
          } else {
            grossBalance += inv.balance;
            if (inv.status === 'Balanced') {
              balancedInvoiceCount++;
              balancedInvoiceBalance += inv.balance;
            } else {
              openInvoiceCount++;
            }
          }
        });
        calculatedBalance = excludeCreditMemos ? grossBalance : grossBalance - creditMemoBalance;
      }

      const customerData: CustomerData = {
        id: custRow.id,
        customer_id: custRow.customer_id,
        customer_name: custRow.customer_name,
        customer_status: custRow.customer_status,
        email_address: custRow.email_address,
        phone1: custRow.phone1,
        address_line1: custRow.address_line1,
        address_line2: custRow.address_line2,
        city: custRow.city,
        state: custRow.state,
        postal_code: custRow.postal_code,
        country: custRow.country,
        customer_class: custRow.customer_class,
        terms: custRow.terms,
        credit_limit: custRow.credit_limit,
        calculated_balance: calculatedBalance,
        gross_balance: grossBalance,
        credit_memo_balance: creditMemoBalance,
        open_invoice_count: openInvoiceCount,
        balanced_invoice_count: balancedInvoiceCount,
        balanced_invoice_balance: balancedInvoiceBalance,
        red_count: null,
        yellow_count: null,
        green_count: null,
        max_days_overdue: null,
        customer_type: custRow.customer_type,
        contact_status: custRow.contact_status,
        last_contact_date: custRow.last_contact_date,
        last_order_date: custRow.last_order_date,
        days_from_invoice_threshold: custRow.days_from_invoice_threshold
      };
      setCustomer(customerData);

      await logActivity('customer_viewed', 'customer', customerId, {
        customer_name: customerData?.customer_name
      });

      // Get invoice counts
      const { data: counts, error: countsError } = await supabase
        .rpc('get_customer_invoices_count', { p_customer_id: customerId });

      if (countsError) throw countsError;
      if (counts && counts.length > 0) {
        setInvoiceCounts({
          total: counts[0].total_count || 0,
          open: counts[0].open_count || 0,
          paid: counts[0].paid_count || 0,
          balanced: counts[0].balanced_count || 0
        });
      }

      // Load color status counts
      const { data: colorCounts, error: colorCountsError } = await supabase
        .from('acumatica_invoices')
        .select('color_status')
        .eq('customer', customerId)
        .neq('status', 'On Hold')
        .gt('balance', 0);

      if (!colorCountsError && colorCounts) {
        const counts = colorCounts.reduce((acc, inv) => {
          if (inv.color_status === 'red') acc.red++;
          else if (inv.color_status === 'yellow') acc.yellow++;
          else if (inv.color_status === 'green') acc.green++;
          acc.total++;
          return acc;
        }, { red: 0, yellow: 0, green: 0, total: 0 });
        setInvoiceColorCounts(counts);
      }

      // Load average days to collect
      const { data: avgDays, error: avgDaysError } = await supabase
        .rpc('get_customer_avg_days_to_collect', { customer_id_param: customerId });

      if (!avgDaysError && avgDays !== null) {
        setAvgDaysToCollect(avgDays);
      }

      // Load customer notes
      const { data: notesData, error: notesError } = await supabase
        .from('customer_notes')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;
      setCustomerNotes(notesData || []);
    } catch (error) {
      console.error('Error loading customer data:', error);
    } finally {
      setLoadingCustomer(false);
    }
  };

  // Load chart data separately
  const loadChartData = async () => {
    setLoadingChart(true);
    try {
      // Chart will load its own data via CustomerTimelineChart component
      // Just mark as loaded after a brief moment
      setTimeout(() => setLoadingChart(false), 100);
    } catch (error) {
      console.error('Error loading chart data:', error);
      setLoadingChart(false);
    }
  };

  // Load tickets for this customer
  const loadTickets = async () => {
    setLoadingTickets(true);
    try {
      const { data, error } = await supabase
        .from('collection_tickets')
        .select(`
          id,
          ticket_number,
          status,
          priority,
          notes,
          created_at,
          assigned_collector_id,
          user_profiles!collection_tickets_assigned_collector_id_fkey (
            full_name,
            email
          ),
          invoice_assignments (
            invoice_reference_number
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const ticketsWithCollector = (data || []).map(ticket => ({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        priority: ticket.priority,
        notes: ticket.notes,
        created_at: ticket.created_at,
        assigned_collector_id: ticket.assigned_collector_id,
        collector_name: ticket.user_profiles?.full_name || null,
        collector_email: ticket.user_profiles?.email || null,
        invoice_count: ticket.invoice_assignments?.length || 0
      }));

      setTickets(ticketsWithCollector);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoadingTickets(false);
    }
  };

  // Load payments on-demand when tab is clicked
  const loadPaymentsData = async () => {
    if (payments.length > 0) return; // Already loaded
    if (!customer) return; // Need customer data first

    setLoadingPayments(true);
    try {
      // Get the Acumatica customer ID from customer object
      const acumaticaCustomerId = customer.customer_id;

      let allPaymentsData: any[] = [];
      let hasMorePayments = true;
      let offset = 0;
      const CHUNK_SIZE = 1000;

      while (hasMorePayments) {
        const { data: chunk, error: paymentsError } = await supabase
          .from('acumatica_payments')
          .select('id, reference_number, application_date, doc_date, payment_method, status, payment_amount, available_balance, description, type')
          .eq('customer_id', acumaticaCustomerId)
          .order('application_date', { ascending: false })
          .range(offset, offset + CHUNK_SIZE - 1);

        if (paymentsError) throw paymentsError;

        if (chunk && chunk.length > 0) {
          allPaymentsData = [...allPaymentsData, ...chunk];
          offset += CHUNK_SIZE;
          hasMorePayments = chunk.length === CHUNK_SIZE;
        } else {
          hasMorePayments = false;
        }
      }

      setPayments(allPaymentsData);
    } catch (error) {
      console.error('Error loading payments:', error);
    } finally {
      setLoadingPayments(false);
    }
  };

  const loadInvoiceStats = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_customer_invoice_stats', { p_customer_id: customerId });

      if (error) throw error;
      if (data && data.length > 0) {
        setInvoiceStats(data[0]);
      }
    } catch (error) {
      console.error('Error loading invoice stats:', error);
    }
  };

  const loadFilteredStats = async () => {
    try {
      const tabFilter = activeTab === 'open-invoices' ? 'open' : activeTab === 'balanced-invoices' ? 'balanced' : activeTab === 'paid-invoices' ? 'paid' : 'all';
      const filterType = advancedFilters.invoiceStatus ? 'all' : tabFilter;

      const { data, error } = await supabase
        .rpc('get_customer_invoices_advanced_count', {
          p_customer_id: customerId,
          p_filter: filterType,
          p_date_from: advancedFilters.dateFrom || null,
          p_date_to: advancedFilters.dateTo || null,
          p_amount_min: advancedFilters.amountMin ? parseFloat(advancedFilters.amountMin) : null,
          p_amount_max: advancedFilters.amountMax ? parseFloat(advancedFilters.amountMax) : null,
          p_color_status: advancedFilters.colorStatus || null,
          p_invoice_status: advancedFilters.invoiceStatus || null,
          p_exclude_credit_memos: excludeCreditMemos,
          p_min_days_overdue: advancedFilters.daysOverdueMin ? parseInt(advancedFilters.daysOverdueMin) : null,
          p_max_days_overdue: advancedFilters.daysOverdueMax ? parseInt(advancedFilters.daysOverdueMax) : null
        });

      if (error) throw error;
      if (data && data.length > 0) {
        setFilteredStats(data[0]);
      }
    } catch (error) {
      console.error('Error loading filtered stats:', error);
    }
  };

  const loadInvoices = async (offset = 0, append = false) => {
    if (!append) setLoadingInvoices(true);
    try {
      const tabFilter = activeTab === 'open-invoices' ? 'open' : activeTab === 'balanced-invoices' ? 'balanced' : activeTab === 'paid-invoices' ? 'paid' : 'all';
      const filterType = advancedFilters.invoiceStatus ? 'all' : tabFilter;

      const { data, error } = await supabase
        .rpc('get_customer_invoices_advanced', {
          p_customer_id: customerId,
          p_filter: filterType,
          p_date_from: advancedFilters.dateFrom || null,
          p_date_to: advancedFilters.dateTo || null,
          p_amount_min: advancedFilters.amountMin ? parseFloat(advancedFilters.amountMin) : null,
          p_amount_max: advancedFilters.amountMax ? parseFloat(advancedFilters.amountMax) : null,
          p_color_status: advancedFilters.colorStatus || null,
          p_invoice_status: advancedFilters.invoiceStatus || null,
          p_sort_by: advancedFilters.sortBy,
          p_sort_order: advancedFilters.sortOrder,
          p_limit: ITEMS_PER_PAGE,
          p_offset: offset,
          p_exclude_credit_memos: excludeCreditMemos,
          p_min_days_overdue: advancedFilters.daysOverdueMin ? parseInt(advancedFilters.daysOverdueMin) : null,
          p_max_days_overdue: advancedFilters.daysOverdueMax ? parseInt(advancedFilters.daysOverdueMax) : null
        });

      if (error) throw error;

      if (append) {
        setDisplayedInvoices(prev => [...prev, ...(data || [])]);
      } else {
        setDisplayedInvoices(data || []);
      }

      setHasMore((data?.length || 0) === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoadingInvoices(false);
      setLoadingMore(false);
    }
  };

  const loadMoreInvoices = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadInvoices(displayedInvoices.length, true);
  };

  const lastInvoiceRef = useCallback((node: HTMLDivElement) => {
    if (loadingInvoices || loadingMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1);
      }
    });

    if (node) observer.current.observe(node);
  }, [loadingInvoices, loadingMore, hasMore]);

  const handleSaveNote = async () => {
    if (!newNote.trim() || !profile) return;

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('customer_notes')
        .insert({
          customer_id: customerId,
          customer_name: customer?.customer_name,
          created_by_user_id: profile.id,
          created_by_user_email: profile.email,
          created_by_user_name: profile.full_name || profile.email,
          note_text: newNote.trim(),
          note_type: noteType
        });

      if (error) throw error;

      await logActivity('customer_note_added', 'customer', customerId, {
        customer_name: customer?.customer_name,
        note_type: noteType
      });

      setNewNote('');
      setNoteType('general');
      await loadCustomerBasicInfo();
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };


  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };


  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'bg-yellow-100 text-yellow-800';
      case 'balanced':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      case 'voided':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  if (loadingCustomer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer details...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <button onClick={handleBack} className="mb-6 flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Customers
        </button>
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Customer not found</p>
        </div>
      </div>
    );
  }

  const handleColorClick = (color: string) => {
    // Set color filter in advanced filters
    setAdvancedFilters(prev => ({
      ...prev,
      colorStatus: color
    }));
    setActiveTab('open-invoices');
  };

  const clearColorFilter = () => {
    setAdvancedFilters(prev => ({
      ...prev,
      colorStatus: ''
    }));
  };

  const handleColorChange = async (invoiceId: string, newColor: string | null) => {
    if (!profile?.id) return;

    try {
      // Get the current color before changing
      const currentInvoice = displayedInvoices.find(inv => inv.id === invoiceId);
      const oldColor = currentInvoice?.color_status || null;

      const { error } = await supabase.rpc('update_invoice_color_status', {
        p_invoice_id: invoiceId,
        p_color_status: newColor,
        p_user_id: profile.id
      });

      if (error) throw error;

      await logActivity(
        'update',
        'invoice_color_status',
        invoiceId,
        {
          invoice_id: invoiceId,
          old_color: oldColor,
          new_color: newColor,
          customer_id: customerId
        }
      );

      setDisplayedInvoices(prev =>
        prev.map(inv =>
          inv.id === invoiceId ? { ...inv, color_status: newColor } : inv
        )
      );

      setChangingColorForInvoice(null);

      await loadCustomerBasicInfo();
      await loadInvoiceStats();
      await loadFilteredStats();

    } catch (error) {
      console.error('Error updating invoice color:', error);
    }
  };

  const handleAdvancedFiltersChange = (newFilters: typeof advancedFilters) => {
    setAdvancedFilters(newFilters);
  };

  const handleTicketClick = (ticketId: string, isClosed?: boolean) => {
    navigate(`/ticket/${ticketId}`);
  };

  const handleQuickFilter = (type: string) => {
    if (!invoiceStats) return;

    switch (type) {
      case 'highest':
        setAdvancedFilters(prev => ({
          ...prev,
          sortBy: 'amount',
          sortOrder: 'desc'
        }));
        break;
      case 'lowest':
        setAdvancedFilters(prev => ({
          ...prev,
          sortBy: 'amount',
          sortOrder: 'asc'
        }));
        break;
      case 'oldest_unpaid':
        setActiveTab('open-invoices');
        setAdvancedFilters(prev => ({
          ...prev,
          sortBy: 'date',
          sortOrder: 'asc'
        }));
        break;
      case 'newest_unpaid':
        setActiveTab('open-invoices');
        setAdvancedFilters(prev => ({
          ...prev,
          sortBy: 'date',
          sortOrder: 'desc'
        }));
        break;
      case 'most_overdue':
        setActiveTab('open-invoices');
        setAdvancedFilters(prev => ({
          ...prev,
          sortBy: 'days_overdue',
          sortOrder: 'desc'
        }));
        break;
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

  const isInvoiceOver90Days = (invoiceDate: string) => {
    const today = new Date();
    const invDate = new Date(invoiceDate);
    const diffTime = today.getTime() - invDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 90;
  };

  // Use calculated balance from customer data (not just displayed invoices)
  // Use calculated balance from customer data (not just displayed invoices)
  const currentBalance = customer?.calculated_balance || 0;

  // Filter out voided payments, voided payment reversals, and credit memos
  const validPayments = payments.filter(p =>
    p.status !== 'Voided' &&
    p.type !== 'Voided Payment' &&
    p.type !== 'Credit Memo'
  );

  const totalPaid = validPayments.reduce((sum, p) => sum + (parseFloat(p.payment_amount as any) || 0), 0);
  const paymentCount = validPayments.length;

  const totalInvoiced = displayedInvoices
    .filter(inv => inv.status !== 'Voided')
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const oldestOpenInvoice = displayedInvoices
    .filter(inv => inv.balance > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Customers
          </button>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
              <input
                type="checkbox"
                checked={excludeCreditMemos}
                onChange={(e) => setExcludeCreditMemos(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-gray-600">Exclude Credit Memos</span>
            </label>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Customer Header Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" data-tour="detail-header">
          <div className="p-6 pb-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-gray-900 truncate">{customer.customer_name}</h1>
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(customer.customer_status)}`}>
                    {customer.customer_status || 'Unknown'}
                  </span>
                  {customer.contact_status === 'touched' ? (
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                      Contacted
                    </span>
                  ) : (
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                      Not Contacted
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  ID: {customer.customer_id}
                  {customer.customer_class && <span className="ml-3">Class: {customer.customer_class}</span>}
                  {customer.terms && <span className="ml-3">Terms: {customer.terms}</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Contact Info Bar */}
          <div className="px-6 py-3 mt-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-6 text-sm">
            {customer.email_address && (
              <a href={`mailto:${customer.email_address}`} className="flex items-center gap-1.5 text-gray-700 hover:text-blue-600 transition-colors">
                <Send className="w-3.5 h-3.5" />
                <span>{customer.email_address}</span>
              </a>
            )}
            {customer.phone1 && (
              <span className="flex items-center gap-1.5 text-gray-700">
                <span className="text-gray-400">|</span>
                {customer.phone1}
              </span>
            )}
            {(customer.city || customer.state) && (
              <span className="flex items-center gap-1.5 text-gray-700">
                <span className="text-gray-400">|</span>
                {[customer.city, customer.state].filter(Boolean).join(', ')}
              </span>
            )}
            {customer.last_contact_date && (
              <span className="flex items-center gap-1.5 text-gray-500 ml-auto text-xs">
                <Clock className="w-3 h-3" />
                Last contact: {formatDateUtil(customer.last_contact_date)}
              </span>
            )}
          </div>
        </div>

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-red-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Balance Due</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(currentBalance)}</p>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Open ({customer?.open_invoice_count || 0})</span>
                <span className="font-medium">{formatCurrency((customer?.gross_balance || 0) - (customer?.balanced_invoice_balance || 0))}</span>
              </div>
              {(customer?.balanced_invoice_count || 0) > 0 && (
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Balanced ({customer.balanced_invoice_count})</span>
                  <span className="font-medium">{formatCurrency(customer.balanced_invoice_balance || 0)}</span>
                </div>
              )}
              {!excludeCreditMemos && (customer?.credit_memo_balance || 0) > 0 && (
                <div className="flex justify-between text-xs text-green-700 border-t border-gray-100 pt-1 mt-1">
                  <span>Credit Memos</span>
                  <span className="font-medium">-{formatCurrency(customer.credit_memo_balance || 0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Paid</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-gray-500 mt-1">{paymentCount} payment{paymentCount !== 1 ? 's' : ''} lifetime</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Invoiced</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalInvoiced)}</p>
            <p className="text-xs text-gray-500 mt-1">{invoiceCounts.total} total invoice{invoiceCounts.total !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Oldest Open</span>
            </div>
            {oldestOpenInvoice ? (
              <>
                <p className="text-lg font-bold text-gray-900">{formatDateUtil(oldestOpenInvoice.date)}</p>
                <p className="text-xs text-gray-500 mt-1">{oldestOpenInvoice.reference_number} - {formatCurrency(oldestOpenInvoice.balance)}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500 mt-1">All paid up</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Clock className="w-4 h-4 text-teal-600" />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Avg Collection</span>
            </div>
            {avgDaysToCollect !== null ? (
              <>
                <p className="text-2xl font-bold text-gray-900">{avgDaysToCollect}<span className="text-sm font-normal text-gray-500 ml-1">days</span></p>
                <p className="text-xs text-gray-500 mt-1">Invoice to payment</p>
              </>
            ) : (
              <p className="text-sm text-gray-500 mt-1">No history</p>
            )}
          </div>
        </div>

        {/* Color Status Quick Filters */}
        {(invoiceColorCounts.red > 0 || invoiceColorCounts.yellow > 0 || invoiceColorCounts.green > 0) && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 mr-1">Status:</span>
            {invoiceColorCounts.red > 0 && (
              <button
                onClick={() => handleColorClick('red')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  advancedFilters.colorStatus === 'red' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                Red ({invoiceColorCounts.red})
              </button>
            )}
            {invoiceColorCounts.yellow > 0 && (
              <button
                onClick={() => handleColorClick('yellow')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  advancedFilters.colorStatus === 'yellow' ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                Yellow ({invoiceColorCounts.yellow})
              </button>
            )}
            {invoiceColorCounts.green > 0 && (
              <button
                onClick={() => handleColorClick('green')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  advancedFilters.colorStatus === 'green' ? 'bg-green-600 text-white shadow-sm' : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current opacity-70"></span>
                Green ({invoiceColorCounts.green})
              </button>
            )}
            {advancedFilters.colorStatus && (
              <button
                onClick={clearColorFilter}
                className="text-xs text-gray-500 hover:text-gray-700 ml-1 underline"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Collection Tickets - Compact inline section */}
        {!loadingTickets && tickets.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-semibold text-gray-900">Collection Tickets</h2>
                {tickets.filter(t => t.status !== 'closed').length > 0 && (
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-200">
                    {tickets.filter(t => t.status !== 'closed').length} active
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {tickets.filter(t => t.status !== 'closed').map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleTicketClick(ticket.id)}
                  className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  <span className="text-sm font-semibold text-gray-900 w-28 shrink-0">{ticket.ticket_number}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    ticket.status === 'open' ? 'bg-blue-50 text-blue-700' :
                    ticket.status === 'promised' ? 'bg-amber-50 text-amber-700' :
                    ticket.status === 'pending' ? 'bg-gray-100 text-gray-700' :
                    'bg-green-50 text-green-700'
                  }`}>
                    {ticket.status}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                    ticket.priority === 'urgent' ? 'bg-red-50 text-red-700' :
                    ticket.priority === 'high' ? 'bg-orange-50 text-orange-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {ticket.priority}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {ticket.invoice_count} inv.
                  </span>
                  {ticket.assigned_collector_id && (
                    <span className="text-xs text-gray-600 truncate">
                      <User className="w-3 h-3 inline mr-1" />
                      {ticket.collector_name || 'Assigned'}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto shrink-0">{formatDateUtil(ticket.created_at)}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors shrink-0" />
                </div>
              ))}
              {tickets.filter(t => t.status === 'closed').length > 0 && (
                <details className="group">
                  <summary className="px-6 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 list-none flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                    {tickets.filter(t => t.status === 'closed').length} closed ticket{tickets.filter(t => t.status === 'closed').length !== 1 ? 's' : ''}
                  </summary>
                  {tickets.filter(t => t.status === 'closed').map((ticket) => (
                    <div
                      key={ticket.id}
                      onClick={() => handleTicketClick(ticket.id, true)}
                      className="px-6 py-2.5 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition-colors opacity-60 hover:opacity-100"
                    >
                      <span className="text-sm font-medium text-gray-500 w-28 shrink-0">{ticket.ticket_number}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">closed</span>
                      <span className="text-xs text-gray-400 shrink-0">{ticket.invoice_count} inv.</span>
                      <span className="text-xs text-gray-400 ml-auto">{formatDateUtil(ticket.created_at)}</span>
                    </div>
                  ))}
                </details>
              )}
            </div>
          </div>
        )}

        {/* Timeline Chart */}
        <CustomerTimelineChart
          customerId={customerId}
          customerName={customer.customer_name}
        />

        {/* Tabs Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200" data-tour="detail-tabs">
            <nav className="flex overflow-x-auto">
              <button
                onClick={() => {
                  setActiveTab('open-invoices');
                  if (advancedFilters.colorStatus || advancedFilters.invoiceStatus) {
                    setAdvancedFilters(prev => ({ ...prev, colorStatus: '', invoiceStatus: '' }));
                  }
                }}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'open-invoices'
                    ? 'border-red-500 text-red-600 bg-red-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Open ({invoiceCounts.open})
              </button>
              <button
                onClick={() => {
                  setActiveTab('balanced-invoices');
                  if (advancedFilters.invoiceStatus) {
                    setAdvancedFilters(prev => ({ ...prev, invoiceStatus: '' }));
                  }
                }}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'balanced-invoices'
                    ? 'border-amber-500 text-amber-600 bg-amber-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Balanced ({invoiceCounts.balanced})
              </button>
              <button
                onClick={() => {
                  setActiveTab('paid-invoices');
                  if (advancedFilters.invoiceStatus) {
                    setAdvancedFilters(prev => ({ ...prev, invoiceStatus: '' }));
                  }
                }}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'paid-invoices'
                    ? 'border-green-500 text-green-600 bg-green-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Paid ({invoiceCounts.paid})
              </button>
              <button
                onClick={() => {
                  setActiveTab('payments');
                  loadPaymentsData();
                }}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'payments'
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Payments ({paymentCount})
              </button>
              <button
                onClick={() => setActiveTab('email-tracking')}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'email-tracking'
                    ? 'border-teal-500 text-teal-600 bg-teal-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Email Tracking
              </button>
            </nav>
          </div>

        <div className="p-6" data-tour="detail-filters">
          <InvoiceFilterPanel
            filters={advancedFilters}
            onFiltersChange={handleAdvancedFiltersChange}
            stats={invoiceStats}
            filteredStats={filteredStats}
            activeTab={activeTab}
            onQuickFilter={handleQuickFilter}
          />

          {activeTab === 'open-invoices' && (
            <div className="max-h-[calc(100vh-450px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              {advancedFilters.colorStatus && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center">
                    <Tag className="w-5 h-5 text-blue-600 mr-2" />
                    <p className="text-sm text-blue-900 font-medium">
                      Showing only <span className="uppercase font-bold">{advancedFilters.colorStatus}</span> invoices
                    </p>
                  </div>
                  <button
                    onClick={clearColorFilter}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Clear Filter
                  </button>
                </div>
              )}
              {loadingInvoices ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading invoices...</p>
                </div>
              ) : displayedInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No open invoices</p>
                  <p className="text-sm text-gray-400 mt-2">This customer is all paid up!</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-red-700 font-medium">Total Amount Due</p>
                        <p className="text-2xl font-bold text-red-900">{formatCurrency(currentBalance)}</p>
                      </div>
                      <DollarSign className="w-12 h-12 text-red-500" />
                    </div>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Reference
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Due Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Color
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Days Overdue
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Original Amount
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Balance Due
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {displayedInvoices.map((invoice, index) => {
                        const isOver90Days = isInvoiceOver90Days(invoice.date);
                        return (
                        <tr
                          key={invoice.id}
                          id={`invoice-${invoice.id}`}
                          ref={index === displayedInvoices.length - 1 ? lastInvoiceRef : undefined}
                          className={`transition-all ${
                            isOver90Days
                              ? 'bg-red-50 hover:bg-red-100'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {invoice.reference_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDateUtil(invoice.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDateUtil(invoice.due_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                              {invoice.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap relative" data-tour="detail-color-status">
                            <div className="relative inline-block color-picker-container">
                              <button
                                onClick={() => setChangingColorForInvoice(changingColorForInvoice === invoice.id ? null : invoice.id)}
                                className="focus:outline-none"
                              >
                                {invoice.color_status ? (
                                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full uppercase cursor-pointer hover:opacity-80 transition-opacity ${
                                    invoice.color_status === 'red' ? 'bg-red-500 text-white border-2 border-red-700' :
                                    invoice.color_status === 'yellow' ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600' :
                                    invoice.color_status === 'orange' ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600' :
                                    invoice.color_status === 'green' ? 'bg-green-500 text-white border-2 border-green-700' :
                                    'bg-gray-200 text-gray-700'
                                  }`}>
                                    {invoice.color_status}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Set Color</span>
                                )}
                              </button>

                              {changingColorForInvoice === invoice.id && (
                                <div className="absolute z-50 mt-2 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[120px]">
                                  <button
                                    onClick={() => handleColorChange(invoice.id, 'red')}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded flex items-center gap-2"
                                  >
                                    <span className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700"></span>
                                    RED
                                  </button>
                                  <button
                                    onClick={() => handleColorChange(invoice.id, 'yellow')}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-yellow-50 rounded flex items-center gap-2"
                                  >
                                    <span className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-yellow-600"></span>
                                    YELLOW
                                  </button>
                                  <button
                                    onClick={() => handleColorChange(invoice.id, 'green')}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 rounded flex items-center gap-2"
                                  >
                                    <span className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700"></span>
                                    GREEN
                                  </button>
                                  {invoice.color_status && (
                                    <>
                                      <div className="border-t border-gray-200 my-1"></div>
                                      <button
                                        onClick={() => handleColorChange(invoice.id, null)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded text-gray-600"
                                      >
                                        Clear Color
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {invoice.days_overdue > 0 ? (
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                invoice.days_overdue > 90 ? 'bg-red-100 text-red-800' :
                                invoice.days_overdue > 60 ? 'bg-orange-100 text-orange-800' :
                                invoice.days_overdue > 30 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {invoice.days_overdue} days
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                            {formatCurrency(invoice.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-red-600">
                            {formatCurrency(invoice.balance)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  navigate(`/collection-ticketing?customerId=${customerId}&invoiceRef=${invoice.reference_number}`);
                                }}
                                className="inline-flex items-center px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                title="Create new ticket for this invoice"
                              >
                                <Ticket className="w-4 h-4 mr-1" />
                                Create New Ticket
                              </button>
                              <a
                                href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                title="Open in Acumatica"
                              >
                                <ExternalLink className="w-4 h-4 mr-1" />
                                View
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                  {loadingMore && (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                      <p className="text-gray-500 text-sm">Loading more invoices...</p>
                    </div>
                  )}
                  {!hasMore && displayedInvoices.length > 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-500 text-sm">All invoices loaded ({displayedInvoices.length} total)</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'balanced-invoices' && (
            <div className="max-h-[calc(100vh-450px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center">
                  <PauseCircle className="w-5 h-5 text-amber-600 mr-2" />
                  <p className="text-sm text-amber-800">
                    These invoices are drafts (Balanced, On Hold, or Scheduled) and have not been released in Acumatica. They are <strong>not</strong> included in the customer's balance.
                  </p>
                </div>
              </div>
              {loadingInvoices ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading invoices...</p>
                </div>
              ) : displayedInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <PauseCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No draft invoices</p>
                  <p className="text-sm text-gray-400 mt-2">All invoices have been released</p>
                </div>
              ) : (
                <>
                  {filteredStats && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                      <p className="text-sm text-amber-900 font-medium">
                        Total Draft Amount: {formatCurrency(filteredStats.total_balance)}
                      </p>
                    </div>
                  )}
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Reference</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Due Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Amount</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Description</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {displayedInvoices.map((invoice, index) => (
                        <tr
                          key={invoice.id}
                          ref={index === displayedInvoices.length - 1 ? lastInvoiceRef : undefined}
                          className="bg-amber-50/30 hover:bg-amber-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.reference_number}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDateUtil(invoice.date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDateUtil(invoice.due_date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                              {invoice.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(invoice.amount)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{formatCurrency(invoice.balance)}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{invoice.description || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <a
                              href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                              title="Open in Acumatica"
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {loadingMore && (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-2"></div>
                      <p className="text-gray-500 text-sm">Loading more invoices...</p>
                    </div>
                  )}
                  {!hasMore && displayedInvoices.length > 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-500 text-sm">All draft invoices loaded ({displayedInvoices.length} total)</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'paid-invoices' && (
            <div className="max-h-[calc(100vh-450px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              {loadingInvoices ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading invoices...</p>
                </div>
              ) : displayedInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No paid invoices</p>
                  <p className="text-sm text-gray-400 mt-2">No invoices have been paid yet</p>
                </div>
              ) : (
                <>
                  <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Reference
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                        Description
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedInvoices.map((invoice, index) => {
                      const isOver90Days = isInvoiceOver90Days(invoice.date);
                      return (
                      <tr
                        key={invoice.id}
                        ref={index === displayedInvoices.length - 1 ? lastInvoiceRef : undefined}
                        className={isOver90Days ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.reference_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateUtil(invoice.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDateUtil(invoice.due_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                          {formatCurrency(invoice.amount)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {invoice.description || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <a
                            href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            title="Open in Acumatica"
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            View
                          </a>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
                {loadingMore && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                    <p className="text-gray-500 text-sm">Loading more invoices...</p>
                  </div>
                )}
                {!hasMore && displayedInvoices.length > 0 && (
                  <div className="text-center py-8">
                    <p className="text-gray-500 text-sm">All invoices loaded ({displayedInvoices.length} total)</p>
                  </div>
                )}
                </>
              )}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="max-h-[calc(100vh-450px)] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b #e2e8f0' }}>
              {loadingPayments ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading payments...</p>
                </div>
              ) : validPayments.length === 0 ? (
                <div className="text-center py-12">
                  <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No payments found</p>
                  <p className="text-sm text-gray-400 mt-2">No payments have been recorded</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-700 font-medium">Total Lifetime Payments</p>
                        <p className="text-2xl font-bold text-green-900">{formatCurrency(totalPaid)}</p>
                        <p className="text-xs text-green-700 mt-1">{paymentCount} valid payment{paymentCount !== 1 ? 's' : ''} (excluding voided)</p>
                      </div>
                      <TrendingUp className="w-12 h-12 text-green-500" />
                    </div>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Reference
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Method
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
                          Description
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {validPayments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {payment.reference_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDateUtil(payment.doc_date || payment.application_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {payment.payment_method || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(payment.status)}`}>
                              {payment.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                            {formatCurrency(payment.payment_amount)}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {payment.description || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <a
                              href={getAcumaticaPaymentUrl(payment.reference_number)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                              title="Open in Acumatica"
                            >
                              <ExternalLink className="w-4 h-4 mr-1" />
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {activeTab === 'email-tracking' && customer && (
            <CustomerMonthlySheet
              customerId={customer.customer_id}
              customerName={customer.customer_name}
              customerEmail={customer.email_address || ''}
            />
          )}
        </div>
      </div>

        {/* Customer Notes Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-gray-600" />
              <h2 className="text-base font-semibold text-gray-900">Notes</h2>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                {customerNotes.length}
              </span>
            </div>
          </div>

          <div className="p-6" data-tour="detail-notes">
            <div className="flex gap-4 mb-6">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="w-40 shrink-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="general">General</option>
                <option value="outreach">Outreach</option>
                <option value="payment_discussion">Payment Discussion</option>
                <option value="promise_to_pay">Promise to Pay</option>
                <option value="dispute">Dispute</option>
                <option value="other">Other</option>
              </select>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newNote.trim()) handleSaveNote(); }}
                  placeholder="Add a note about this customer..."
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={!newNote.trim() || savingNote}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {savingNote ? 'Saving...' : 'Add'}
                </button>
              </div>
            </div>

            {customerNotes.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">No notes yet</p>
            ) : (
              <div className="space-y-3">
                {customerNotes.map((note) => (
                  <div key={note.id} className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-900">
                          {note.created_by_user_name || note.created_by_user_email}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          note.note_type === 'outreach' ? 'bg-blue-50 text-blue-700' :
                          note.note_type === 'payment_discussion' ? 'bg-green-50 text-green-700' :
                          note.note_type === 'promise_to_pay' ? 'bg-amber-50 text-amber-700' :
                          note.note_type === 'dispute' ? 'bg-red-50 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {note.note_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{formatDateUtil(note.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.note_text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
