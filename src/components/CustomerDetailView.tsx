import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, FileText, CreditCard, Calendar, TrendingUp, AlertCircle, TrendingDown, MessageSquare, Send, Tag, Clock, User, Lock, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, UserPlus, Ticket, ChevronRight } from 'lucide-react';
import { supabase, logActivity } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useUserPermissions, PERMISSION_KEYS } from '../lib/permissions';
import { formatDate as formatDateUtil } from '../lib/dateUtils';
import { getAcumaticaInvoiceUrl, getAcumaticaPaymentUrl } from '../lib/acumaticaLinks';
import InvoiceFilterPanel from './InvoiceFilterPanel';
import CustomerTimelineChart from './CustomerTimelineChart';
import AssignInvoiceModal from './AssignInvoiceModal';
import ReassignCollectorModal from './ReassignCollectorModal';

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
  acumatica_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  status: string | null;
  current_balance: number | null;
  overdue_balance: number | null;
  credit_limit: number | null;
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
  unapplied_balance: number | null;
  status: string;
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
  const { hasPermission } = useUserPermissions();
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));
  const hasAccess = hasPermission(PERMISSION_KEYS.CUSTOMERS_VIEW, 'view');
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [displayedInvoices, setDisplayedInvoices] = useState<InvoiceData[]>([]);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [customerNotes, setCustomerNotes] = useState<CustomerNote[]>([]);
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'open-invoices' | 'paid-invoices' | 'payments'>('open-invoices');
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [savingNote, setSavingNote] = useState(false);
  const [invoiceCounts, setInvoiceCounts] = useState({ total: 0, open: 0, paid: 0 });
  const [invoiceColorCounts, setInvoiceColorCounts] = useState({ red: 0, yellow: 0, green: 0, total: 0 });
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showAssignInvoiceModal, setShowAssignInvoiceModal] = useState(false);
  const [invoiceToAssign, setInvoiceToAssign] = useState<{ refNum: string; customerName: string; amount: number } | null>(null);
  const [showReassignCollectorModal, setShowReassignCollectorModal] = useState(false);
  const [invoiceToReassign, setInvoiceToReassign] = useState<{ id: string; refNum: string; currentCollectorId?: string } | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const ITEMS_PER_PAGE = 50;

  const [advancedFilters, setAdvancedFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: '',
    colorStatus: '',
    invoiceStatus: '',
    sortBy: 'date',
    sortOrder: 'desc' as 'asc' | 'desc'
  });
  const [invoiceStats, setInvoiceStats] = useState<any>(null);
  const [filteredStats, setFilteredStats] = useState<any>(null);
  const [changingColorForInvoice, setChangingColorForInvoice] = useState<string | null>(null);
  const [avgDaysToCollect, setAvgDaysToCollect] = useState<number | null>(null);

  useEffect(() => {
    // Load customer info first (fastest)
    loadCustomerBasicInfo();

    // Then load other sections independently
    loadInvoiceStats();
    loadChartData();
    loadTickets();
  }, [customerId]);

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
    setPage(0);
    setDisplayedInvoices([]);
    setHasMore(true);
    loadInvoices(0, false);
    loadFilteredStats();
  }, [activeTab, JSON.stringify(advancedFilters)]);

  // Load customer basic info first (fastest - shows immediately)
  const loadCustomerBasicInfo = async () => {
    setLoadingCustomer(true);
    try {
      // Load customer with calculated balance
      const { data: customerWithBalance, error: balanceError } = await supabase
        .rpc('get_customers_with_balance', {
          p_search: customerId,
          p_status_filter: 'all',
          p_country_filter: 'all',
          p_sort_by: 'customer_name',
          p_sort_order: 'asc',
          p_limit: 1,
          p_offset: 0,
          p_date_from: null,
          p_date_to: null
        });

      if (balanceError) throw balanceError;

      const customerData = customerWithBalance && customerWithBalance.length > 0 ? customerWithBalance[0] : null;
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
          paid: counts[0].paid_count || 0
        });
      }

      // Load color status counts
      const { data: colorCounts, error: colorCountsError } = await supabase
        .from('acumatica_invoices')
        .select('color_status')
        .eq('customer', customerId)
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
          ticket_invoices (
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
        invoice_count: ticket.ticket_invoices?.length || 0
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
    setLoadingPayments(true);
    try {
      let allPaymentsData: any[] = [];
      let hasMorePayments = true;
      let offset = 0;
      const CHUNK_SIZE = 1000;

      while (hasMorePayments) {
        const { data: chunk, error: paymentsError } = await supabase
          .from('acumatica_payments')
          .select('id, reference_number, application_date, payment_method, status, payment_amount, available_balance, description')
          .eq('customer_id', customerId)
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
      const filterType = activeTab === 'open-invoices' ? 'open' : activeTab === 'paid-invoices' ? 'paid' : 'all';

      const { data, error } = await supabase
        .rpc('get_customer_invoices_advanced_count', {
          p_customer_id: customerId,
          p_filter: filterType,
          p_date_from: advancedFilters.dateFrom || null,
          p_date_to: advancedFilters.dateTo || null,
          p_amount_min: advancedFilters.amountMin ? parseFloat(advancedFilters.amountMin) : null,
          p_amount_max: advancedFilters.amountMax ? parseFloat(advancedFilters.amountMax) : null,
          p_color_status: advancedFilters.colorStatus || null,
          p_invoice_status: advancedFilters.invoiceStatus || null
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
      const filterType = activeTab === 'open-invoices' ? 'open' : activeTab === 'paid-invoices' ? 'paid' : 'all';

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
          p_offset: offset
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

  const handleTicketClick = (ticketId: string) => {
    navigate(`/collection-ticketing?ticketId=${ticketId}`);
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
  const currentBalance = customer?.calculated_balance || 0;
  const totalPaid = payments
    .filter(p => p.status !== 'Voided')
    .reduce((sum, p) => sum + (p.payment_amount || 0), 0);
  const totalInvoiced = displayedInvoices
    .filter(inv => inv.status !== 'Voided')
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const oldestOpenInvoice = displayedInvoices
    .filter(inv => inv.balance > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

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
              You do not have permission to view Customer Details.
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <button
        onClick={handleBack}
        className="mb-6 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Customers
      </button>

      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{customer.customer_name}</h1>
            <p className="text-gray-600">Customer ID: {customer.customer_id}</p>
            <p className="text-gray-600">Class: {customer.customer_class || 'N/A'}</p>
          </div>
          <div className="flex flex-col gap-2 text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(customer.customer_status)}`}>
              {customer.customer_status || 'Unknown'}
            </span>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              customer.customer_type === 'test' ? 'bg-purple-100 text-purple-800' :
              customer.customer_type === 'internal' ? 'bg-gray-100 text-gray-800' :
              'bg-blue-100 text-blue-800'
            }`}>
              {customer.customer_type || 'live'}
            </span>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
              customer.contact_status === 'touched' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
            }`}>
              {customer.contact_status === 'touched' ? '✓ Contacted' : 'Not Contacted'}
            </span>
          </div>
        </div>


        {/* Additional Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 font-medium">Last Contact Date</p>
            <p className="text-sm text-gray-900 font-medium">
              {customer.last_contact_date ? formatDateUtil(customer.last_contact_date) : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Last Order Date</p>
            <p className="text-sm text-gray-900 font-medium">
              {customer.last_order_date ? formatDateUtil(customer.last_order_date) : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Auto-Red Threshold</p>
            <p className="text-sm text-gray-900 font-medium">
              {(customer as any).days_from_invoice_threshold || 30} days from invoice
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Customer Notes</p>
            <p className="text-sm text-gray-900 font-medium">
              {customerNotes.length} note{customerNotes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-sm text-red-600 font-medium mb-1">Current Balance Owed</p>
            <p className="text-2xl font-bold text-red-900">{formatCurrency(currentBalance)}</p>
            <p className="text-xs text-red-700 mt-1">{invoiceCounts.open} open invoice{invoiceCounts.open !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-sm text-green-600 font-medium mb-1">Total Paid (Lifetime)</p>
            <p className="text-2xl font-bold text-green-900">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-green-700 mt-1">{payments.length} payment{payments.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <p className="text-sm text-blue-600 font-medium mb-1">Total Invoiced</p>
            <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalInvoiced)}</p>
            <p className="text-xs text-blue-700 mt-1">{invoiceCounts.total} total invoice{invoiceCounts.total !== 1 ? 's' : ''}</p>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="w-8 h-8 text-yellow-600" />
            </div>
            <p className="text-sm text-yellow-600 font-medium mb-1">Oldest Open Invoice</p>
            {oldestOpenInvoice ? (
              <>
                <p className="text-sm font-bold text-yellow-900">{formatDateUtil(oldestOpenInvoice.date)}</p>
                <p className="text-xs text-yellow-700 mt-1">Ref: {oldestOpenInvoice.reference_number}</p>
                <p className="text-xs text-yellow-700">{formatCurrency(oldestOpenInvoice.balance)}</p>
              </>
            ) : (
              <p className="text-sm text-yellow-900">No open invoices</p>
            )}
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 text-purple-600" />
            </div>
            <p className="text-sm text-purple-600 font-medium mb-1">Avg Days to Collect</p>
            {avgDaysToCollect !== null ? (
              <>
                <p className="text-2xl font-bold text-purple-900">{avgDaysToCollect} days</p>
                <p className="text-xs text-purple-700 mt-1">From invoice to payment</p>
              </>
            ) : (
              <p className="text-sm text-purple-900">No payment history</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t">
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="font-medium text-gray-900">{customer.email_address || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Location</p>
            <p className="font-medium text-gray-900">{customer.city || 'N/A'}, {customer.country || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Payment Terms</p>
            <p className="font-medium text-gray-900">{customer.terms || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Collection Tickets Section */}
      {loadingTickets ? (
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-gray-600">Loading tickets...</p>
          </div>
        </div>
      ) : tickets.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Ticket className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-2xl font-bold text-gray-900">Collection Tickets</h2>
              <span className="ml-3 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => handleTicketClick(ticket.id)}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer bg-gradient-to-br from-white to-gray-50"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <Ticket className="w-5 h-5 text-blue-600 mr-2" />
                    <span className="font-bold text-gray-900">{ticket.ticket_number}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>

                <div className="space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      ticket.status === 'open' ? 'bg-blue-100 text-blue-800' :
                      ticket.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      ticket.status === 'resolved' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      ticket.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                      ticket.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                      ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {ticket.priority}
                    </span>
                  </div>

                  {ticket.assigned_collector_id && (
                    <div className="flex items-center text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
                      <User className="w-4 h-4 mr-1 text-blue-600" />
                      <span className="font-medium">{ticket.collector_name || ticket.collector_email}</span>
                    </div>
                  )}

                  {!ticket.assigned_collector_id && (
                    <div className="flex items-center text-sm text-gray-400 bg-gray-50 rounded px-2 py-1">
                      <User className="w-4 h-4 mr-1" />
                      <span className="italic">Unassigned</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center">
                      <FileText className="w-3 h-3 mr-1" />
                      <span>{ticket.invoice_count} invoice{ticket.invoice_count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      <span>{formatDateUtil(ticket.created_at)}</span>
                    </div>
                  </div>
                </div>

                {ticket.notes && (
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600 line-clamp-2">{ticket.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Timeline Chart */}
      {loadingChart ? (
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-gray-600">Loading timeline chart...</p>
          </div>
        </div>
      ) : (
        <CustomerTimelineChart
          customerId={customerId}
          customerName={customer.customer_name}
        />
      )}

      <div className="bg-white rounded-lg shadow-md mt-6">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => {
                setActiveTab('open-invoices');
                if (advancedFilters.colorStatus) clearColorFilter();
              }}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'open-invoices'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                Open Invoices ({displayedInvoices.length} / {invoiceCounts.open})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('paid-invoices')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'paid-invoices'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <TrendingDown className="w-4 h-4 mr-2" />
                Paid Invoices ({displayedInvoices.length} / {invoiceCounts.paid})
              </div>
            </button>
            <button
              onClick={() => {
                setActiveTab('payments');
                loadPaymentsData();
              }}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'payments'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <CreditCard className="w-4 h-4 mr-2" />
                Payment History ({payments.length})
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
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
                          <td className="px-6 py-4 whitespace-nowrap relative">
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
                                  setInvoiceToAssign({
                                    refNum: invoice.reference_number,
                                    customerName: customer?.customer_name || 'Unknown',
                                    amount: invoice.balance
                                  });
                                  setShowAssignInvoiceModal(true);
                                }}
                                className="inline-flex items-center px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                title="Assign to collector"
                              >
                                <UserPlus className="w-4 h-4 mr-1" />
                                Assign
                              </button>
                              <button
                                onClick={() => {
                                  setInvoiceToReassign({
                                    id: invoice.id,
                                    refNum: invoice.reference_number,
                                    currentCollectorId: undefined
                                  });
                                  setShowReassignCollectorModal(true);
                                }}
                                className="inline-flex items-center px-3 py-1 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
                                title="Assign Collector"
                              >
                                <User className="w-4 h-4 mr-1" />
                                Collector
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
              ) : payments.length === 0 ? (
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
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {payment.reference_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDateUtil(payment.application_date)}
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
        </div>
      </div>

      {/* Customer Notes & Memos Section - Always Visible */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center mb-4">
          <MessageSquare className="w-6 h-6 text-purple-600 mr-2" />
          <h2 className="text-2xl font-bold text-gray-900">Customer Notes & Memos</h2>
          <span className="ml-3 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
            {customerNotes.length} note{customerNotes.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 className="text-lg font-semibold text-purple-900 mb-2">Add New Note</h3>
          <p className="text-sm text-purple-700 mb-4">
            Record internal information about this customer - outreach attempts, payment discussions, promises to pay, and more.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Note Type</label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="general">General Note</option>
                <option value="outreach">Outreach Attempt</option>
                <option value="payment_discussion">Payment Discussion</option>
                <option value="promise_to_pay">Promise to Pay</option>
                <option value="dispute">Dispute</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Type your note here..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <button
            onClick={handleSaveNote}
            disabled={!newNote.trim() || savingNote}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4 mr-2" />
            {savingNote ? 'Saving Note...' : 'Save Note'}
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="text-lg font-semibold text-gray-900 border-b pb-2">Note History</h4>

          {customerNotes.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No notes yet</p>
              <p className="text-sm text-gray-400 mt-2">Add your first note above to start tracking customer interactions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {customerNotes.map((note) => (
                <div key={note.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">
                        {note.created_by_user_name || note.created_by_user_email}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        note.note_type === 'outreach' ? 'bg-blue-100 text-blue-800' :
                        note.note_type === 'payment_discussion' ? 'bg-green-100 text-green-800' :
                        note.note_type === 'promise_to_pay' ? 'bg-yellow-100 text-yellow-800' :
                        note.note_type === 'dispute' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        <Tag className="w-3 h-3 inline mr-1" />
                        {note.note_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDateUtil(note.created_at)}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.note_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assign Invoice Modal */}
      {showAssignInvoiceModal && invoiceToAssign && (
        <AssignInvoiceModal
          invoiceReferenceNumber={invoiceToAssign.refNum}
          customerName={invoiceToAssign.customerName}
          invoiceAmount={invoiceToAssign.amount}
          onClose={() => {
            setShowAssignInvoiceModal(false);
            setInvoiceToAssign(null);
          }}
          onAssignmentComplete={() => {
            loadCustomerBasicInfo();
          }}
        />
      )}

      {/* Reassign Collector Modal */}
      {showReassignCollectorModal && invoiceToReassign && (
        <ReassignCollectorModal
          isOpen={showReassignCollectorModal}
          invoiceId={invoiceToReassign.id}
          invoiceRef={invoiceToReassign.refNum}
          currentCollectorId={invoiceToReassign.currentCollectorId}
          onClose={() => {
            setShowReassignCollectorModal(false);
            setInvoiceToReassign(null);
          }}
          onReassigned={() => {
            loadInvoices();
          }}
        />
      )}
    </div>
  );
}
