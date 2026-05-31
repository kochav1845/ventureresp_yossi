import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ArrowLeft, DollarSign, FileText, CreditCard, Calendar, TrendingUp, AlertCircle, TrendingDown, MessageSquare, Send, Tag, Clock, User, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Ticket, ChevronRight, ChevronDown, PauseCircle, Mail, MapPin, Phone, Building2, Hash } from 'lucide-react';
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
  days_overdue?: number;
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
  doc_date?: string;
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
  const [showTimeline, setShowTimeline] = useState(false);

  const restoredFromCache = useRef(!!cd);
  const mountTime = useRef(Date.now());

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
    if (restoredFromCache.current && Date.now() - mountTime.current < 500) {
      return;
    }
    loadCustomerBasicInfo();
    loadInvoiceStats();
    loadChartData();
    loadTickets();
  }, [customerId]);

  useEffect(() => {
    if (restoredFromCache.current && Date.now() - mountTime.current < 500) return;
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
    if (restoredFromCache.current && Date.now() - mountTime.current < 500) {
      restoredFromCache.current = false;
      return;
    }
    restoredFromCache.current = false;
    setPage(0);
    setDisplayedInvoices([]);
    setHasMore(true);
    loadInvoices(0, false);
    loadFilteredStats();
  }, [activeTab, JSON.stringify(advancedFilters), excludeCreditMemos]);

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

      const { data: avgDays, error: avgDaysError } = await supabase
        .rpc('get_customer_avg_days_to_collect', { customer_id_param: customerId });

      if (!avgDaysError && avgDays !== null) {
        setAvgDaysToCollect(avgDays);
      }

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

  const loadChartData = async () => {
    setLoadingChart(true);
    try {
      setTimeout(() => setLoadingChart(false), 100);
    } catch (error) {
      console.error('Error loading chart data:', error);
      setLoadingChart(false);
    }
  };

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

  const loadPaymentsData = async () => {
    if (payments.length > 0) return;
    if (!customer) return;

    setLoadingPayments(true);
    try {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500">Loading customer...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <button onClick={handleBack} className="mb-6 flex items-center text-gray-600 hover:text-gray-900 text-sm">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center max-w-md mx-auto">
          <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">Customer not found</p>
        </div>
      </div>
    );
  }

  const handleColorClick = (color: string) => {
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
        setAdvancedFilters(prev => ({ ...prev, sortBy: 'amount', sortOrder: 'desc' }));
        break;
      case 'lowest':
        setAdvancedFilters(prev => ({ ...prev, sortBy: 'amount', sortOrder: 'asc' }));
        break;
      case 'oldest_unpaid':
        setActiveTab('open-invoices');
        setAdvancedFilters(prev => ({ ...prev, sortBy: 'date', sortOrder: 'asc' }));
        break;
      case 'newest_unpaid':
        setActiveTab('open-invoices');
        setAdvancedFilters(prev => ({ ...prev, sortBy: 'date', sortOrder: 'desc' }));
        break;
      case 'most_overdue':
        setActiveTab('open-invoices');
        setAdvancedFilters(prev => ({ ...prev, sortBy: 'days_overdue', sortOrder: 'desc' }));
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

  const isInvoiceOver90Days = (invoiceDate: string) => {
    const today = new Date();
    const invDate = new Date(invoiceDate);
    const diffTime = today.getTime() - invDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 90;
  };

  const currentBalance = customer?.calculated_balance || 0;

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

  const activeTickets = tickets.filter(t => t.status !== 'closed');
  const closedTickets = tickets.filter(t => t.status === 'closed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Slim Header Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back</span>
            </button>
            <div className="h-5 w-px bg-gray-200" />
            <h1 className="text-base font-semibold text-gray-900 truncate max-w-[400px]">
              {customer.customer_name}
            </h1>
            <span className="text-xs text-gray-400 font-mono">{customer.customer_id}</span>
          </div>
          <div className="flex items-center gap-3">
            {customer.contact_status === 'touched' ? (
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Contacted
              </span>
            ) : (
              <span className="px-2 py-1 rounded-md text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                Not Contacted
              </span>
            )}
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
              <input
                type="checkbox"
                checked={excludeCreditMemos}
                onChange={(e) => setExcludeCreditMemos(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span>Excl. CMs</span>
            </label>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 py-5 space-y-5">
        {/* Two-Column Top Section: Left = Key Metrics, Right = Customer Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Financial Metrics - takes 2 cols */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {/* Balance Due */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Balance Due</p>
                <p className={`text-xl font-bold ${currentBalance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatCurrency(currentBalance)}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[11px] text-gray-500">
                    {customer?.open_invoice_count || 0} open &middot; {formatCurrency((customer?.gross_balance || 0) - (customer?.balanced_invoice_balance || 0))}
                  </p>
                  {!excludeCreditMemos && (customer?.credit_memo_balance || 0) > 0 && (
                    <p className="text-[11px] text-emerald-600">
                      CMs: -{formatCurrency(customer.credit_memo_balance || 0)}
                    </p>
                  )}
                </div>
              </div>

              {/* Avg Collection */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Avg Collection</p>
                {avgDaysToCollect !== null ? (
                  <>
                    <p className="text-xl font-bold text-gray-900">{avgDaysToCollect}<span className="text-sm font-normal text-gray-400 ml-0.5">d</span></p>
                    <p className="text-[11px] text-gray-500 mt-1.5">Invoice to payment</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">No data</p>
                )}
              </div>

              {/* Oldest Open */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Oldest Open</p>
                {oldestOpenInvoice ? (
                  <>
                    <p className="text-base font-bold text-gray-900">{formatDateUtil(oldestOpenInvoice.date)}</p>
                    <p className="text-[11px] text-gray-500 mt-1.5">{oldestOpenInvoice.reference_number}</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">All paid</p>
                )}
              </div>

              {/* Invoices */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Invoices</p>
                <p className="text-xl font-bold text-gray-900">{invoiceCounts.total}</p>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {invoiceCounts.open} open &middot; {invoiceCounts.paid} paid
                </p>
              </div>
            </div>

            {/* Color Status Chips */}
            {(invoiceColorCounts.red > 0 || invoiceColorCounts.yellow > 0 || invoiceColorCounts.green > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                {invoiceColorCounts.red > 0 && (
                  <button
                    onClick={() => handleColorClick('red')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      advancedFilters.colorStatus === 'red' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    {invoiceColorCounts.red}
                  </button>
                )}
                {invoiceColorCounts.yellow > 0 && (
                  <button
                    onClick={() => handleColorClick('yellow')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      advancedFilters.colorStatus === 'yellow' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    {invoiceColorCounts.yellow}
                  </button>
                )}
                {invoiceColorCounts.green > 0 && (
                  <button
                    onClick={() => handleColorClick('green')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      advancedFilters.colorStatus === 'green' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {invoiceColorCounts.green}
                  </button>
                )}
                {advancedFilters.colorStatus && (
                  <button onClick={clearColorFilter} className="text-[11px] text-gray-400 hover:text-gray-600 ml-1">
                    clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Customer Info Panel */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="space-y-3">
              {customer.email_address && (
                <a href={`mailto:${customer.email_address}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600 transition-colors group">
                  <Mail className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 shrink-0" />
                  <span className="truncate">{customer.email_address}</span>
                </a>
              )}
              {customer.phone1 && (
                <div className="flex items-center gap-2.5 text-sm text-gray-700">
                  <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>{customer.phone1}</span>
                </div>
              )}
              {(customer.city || customer.state) && (
                <div className="flex items-center gap-2.5 text-sm text-gray-700">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span>{[customer.address_line1, customer.city, customer.state, customer.postal_code].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                {customer.customer_class && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Class</span>
                    <span className="font-medium text-gray-800">{customer.customer_class}</span>
                  </div>
                )}
                {customer.terms && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Terms</span>
                    <span className="font-medium text-gray-800">{customer.terms}</span>
                  </div>
                )}
                {customer.credit_limit && customer.credit_limit > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Credit Limit</span>
                    <span className="font-medium text-gray-800">{formatCurrency(customer.credit_limit)}</span>
                  </div>
                )}
                {customer.last_contact_date && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Last Contact</span>
                    <span className="font-medium text-gray-800">{formatDateUtil(customer.last_contact_date)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Active Tickets Mini-List */}
            {activeTickets.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                  <Ticket className="w-3 h-3" />
                  {activeTickets.length} Active Ticket{activeTickets.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1.5">
                  {activeTickets.slice(0, 3).map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => handleTicketClick(ticket.id)}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <span className="text-xs font-medium text-gray-800">{ticket.ticket_number}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        ticket.priority === 'urgent' ? 'bg-red-50 text-red-700' :
                        ticket.priority === 'high' ? 'bg-orange-50 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {ticket.priority}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">{ticket.invoice_count} inv</span>
                      <ChevronRight className="w-3 h-3 text-gray-300" />
                    </div>
                  ))}
                  {activeTickets.length > 3 && (
                    <p className="text-[11px] text-gray-400 pl-2">+{activeTickets.length - 3} more</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timeline Chart - Collapsible */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">Financial Timeline</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showTimeline ? 'rotate-180' : ''}`} />
          </button>
          {showTimeline && (
            <div className="border-t border-gray-100">
              <CustomerTimelineChart
                customerId={customerId}
                customerName={customer.customer_name}
              />
            </div>
          )}
        </div>

        {/* Main Content Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200" data-tour="detail-tabs">
            <nav className="flex overflow-x-auto px-1">
              {[
                { key: 'open-invoices', label: 'Open', count: invoiceCounts.open, color: 'red' },
                { key: 'balanced-invoices', label: 'Balanced', count: invoiceCounts.balanced, color: 'amber' },
                { key: 'paid-invoices', label: 'Paid', count: invoiceCounts.paid, color: 'green' },
                { key: 'payments', label: 'Payments', count: paymentCount, color: 'blue' },
                { key: 'email-tracking', label: 'Emails', count: null, color: 'teal' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key as any);
                    if (tab.key === 'payments') loadPaymentsData();
                    if (tab.key !== activeTab && advancedFilters.colorStatus) {
                      setAdvancedFilters(prev => ({ ...prev, colorStatus: '', invoiceStatus: '' }));
                    }
                  }}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key
                      ? `border-${tab.color}-500 text-${tab.color}-600`
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  style={activeTab === tab.key ? {
                    borderBottomColor: tab.color === 'red' ? '#ef4444' : tab.color === 'amber' ? '#f59e0b' : tab.color === 'green' ? '#22c55e' : tab.color === 'blue' ? '#3b82f6' : '#14b8a6',
                    color: tab.color === 'red' ? '#dc2626' : tab.color === 'amber' ? '#d97706' : tab.color === 'green' ? '#16a34a' : tab.color === 'blue' ? '#2563eb' : '#0d9488'
                  } : {}}
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className="ml-1.5 text-xs text-gray-400 font-normal">({tab.count})</span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-5" data-tour="detail-filters">
            <InvoiceFilterPanel
              filters={advancedFilters}
              onFiltersChange={handleAdvancedFiltersChange}
              stats={invoiceStats}
              filteredStats={filteredStats}
              activeTab={activeTab}
              onQuickFilter={handleQuickFilter}
            />

            {activeTab === 'open-invoices' && (
              <div className="max-h-[600px] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {advancedFilters.colorStatus && (
                  <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
                    <p className="text-xs text-gray-700">
                      Filtering: <span className="font-semibold uppercase">{advancedFilters.colorStatus}</span> invoices
                    </p>
                    <button onClick={clearColorFilter} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                      Clear
                    </button>
                  </div>
                )}
                {loadingInvoices ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200 border-t-blue-600 mx-auto"></div>
                  </div>
                ) : displayedInvoices.length === 0 ? (
                  <div className="text-center py-16">
                    <TrendingUp className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-medium">No open invoices</p>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ref</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                          <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Overdue</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {displayedInvoices.map((invoice, index) => {
                          const isOver90Days = isInvoiceOver90Days(invoice.date);
                          return (
                            <tr
                              key={invoice.id}
                              ref={index === displayedInvoices.length - 1 ? lastInvoiceRef : undefined}
                              className={`group transition-colors ${isOver90Days ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-gray-50'}`}
                            >
                              <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{invoice.reference_number}</td>
                              <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateUtil(invoice.date)}</td>
                              <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateUtil(invoice.due_date)}</td>
                              <td className="px-4 py-2.5 relative" data-tour="detail-color-status">
                                <div className="relative inline-block color-picker-container">
                                  <button
                                    onClick={() => setChangingColorForInvoice(changingColorForInvoice === invoice.id ? null : invoice.id)}
                                    className="focus:outline-none"
                                  >
                                    {invoice.color_status ? (
                                      <span className={`w-5 h-5 rounded-full inline-block border-2 ${
                                        invoice.color_status === 'red' ? 'bg-red-500 border-red-600' :
                                        invoice.color_status === 'yellow' ? 'bg-amber-400 border-amber-500' :
                                        invoice.color_status === 'green' ? 'bg-emerald-500 border-emerald-600' :
                                        'bg-gray-200 border-gray-300'
                                      }`}></span>
                                    ) : (
                                      <span className="w-5 h-5 rounded-full inline-block border-2 border-dashed border-gray-300 hover:border-gray-400"></span>
                                    )}
                                  </button>

                                  {changingColorForInvoice === invoice.id && (
                                    <div className="absolute z-50 mt-1 left-0 bg-white rounded-lg shadow-lg border border-gray-200 p-1.5 flex gap-1">
                                      <button onClick={() => handleColorChange(invoice.id, 'red')} className="w-6 h-6 rounded-full bg-red-500 hover:scale-110 transition-transform border-2 border-red-600" />
                                      <button onClick={() => handleColorChange(invoice.id, 'yellow')} className="w-6 h-6 rounded-full bg-amber-400 hover:scale-110 transition-transform border-2 border-amber-500" />
                                      <button onClick={() => handleColorChange(invoice.id, 'green')} className="w-6 h-6 rounded-full bg-emerald-500 hover:scale-110 transition-transform border-2 border-emerald-600" />
                                      {invoice.color_status && (
                                        <button onClick={() => handleColorChange(invoice.id, null)} className="w-6 h-6 rounded-full bg-gray-100 hover:scale-110 transition-transform border-2 border-gray-300 flex items-center justify-center text-gray-400 text-xs">x</button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {invoice.days_overdue > 0 ? (
                                  <span className={`text-xs font-semibold ${
                                    invoice.days_overdue > 90 ? 'text-red-600' :
                                    invoice.days_overdue > 60 ? 'text-orange-600' :
                                    invoice.days_overdue > 30 ? 'text-amber-600' :
                                    'text-gray-600'
                                  }`}>
                                    {invoice.days_overdue}d
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-right text-gray-700">{formatCurrency(invoice.amount)}</td>
                              <td className="px-4 py-2.5 text-sm text-right font-semibold text-red-600">{formatCurrency(invoice.balance)}</td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => navigate(`/collection-ticketing?customerId=${customerId}&invoiceRef=${invoice.reference_number}`)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Create ticket"
                                  >
                                    <Ticket className="w-3.5 h-3.5" />
                                  </button>
                                  <a
                                    href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                    title="Open in Acumatica"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {loadingMore && (
                      <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-blue-600 mx-auto"></div>
                      </div>
                    )}
                    {!hasMore && displayedInvoices.length > 0 && (
                      <p className="text-center py-4 text-xs text-gray-400">{displayedInvoices.length} invoices</p>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'balanced-invoices' && (
              <div className="max-h-[600px] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
                  <PauseCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-800">Draft invoices not included in the balance.</p>
                </div>
                {loadingInvoices ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200 border-t-amber-500 mx-auto"></div>
                  </div>
                ) : displayedInvoices.length === 0 ? (
                  <div className="text-center py-16">
                    <PauseCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No draft invoices</p>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ref</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Balance</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {displayedInvoices.map((invoice, index) => (
                          <tr
                            key={invoice.id}
                            ref={index === displayedInvoices.length - 1 ? lastInvoiceRef : undefined}
                            className="group hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{invoice.reference_number}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateUtil(invoice.date)}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{invoice.status}</span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right text-gray-700">{formatCurrency(invoice.amount)}</td>
                            <td className="px-4 py-2.5 text-sm text-right text-gray-700">{formatCurrency(invoice.balance)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[200px] truncate">{invoice.description || '-'}</td>
                            <td className="px-4 py-2.5 text-right">
                              <a
                                href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100 inline-flex"
                                title="Open in Acumatica"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {loadingMore && (
                      <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-amber-500 mx-auto"></div>
                      </div>
                    )}
                    {!hasMore && displayedInvoices.length > 0 && (
                      <p className="text-center py-4 text-xs text-gray-400">{displayedInvoices.length} invoices</p>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'paid-invoices' && (
              <div className="max-h-[600px] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {loadingInvoices ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200 border-t-green-500 mx-auto"></div>
                  </div>
                ) : displayedInvoices.length === 0 ? (
                  <div className="text-center py-16">
                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No paid invoices</p>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ref</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {displayedInvoices.map((invoice, index) => (
                          <tr
                            key={invoice.id}
                            ref={index === displayedInvoices.length - 1 ? lastInvoiceRef : undefined}
                            className="group hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{invoice.reference_number}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateUtil(invoice.date)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateUtil(invoice.due_date)}</td>
                            <td className="px-4 py-2.5 text-sm text-right text-gray-700">{formatCurrency(invoice.amount)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[200px] truncate">{invoice.description || '-'}</td>
                            <td className="px-4 py-2.5 text-right">
                              <a
                                href={getAcumaticaInvoiceUrl(invoice.reference_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100 inline-flex"
                                title="Open in Acumatica"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {loadingMore && (
                      <div className="text-center py-6">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-green-500 mx-auto"></div>
                      </div>
                    )}
                    {!hasMore && displayedInvoices.length > 0 && (
                      <p className="text-center py-4 text-xs text-gray-400">{displayedInvoices.length} invoices</p>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="max-h-[600px] overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {loadingPayments ? (
                  <div className="text-center py-16">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200 border-t-blue-600 mx-auto"></div>
                  </div>
                ) : validPayments.length === 0 ? (
                  <div className="text-center py-16">
                    <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No payments found</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                      <p className="text-xs text-emerald-800">
                        <span className="font-semibold">{formatCurrency(totalPaid)}</span> total from {paymentCount} payments
                      </p>
                    </div>
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Ref</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {validPayments.map((payment) => (
                          <tr key={payment.id} className="group hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{payment.reference_number}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{formatDateUtil(payment.doc_date || payment.application_date)}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{payment.payment_method || '-'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusColor(payment.status)}`}>{payment.status}</span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-emerald-600">{formatCurrency(payment.payment_amount)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <a
                                href={getAcumaticaPaymentUrl(payment.reference_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100 inline-flex"
                                title="Open in Acumatica"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
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

        {/* Notes Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">Notes</h3>
            {customerNotes.length > 0 && (
              <span className="text-xs text-gray-400">({customerNotes.length})</span>
            )}
          </div>

          <div className="p-5" data-tour="detail-notes">
            <div className="flex gap-3 mb-5">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="w-36 shrink-0 px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
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
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={!newNote.trim() || savingNote}
                  className="px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {savingNote ? '...' : 'Add'}
                </button>
              </div>
            </div>

            {customerNotes.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-8">No notes yet</p>
            ) : (
              <div className="space-y-2">
                {customerNotes.map((note) => (
                  <div key={note.id} className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-gray-900">
                          {note.created_by_user_name || note.created_by_user_email}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          note.note_type === 'outreach' ? 'bg-blue-50 text-blue-700' :
                          note.note_type === 'payment_discussion' ? 'bg-emerald-50 text-emerald-700' :
                          note.note_type === 'promise_to_pay' ? 'bg-amber-50 text-amber-700' :
                          note.note_type === 'dispute' ? 'bg-red-50 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {note.note_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-gray-400 ml-auto">{formatDateUtil(note.created_at)}</span>
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
