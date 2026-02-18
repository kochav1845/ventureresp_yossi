import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Ticket as TicketIcon,
  FileText,
  ArrowLeft,
  DollarSign,
  CheckSquare,
  Square,
  Plus,
  AlertTriangle,
  Users,
  Archive
} from 'lucide-react';
import InvoiceMemoModal from './InvoiceMemoModal';
import CreateReminderModal from './CreateReminderModal';
import TicketStatusChangeModal from './TicketStatusChangeModal';
import { Assignment, TicketGroup, TicketStatusOption } from './MyAssignments/types';
import TicketCard from './MyAssignments/TicketCard';
import IndividualInvoiceCard from './MyAssignments/IndividualInvoiceCard';
import BatchActionToolbar from './MyAssignments/BatchActionToolbar';
import BatchNoteModal from './MyAssignments/BatchNoteModal';
import PromiseDateModal from './MyAssignments/PromiseDateModal';
import { sortTicketsByPriority } from './MyAssignments/utils';
import TicketSearchFilter, { TicketFilters, filterTickets } from './TicketSearchFilter';
import { format, isPast, parseISO } from 'date-fns';

interface UnifiedTicketingSystemProps {
  showOnlyAssigned?: boolean;
  onBack?: () => void;
  title?: string;
}

interface Customer {
  customer_id: string;
  customer_name: string;
  balance: number;
}

interface Invoice {
  reference_number: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  description: string;
}

interface Collector {
  id: string;
  full_name: string;
  email: string;
}

export default function UnifiedTicketingSystem({
  showOnlyAssigned = false,
  onBack,
  title = 'Ticketing System'
}: UnifiedTicketingSystemProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // View states
  const [activeTab, setActiveTab] = useState<'create' | 'tickets' | 'individual' | 'overdue' | 'closed'>('tickets');

  // Ticket data
  const [tickets, setTickets] = useState<TicketGroup[]>([]);
  const [individualAssignments, setIndividualAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Create ticket states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [selectedInvoicesForTicket, setSelectedInvoicesForTicket] = useState<string[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<string>('');
  const [priority, setPriority] = useState<string>('medium');
  const [ticketType, setTicketType] = useState<string>('');
  const [ticketNotes, setTicketNotes] = useState<string>('');
  const [ticketDueDate, setTicketDueDate] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [pendingInvoiceRef, setPendingInvoiceRef] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Batch operations
  const [memoModalInvoice, setMemoModalInvoice] = useState<any>(null);
  const [changingColorForInvoice, setChangingColorForInvoice] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [showBatchColorMenu, setShowBatchColorMenu] = useState(false);
  const [showBatchNoteModal, setShowBatchNoteModal] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [createReminder, setCreateReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [processingBatch, setProcessingBatch] = useState(false);
  const [changingTicketStatus, setChangingTicketStatus] = useState<string | null>(null);
  const [changingTicketPriority, setChangingTicketPriority] = useState<string | null>(null);
  const [promiseDateModalInvoice, setPromiseDateModalInvoice] = useState<string | null>(null);

  // Options
  const [statusOptions, setStatusOptions] = useState<TicketStatusOption[]>([]);
  const [colorOptions, setColorOptions] = useState<Array<{ status_name: string; display_name: string; color_class: string }>>([]);
  const [ticketTypeOptions, setTicketTypeOptions] = useState<Array<{ value: string; label: string }>>([]);

  // Reminder modal
  const [reminderModal, setReminderModal] = useState<{
    type: 'ticket' | 'invoice';
    ticketId?: string;
    ticketNumber?: string;
    invoiceReference?: string;
    customerName?: string;
  } | null>(null);

  // Status change modal
  const [statusChangeModal, setStatusChangeModal] = useState<{
    ticketId: string;
    ticketNumber: string;
    currentStatus: string;
    newStatus: string;
    currentStatusDisplay?: string;
    newStatusDisplay?: string;
  } | null>(null);

  // Filters
  const [filters, setFilters] = useState<TicketFilters>({
    searchTerm: '',
    status: '',
    priority: '',
    ticketType: '',
    dateFrom: '',
    dateTo: '',
    assignedTo: '',
    brokenPromise: false
  });

  // Separate closed tickets from active tickets
  const activeTickets = tickets.filter(t => t.ticket_status !== 'closed');
  const closedTickets = tickets.filter(t => t.ticket_status === 'closed');

  // Apply filters
  const filteredTickets = filterTickets(activeTickets, filters);
  const filteredClosedTickets = filterTickets(closedTickets, filters);
  const filteredIndividualAssignments = filterTickets(individualAssignments, filters);

  // Filter overdue tickets (only from active tickets)
  const overdueTickets = activeTickets.filter(ticket =>
    ticket.ticket_due_date && isPast(parseISO(ticket.ticket_due_date))
  );

  useEffect(() => {
    if (user && profile) {
      loadStatusOptions();
      loadColorOptions();
      loadTicketTypeOptions();
      loadTickets();
    }
  }, [user, profile, showOnlyAssigned]);

  useEffect(() => {
    if (user && profile && activeTab === 'create') {
      loadCustomers();
      loadCollectors();
    }
  }, [user, profile, activeTab]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle URL parameters for creating new ticket or navigating to specific ticket
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const customerId = params.get('customerId');
    const invoiceRef = params.get('invoiceRef');
    const targetTicketId = params.get('ticket');

    if (targetTicketId && !loading) {
      const targetTab = params.get('tab');
      setActiveTab(targetTab === 'closed' ? 'closed' : 'tickets');
      setTimeout(() => {
        const element = document.getElementById(`ticket-${targetTicketId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-4', 'ring-blue-400');
          setTimeout(() => {
            element.classList.remove('ring-4', 'ring-blue-400');
          }, 3000);
        }
      }, 500);
    }

    if ((customerId || invoiceRef) && user && profile) {
      setActiveTab('create');

      if (customers.length === 0) {
        loadCustomers();
      }
      if (collectors.length === 0) {
        loadCollectors();
      }

      if (customerId) {
        setSelectedCustomer(customerId);
        loadCustomerInvoices(customerId);
      }

      if (invoiceRef) {
        setPendingInvoiceRef(invoiceRef);
      }
    }
  }, [location.search, user, profile, loading]);

  // Auto-select pending invoice once invoices finish loading
  useEffect(() => {
    if (pendingInvoiceRef && customerInvoices.length > 0) {
      const match = customerInvoices.find(inv => inv.reference_number === pendingInvoiceRef);
      if (match) {
        setSelectedInvoicesForTicket([pendingInvoiceRef]);
      }
      setPendingInvoiceRef(null);
    }
  }, [pendingInvoiceRef, customerInvoices]);

  // Set customer name in search field when customers load and one is pre-selected
  useEffect(() => {
    if (selectedCustomer && customers.length > 0 && !searchTerm) {
      const customer = customers.find(c => c.customer_id === selectedCustomer);
      if (customer) {
        setSearchTerm(customer.customer_name);
      }
    }
  }, [selectedCustomer, customers]);

  const loadStatusOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_status_options')
        .select('id, status_name, display_name, color_class, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setStatusOptions(data || []);
    } catch (error) {
      console.error('Error loading status options:', error);
    }
  };

  const loadColorOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_color_status_options')
        .select('status_name, display_name, color_class')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setColorOptions(data || []);
    } catch (error) {
      console.error('Error loading color options:', error);
    }
  };

  const loadTicketTypeOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_type_options')
        .select('value, label')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTicketTypeOptions(data || []);
      if (data && data.length > 0 && !ticketType) {
        setTicketType(data[0].value);
      }
    } catch (error) {
      console.error('Error loading ticket type options:', error);
    }
  };

  const loadTickets = async () => {
    if (!user || !profile) return;

    setLoading(true);
    try {
      let query = supabase
        .from('collector_assignment_details')
        .select('*');

      // Filter by assigned collector if showOnlyAssigned is true
      if (showOnlyAssigned) {
        query = query.eq('assigned_collector_id', profile.id);
      }

      const { data: assignments, error } = await query;

      if (error) throw error;

      if (assignments) {
        const ticketGroups = new Map<string, TicketGroup>();
        const individualList: Assignment[] = [];

        assignments.forEach((assignment: any) => {
          if (assignment.ticket_id) {
            if (!ticketGroups.has(assignment.ticket_id)) {
              ticketGroups.set(assignment.ticket_id, {
                ticket_id: assignment.ticket_id,
                ticket_number: assignment.ticket_number || '',
                ticket_status: assignment.ticket_status || '',
                ticket_priority: assignment.ticket_priority || '',
                ticket_type: assignment.ticket_type || '',
                ticket_due_date: assignment.ticket_due_date,
                assigned_collector_id: assignment.assigned_collector_id || null,
                assigned_collector_name: assignment.collector_name || assignment.collector_email || null,
                customer_id: assignment.customer,
                customer_name: assignment.customer_name,
                invoices: []
              });
            }
            ticketGroups.get(assignment.ticket_id)!.invoices.push(assignment);
          } else {
            individualList.push(assignment);
          }
        });

        // Load tickets that have no invoice assignments (they won't appear in the view)
        let emptyTicketsQuery = supabase
          .from('collection_tickets')
          .select(`
            id,
            ticket_number,
            customer_id,
            customer_name,
            status,
            priority,
            ticket_type,
            due_date,
            assigned_collector_id,
            collector:user_profiles!collection_tickets_assigned_collector_id_fkey(full_name, email)
          `);

        if (showOnlyAssigned) {
          emptyTicketsQuery = emptyTicketsQuery.eq('assigned_collector_id', profile.id);
        }

        const { data: allActiveTickets } = await emptyTicketsQuery;

        if (allActiveTickets) {
          allActiveTickets.forEach((t: any) => {
            if (!ticketGroups.has(t.id)) {
              ticketGroups.set(t.id, {
                ticket_id: t.id,
                ticket_number: t.ticket_number || '',
                ticket_status: t.status || '',
                ticket_priority: t.priority || '',
                ticket_type: t.ticket_type || '',
                ticket_due_date: t.due_date,
                assigned_collector_id: t.assigned_collector_id || null,
                assigned_collector_name: t.collector?.full_name || t.collector?.email || null,
                customer_id: t.customer_id,
                customer_name: t.customer_name,
                invoices: []
              });
            }
          });
        }

        const ticketGroupsArray = Array.from(ticketGroups.values());
        await Promise.all(ticketGroupsArray.map(async (ticket) => {
          const { data: ticketData } = await supabase
            .from('collection_tickets')
            .select('promise_date, promise_by_user_id, created_at, resolved_at')
            .eq('id', ticket.ticket_id)
            .maybeSingle();

          if (ticketData) {
            ticket.promise_date = ticketData.promise_date;
            ticket.ticket_created_at = ticketData.created_at;
            ticket.ticket_closed_at = ticketData.resolved_at;

            if (ticketData.promise_by_user_id) {
              const { data: userData } = await supabase
                .from('user_profiles')
                .select('full_name, email')
                .eq('id', ticketData.promise_by_user_id)
                .maybeSingle();

              if (userData) {
                ticket.promise_by_user_name = userData.full_name || userData.email;
              }
            }
          }

          const { data: statusChange } = await supabase
            .from('ticket_activity_log')
            .select(`
              description,
              created_at,
              created_by:user_profiles!ticket_activity_log_created_by_fkey(full_name, email)
            `)
            .eq('ticket_id', ticket.ticket_id)
            .eq('activity_type', 'status_change')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (statusChange) {
            const statusMatch = statusChange.description.match(/Changed ticket status to "(.+?)"/);
            ticket.last_status_change = {
              status: statusMatch ? statusMatch[1] : ticket.ticket_status,
              changed_at: statusChange.created_at,
              changed_by_name: statusChange.created_by?.full_name || statusChange.created_by?.email || 'Unknown'
            };
          }

          const { data: activity } = await supabase
            .from('ticket_activity_log')
            .select(`
              description,
              created_at,
              created_by:user_profiles!ticket_activity_log_created_by_fkey(full_name, email)
            `)
            .eq('ticket_id', ticket.ticket_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (activity) {
            ticket.last_activity = {
              description: activity.description,
              created_at: activity.created_at,
              created_by_name: activity.created_by?.full_name || activity.created_by?.email || 'Unknown'
            };
          }

          const { data: noteData } = await supabase
            .from('ticket_notes')
            .select('note_text, created_at, document_urls, has_voice_note, has_image')
            .eq('ticket_id', ticket.ticket_id)
            .order('created_at', { ascending: false });

          if (noteData && noteData.length > 0) {
            ticket.note_count = noteData.length;
            ticket.has_attachments = noteData.some(note =>
              (note.document_urls && note.document_urls.length > 0) ||
              note.has_voice_note ||
              note.has_image
            );
            ticket.last_note = {
              note_text: noteData[0].note_text,
              created_at: noteData[0].created_at
            };
          }
        }));

        // Fetch real-time customer balance data for all unique customers
        const uniqueCustomerIds = [...new Set(ticketGroupsArray.map(t => t.customer_id))];

        if (uniqueCustomerIds.length > 0) {
          const { data: customerBalances, error: balanceError } = await supabase
            .from('acumatica_invoices')
            .select('customer, date, balance, status')
            .in('customer', uniqueCustomerIds)
            .neq('status', 'Closed');

          if (!balanceError && customerBalances) {
            // Calculate balance data for each customer
            const customerStats = new Map<string, {
              balance: number;
              invoice_count: number;
              oldest_date: string | null;
            }>();

            customerBalances.forEach(inv => {
              if (!customerStats.has(inv.customer)) {
                customerStats.set(inv.customer, {
                  balance: 0,
                  invoice_count: 0,
                  oldest_date: null
                });
              }

              const stats = customerStats.get(inv.customer)!;
              stats.balance += inv.balance || 0;
              stats.invoice_count += 1;

              if (!stats.oldest_date || (inv.date && inv.date < stats.oldest_date)) {
                stats.oldest_date = inv.date;
              }
            });

            // Merge balance data into tickets
            ticketGroupsArray.forEach(ticket => {
              const stats = customerStats.get(ticket.customer_id);
              if (stats) {
                ticket.customer_balance = stats.balance;
                ticket.open_invoice_count = stats.invoice_count;
                ticket.oldest_invoice_date = stats.oldest_date;
              }
            });
          }
        }

        if (uniqueCustomerIds.length > 0) {
          const { data: lastPayments, error: paymentError } = await supabase
            .from('acumatica_payments')
            .select('customer_id, payment_amount, application_date')
            .in('customer_id', uniqueCustomerIds)
            .in('type', ['Payment', 'Prepayment'])
            .order('application_date', { ascending: false });

          if (!paymentError && lastPayments) {
            const customerLastPayment = new Map<string, { amount: number; date: string }>();
            lastPayments.forEach(p => {
              if (!customerLastPayment.has(p.customer_id)) {
                customerLastPayment.set(p.customer_id, {
                  amount: p.payment_amount,
                  date: p.application_date
                });
              }
            });

            ticketGroupsArray.forEach(ticket => {
              const lp = customerLastPayment.get(ticket.customer_id);
              if (lp) {
                ticket.last_payment_amount = lp.amount;
                ticket.last_payment_date = lp.date;
              }
            });
          }
        }

        const allInvoiceRefs = ticketGroupsArray.flatMap(t => t.invoices.map(inv => inv.invoice_reference_number));
        if (allInvoiceRefs.length > 0) {
          const { data: appData } = await supabase
            .from('payment_invoice_applications')
            .select('invoice_reference_number, application_date, amount_paid')
            .in('invoice_reference_number', allInvoiceRefs)
            .gt('amount_paid', 0)
            .order('application_date', { ascending: false });

          if (appData) {
            const invoiceCollectionDate = new Map<string, string>();
            appData.forEach(a => {
              if (!invoiceCollectionDate.has(a.invoice_reference_number) && a.application_date) {
                invoiceCollectionDate.set(a.invoice_reference_number, a.application_date);
              }
            });

            ticketGroupsArray.forEach(ticket => {
              ticket.invoices.forEach(inv => {
                const colDate = invoiceCollectionDate.get(inv.invoice_reference_number);
                if (colDate) {
                  inv.collection_date = colDate;
                }
              });
            });
          }
        }

        const sortedTickets = sortTicketsByPriority(ticketGroupsArray);
        setTickets(sortedTickets);
        setIndividualAssignments(individualList);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try {
      const { data, error } = await supabase.rpc('get_customers_with_balance', {
        p_balance_filter: 'all',
        p_limit: 1000,
        p_exclude_credit_memos: true,
        p_calculate_avg_days: false
      });

      if (error) {
        console.error('Error loading customers:', error);
        throw error;
      }

      // Map the gross_balance (invoices only, excluding credit memos) for collection purposes
      const mappedCustomers = (data || []).map((c: any) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        balance: c.gross_balance || 0
      }));

      setCustomers(mappedCustomers);
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const loadCollectors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('role', ['collector', 'manager', 'admin'])
        .eq('account_status', 'approved')
        .order('full_name');

      if (error) throw error;
      setCollectors(data || []);
    } catch (error) {
      console.error('Error loading collectors:', error);
    }
  };

  const loadCustomerInvoices = async (customerId: string) => {
    try {
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, date, due_date, amount, balance, description')
        .eq('customer', customerId)
        .eq('status', 'Open')
        .gt('balance', 0)
        .order('date', { ascending: false });

      if (error) throw error;
      setCustomerInvoices(data || []);
    } catch (error) {
      console.error('Error loading customer invoices:', error);
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.customer_id === customerId);
    if (customer) {
      setSearchTerm(customer.customer_name);
    }
    setSelectedCustomer(customerId);
    setShowCustomerDropdown(false);
    setSelectedInvoicesForTicket([]);
    loadCustomerInvoices(customerId);
  };

  // Memoize filtered customers to prevent unnecessary recalculations
  const filteredCustomers = useMemo(() => {
    if (!searchTerm || searchTerm.trim() === '') {
      return customers;
    }

    const search = searchTerm.toLowerCase().trim();
    return customers.filter(c =>
      c.customer_name.toLowerCase().includes(search) ||
      c.customer_id.toLowerCase().includes(search)
    );
  }, [customers, searchTerm]);

  const handleCreateTicket = async () => {
    if (!selectedCustomer || !selectedCollector || selectedInvoicesForTicket.length === 0) {
      alert('Please select a customer, collector, and at least one invoice');
      return;
    }

    if (!profile) {
      alert('You must be logged in to create tickets');
      return;
    }

    setCreating(true);
    try {
      const { data: existingTickets, error: checkError } = await supabase
        .from('collection_tickets')
        .select('*')
        .eq('customer_id', selectedCustomer)
        .eq('assigned_collector_id', selectedCollector)
        .in('status', ['open', 'in_progress']);

      if (checkError) throw checkError;

      if (existingTickets && existingTickets.length > 0) {
        const confirmMerge = window.confirm(
          `An open ticket already exists for this customer and collector (${existingTickets[0].ticket_number}). Would you like to add these invoices to the existing ticket instead?`
        );

        if (confirmMerge) {
          for (const refNumber of selectedInvoicesForTicket) {
            await supabase.from('invoice_assignments').upsert({
              invoice_reference_number: refNumber,
              assigned_collector_id: selectedCollector,
              ticket_id: existingTickets[0].id,
              assigned_by: user!.id,
              notes: ticketNotes || null
            }, {
              onConflict: 'invoice_reference_number'
            });
          }

          await supabase.from('ticket_activity_log').insert({
            ticket_id: existingTickets[0].id,
            created_by: user!.id,
            activity_type: 'invoice_added',
            description: `Added ${selectedInvoicesForTicket.length} invoice(s) to ticket`
          });

          alert(`Successfully added ${selectedInvoicesForTicket.length} invoice(s) to ticket ${existingTickets[0].ticket_number}`);
          resetCreateForm();
          await loadTickets();
          setActiveTab('tickets');
          return;
        }
      }

      const selectedCustomerData = customers.find(c => c.customer_id === selectedCustomer);
      if (!selectedCustomerData) {
        throw new Error('Selected customer not found');
      }

      const { data: newTicket, error: ticketError } = await supabase
        .from('collection_tickets')
        .insert({
          customer_id: selectedCustomer,
          customer_name: selectedCustomerData.customer_name,
          assigned_collector_id: selectedCollector,
          created_by: profile.id,
          priority: priority,
          status: 'open',
          ticket_type: ticketType,
          due_date: ticketDueDate || null
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      for (const refNumber of selectedInvoicesForTicket) {
        await supabase.from('invoice_assignments').upsert({
          invoice_reference_number: refNumber,
          assigned_collector_id: selectedCollector,
          ticket_id: newTicket.id,
          assigned_by: user!.id,
          notes: ticketNotes || null
        }, {
          onConflict: 'invoice_reference_number'
        });
      }

      await supabase.from('ticket_activity_log').insert({
        ticket_id: newTicket.id,
        created_by: user!.id,
        activity_type: 'created',
        description: `Created ticket with ${selectedInvoicesForTicket.length} invoice(s)`
      });

      if (ticketNotes) {
        await supabase.from('ticket_notes').insert({
          ticket_id: newTicket.id,
          created_by: user!.id,
          note_text: ticketNotes
        });
      }

      alert(`Ticket ${newTicket.ticket_number} created successfully!`);
      resetCreateForm();
      await loadTickets();
      setActiveTab('tickets');
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      alert('Failed to create ticket: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedCustomer('');
    setCustomerInvoices([]);
    setSelectedInvoicesForTicket([]);
    setSelectedCollector('');
    setPriority('medium');
    setTicketType(ticketTypeOptions[0]?.value || '');
    setTicketNotes('');
    setTicketDueDate('');
    setSearchTerm('');
  };

  const handleColorChange = async (invoiceRefNumber: string, newColor: string | null) => {
    if (!profile?.id) return;

    try {
      const { data: invoice } = await supabase
        .from('acumatica_invoices')
        .select('id')
        .eq('reference_number', invoiceRefNumber)
        .single();

      if (!invoice) throw new Error('Invoice not found');

      if (newColor === 'green') {
        setPromiseDateModalInvoice(invoiceRefNumber);
        return;
      }

      await supabase
        .from('acumatica_invoices')
        .update({ color_status: newColor })
        .eq('reference_number', invoiceRefNumber);

      await supabase.from('invoice_activity_log').insert({
        invoice_id: invoice.id,
        user_id: profile.id,
        activity_type: 'color_status_change',
        old_value: null,
        new_value: newColor,
        description: `Changed color status to ${newColor || 'none'}`
      });

      setChangingColorForInvoice(null);
      await loadTickets();
    } catch (error: any) {
      console.error('Error changing color:', error);
      alert('Failed to change color: ' + error.message);
    }
  };

  const handlePromiseDateConfirm = async (promiseDate: string) => {
    if (!profile?.id || !promiseDateModalInvoice) return;

    try {
      const { data: invoice } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, customer_name')
        .eq('reference_number', promiseDateModalInvoice)
        .maybeSingle();

      if (!invoice) throw new Error('Invoice not found');

      await supabase
        .from('acumatica_invoices')
        .update({
          color_status: 'green',
          promise_date: promiseDate,
          promise_by_user_id: profile.id
        })
        .eq('reference_number', promiseDateModalInvoice);

      await supabase.from('invoice_activity_log').insert({
        invoice_id: invoice.id,
        user_id: profile.id,
        activity_type: 'color_status_change',
        old_value: null,
        new_value: 'green',
        description: `Marked as "Will Pay" with promise date: ${promiseDate}`
      });

      setPromiseDateModalInvoice(null);

      const wantsReminder = window.confirm('Do you want to create a reminder for this promise date?');
      if (wantsReminder) {
        navigate('/reminders', {
          state: {
            createReminder: true,
            invoiceId: invoice.id,
            invoiceReference: invoice.reference_number,
            customerName: invoice.customer_name,
            promiseDate: promiseDate
          }
        });
      } else {
        await loadTickets();
      }
    } catch (error: any) {
      console.error('Error setting promise date:', error);
      alert('Failed to set promise date: ' + error.message);
      setPromiseDateModalInvoice(null);
    }
  };

  const toggleInvoiceSelection = (invoiceRefNumber: string) => {
    const newSelection = new Set(selectedInvoices);
    if (newSelection.has(invoiceRefNumber)) {
      newSelection.delete(invoiceRefNumber);
    } else {
      newSelection.add(invoiceRefNumber);
    }
    setSelectedInvoices(newSelection);
  };

  const toggleSelectAll = () => {
    const allInvoices: string[] = [];

    if (activeTab === 'tickets') {
      tickets.forEach(ticket => {
        ticket.invoices.forEach(inv => allInvoices.push(inv.invoice_reference_number));
      });
    } else if (activeTab === 'individual') {
      individualAssignments.forEach(inv => allInvoices.push(inv.invoice_reference_number));
    }

    if (selectedInvoices.size === allInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(allInvoices));
    }
  };

  const handleSelectAllInTicket = (invoiceRefs: string[]) => {
    const allSelected = invoiceRefs.every(ref => selectedInvoices.has(ref));
    const newSelection = new Set(selectedInvoices);
    if (allSelected) {
      invoiceRefs.forEach(ref => newSelection.delete(ref));
    } else {
      invoiceRefs.forEach(ref => newSelection.add(ref));
    }
    setSelectedInvoices(newSelection);
  };

  const handleBatchColorChange = async (newColor: string | null) => {
    if (!profile?.id || selectedInvoices.size === 0) return;

    setProcessingBatch(true);
    try {
      await supabase.rpc('batch_update_invoice_color_status_by_refs', {
        p_reference_numbers: Array.from(selectedInvoices),
        p_color_status: newColor,
        p_user_id: profile.id
      });

      setShowBatchColorMenu(false);
      setSelectedInvoices(new Set());
      await loadTickets();
      alert(`Successfully updated ${selectedInvoices.size} invoice(s)`);
    } catch (error: any) {
      console.error('Error changing colors:', error);
      alert('Failed to change colors: ' + error.message);
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleTicketStatusChange = async (ticketId: string, newStatus: string) => {
    if (!profile?.id) return;

    // Find the ticket to get its current status and ticket number
    const ticket = tickets.find(t => t.ticket_id === ticketId);
    if (!ticket) {
      alert('Ticket not found');
      return;
    }

    // Get display names for statuses
    const currentStatusOption = statusOptions.find(opt => opt.status_name === ticket.ticket_status);
    const newStatusOption = statusOptions.find(opt => opt.status_name === newStatus);

    // Show the modal to get the note
    setStatusChangeModal({
      ticketId,
      ticketNumber: ticket.ticket_number,
      currentStatus: ticket.ticket_status,
      newStatus,
      currentStatusDisplay: currentStatusOption?.display_name,
      newStatusDisplay: newStatusOption?.display_name
    });
  };

  const confirmTicketStatusChange = async (note: string) => {
    if (!statusChangeModal || !profile?.id) return;

    const { ticketId, currentStatus, newStatus } = statusChangeModal;

    setChangingTicketStatus(ticketId);
    try {
      // Get the ticket details for logging
      const { data: ticketData, error: ticketError } = await supabase
        .from('collection_tickets')
        .select('ticket_number, customer_id')
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;

      // Update the ticket status
      const { error: updateError } = await supabase
        .from('collection_tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      if (updateError) throw updateError;

      // Insert status history with note
      const { error: historyError } = await supabase
        .from('ticket_status_history')
        .insert({
          ticket_id: ticketId,
          old_status: currentStatus,
          new_status: newStatus,
          changed_by: profile.id,
          notes: note
        });

      if (historyError) throw historyError;

      // Insert activity log
      const { error: activityError } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: ticketId,
          activity_type: 'status_change',
          description: `Status changed from ${currentStatus} to ${newStatus}: ${note}`,
          created_by: profile.id,
          metadata: {
            old_status: currentStatus,
            new_status: newStatus,
            note: note
          }
        });

      if (activityError) throw activityError;

      setStatusChangeModal(null);
      await loadTickets();
      alert('Ticket status updated successfully');
    } catch (error: any) {
      console.error('Error changing ticket status:', error);
      alert('Failed to change ticket status: ' + error.message);
    } finally {
      setChangingTicketStatus(null);
    }
  };

  const handleTicketPriorityChange = async (ticketId: string, newPriority: string) => {
    if (!profile?.id) return;

    setChangingTicketPriority(ticketId);
    try {
      await supabase.rpc('update_ticket_priority', {
        p_ticket_id: ticketId,
        p_new_priority: newPriority,
        p_user_id: profile.id
      });

      await loadTickets();
      alert('Ticket priority updated successfully');
    } catch (error: any) {
      console.error('Error changing ticket priority:', error);
      alert('Failed to change ticket priority: ' + error.message);
    } finally {
      setChangingTicketPriority(null);
    }
  };

  const handleBatchAddNote = async () => {
    if (!profile?.id || selectedInvoices.size === 0 || !batchNote.trim()) return;

    setProcessingBatch(true);
    try {
      const notePromises = Array.from(selectedInvoices).map(async (refNumber) => {
        const { data: invoice } = await supabase
          .from('acumatica_invoices')
          .select('id')
          .eq('reference_number', refNumber)
          .single();

        if (!invoice) return;

        await supabase
          .from('invoice_memos')
          .insert({
            invoice_id: invoice.id,
            invoice_reference: refNumber,
            created_by_user_id: user!.id,
            memo_text: batchNote
          });

        if (createReminder && reminderDate) {
          await supabase
            .from('invoice_reminders')
            .insert({
              invoice_id: invoice.id,
              invoice_reference_number: refNumber,
              user_id: user!.id,
              reminder_date: reminderDate,
              title: `Follow up on invoice ${refNumber}`,
              description: batchNote,
              status: 'pending'
            });
        }
      });

      await Promise.all(notePromises);

      setShowBatchNoteModal(false);
      setBatchNote('');
      setCreateReminder(false);
      setReminderDate('');
      setSelectedInvoices(new Set());

      await loadTickets();

      alert(`Successfully added note to ${selectedInvoices.size} invoice(s)${createReminder ? ' with reminders' : ''}`);
    } catch (error: any) {
      console.error('Error adding notes:', error);
      alert('Failed to add notes: ' + error.message);
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleOpenMemo = async (invoice: Assignment) => {
    try {
      const { data: invoiceData, error } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, customer, customer_name, date, balance, status')
        .eq('reference_number', invoice.invoice_reference_number)
        .maybeSingle();

      if (error || !invoiceData) {
        alert('Failed to load invoice details');
        return;
      }

      setMemoModalInvoice(invoiceData);
    } catch (err) {
      console.error('Error in handleOpenMemo:', err);
      alert('Failed to open memo');
    }
  };

  const handleOpenTicketReminder = (ticket: TicketGroup) => {
    setReminderModal({
      type: 'ticket',
      ticketId: ticket.ticket_id,
      ticketNumber: ticket.ticket_number,
      customerName: ticket.customer_name
    });
  };

  const handleOpenInvoiceReminder = (invoice: Assignment) => {
    setReminderModal({
      type: 'invoice',
      invoiceReference: invoice.invoice_reference_number,
      customerName: invoice.customer_name,
      ticketId: invoice.ticket_id || undefined,
      ticketNumber: invoice.ticket_number || undefined
    });
  };

  const handleAddInvoicesToTicket = async (ticketId: string, invoiceRefs: string[], collectorId: string) => {
    if (!user?.id) return;
    try {
      for (const refNumber of invoiceRefs) {
        await supabase.from('invoice_assignments').upsert({
          invoice_reference_number: refNumber,
          assigned_collector_id: collectorId,
          ticket_id: ticketId,
          assigned_by: user.id,
        }, { onConflict: 'invoice_reference_number' });
      }

      await supabase.from('ticket_activity_log').insert({
        ticket_id: ticketId,
        created_by: user.id,
        activity_type: 'invoice_added',
        description: `Added ${invoiceRefs.length} invoice(s) to ticket`,
        metadata: { invoice_refs: invoiceRefs }
      });

      await loadTickets();
    } catch (error: any) {
      console.error('Error adding invoices to ticket:', error);
      throw error;
    }
  };

  const handleRemoveInvoiceFromTicket = async (ticketId: string, invoiceRef: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('invoice_assignments')
        .delete()
        .eq('ticket_id', ticketId)
        .eq('invoice_reference_number', invoiceRef);

      if (error) throw error;

      await supabase.from('ticket_activity_log').insert({
        ticket_id: ticketId,
        created_by: user.id,
        activity_type: 'invoice_removed',
        description: `Removed invoice ${invoiceRef} from ticket`,
        metadata: { invoice_ref: invoiceRef }
      });

      await loadTickets();
    } catch (error: any) {
      console.error('Error removing invoice from ticket:', error);
      throw error;
    }
  };

  const totalInvoiceCount =
    activeTab === 'tickets'
      ? tickets.reduce((sum, ticket) => sum + ticket.invoices.length, 0)
      : individualAssignments.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tickets...</p>
        </div>
      </div>
    );
  }

  const selectedCustomerData = customers.find(c => c.customer_id === selectedCustomer);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>
            )}
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm mb-6">
          {!showOnlyAssigned && (
            <div className="border-b border-gray-200">
              <div className="flex gap-1 p-1">
                <button
                  onClick={() => setActiveTab('create')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'create'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Plus className="w-5 h-5" />
                  Create Ticket
                </button>
                <button
                  onClick={() => setActiveTab('tickets')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'tickets'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <TicketIcon className="w-5 h-5" />
                  Tickets ({filteredTickets.length})
                </button>
                <button
                  onClick={() => setActiveTab('individual')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'individual'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  Individual Invoices ({filteredIndividualAssignments.length})
                </button>
                <button
                  onClick={() => setActiveTab('overdue')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'overdue'
                      ? 'bg-red-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5" />
                  Overdue Tickets ({overdueTickets.length})
                </button>
                <button
                  onClick={() => setActiveTab('closed')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === 'closed'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Archive className="w-5 h-5" />
                  Closed ({closedTickets.length})
                </button>
              </div>
            </div>
          )}

          {activeTab === 'create' && !showOnlyAssigned && (
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-6">Create New Collection Ticket</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer {customers.length > 0 && <span className="text-gray-500 text-xs">({customers.length} available)</span>}
                  </label>
                  <div className="relative" ref={dropdownRef}>
                    <input
                      type="text"
                      placeholder="Type to search or click to see all customers..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSelectedCustomer('');
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => {
                        setShowCustomerDropdown(true);
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />

                    {showCustomerDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-500 rounded-lg shadow-2xl max-h-80 overflow-y-auto">
                        {loadingCustomers ? (
                          <div className="px-4 py-8 text-gray-500 text-center">
                            <div className="animate-pulse">Loading customers...</div>
                          </div>
                        ) : filteredCustomers.length > 0 ? (
                          <>
                            <div className="sticky top-0 bg-gray-50 px-4 py-2 text-xs text-gray-600 border-b">
                              Showing {Math.min(filteredCustomers.length, 100)} of {filteredCustomers.length} customers
                            </div>
                            {filteredCustomers.slice(0, 100).map((customer) => (
                              <button
                                key={customer.customer_id}
                                onClick={() => handleCustomerSelect(customer.customer_id)}
                                className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                              >
                                <div className="font-medium text-gray-900">{customer.customer_name}</div>
                                <div className="text-sm text-gray-500">ID: {customer.customer_id}</div>
                                <div className="text-sm text-red-600 font-semibold">
                                  Balance: ${customer.balance.toFixed(2)}
                                </div>
                              </button>
                            ))}
                          </>
                        ) : customers.length === 0 ? (
                          <div className="px-4 py-8 text-gray-500 text-center">
                            <div className="text-red-600 font-semibold mb-2">No customers loaded</div>
                            <div className="text-sm">Please check your database connection</div>
                          </div>
                        ) : (
                          <div className="px-4 py-8 text-gray-500 text-center">
                            <div className="font-semibold mb-2">No customers match "{searchTerm}"</div>
                            <div className="text-sm">Try a different search term</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedCustomer && selectedCustomerData && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="font-semibold text-blue-900">{selectedCustomerData.customer_name}</p>
                      <p className="text-sm text-blue-700">Balance: ${selectedCustomerData.balance.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                {customerInvoices.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Select Invoices ({selectedInvoicesForTicket.length} selected)
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                        <input
                          type="checkbox"
                          checked={customerInvoices.length > 0 && selectedInvoicesForTicket.length === customerInvoices.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedInvoicesForTicket(customerInvoices.map(inv => inv.reference_number));
                            } else {
                              setSelectedInvoicesForTicket([]);
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        Select All
                      </label>
                    </div>
                    <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                      {customerInvoices.map((invoice) => (
                        <label
                          key={invoice.reference_number}
                          className="flex items-center p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedInvoicesForTicket.includes(invoice.reference_number)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedInvoicesForTicket([...selectedInvoicesForTicket, invoice.reference_number]);
                              } else {
                                setSelectedInvoicesForTicket(selectedInvoicesForTicket.filter(ref => ref !== invoice.reference_number));
                              }
                            }}
                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{invoice.reference_number}</div>
                            <div className="text-sm text-gray-500">{invoice.description}</div>
                            <div className="text-sm text-gray-500">
                              Date: {new Date(invoice.date).toLocaleDateString()} | Due: {new Date(invoice.due_date).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-500">Amount: ${invoice.amount.toFixed(2)}</div>
                            <div className="font-semibold text-red-600">Balance: ${invoice.balance.toFixed(2)}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Assign to Collector
                    </label>
                    <select
                      value={selectedCollector}
                      onChange={(e) => setSelectedCollector(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select collector...</option>
                      {collectors.map((collector) => (
                        <option key={collector.id} value={collector.id}>
                          {collector.full_name} ({collector.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ticket Type
                    </label>
                    <select
                      value={ticketType}
                      onChange={(e) => setTicketType(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {ticketTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={ticketDueDate}
                      onChange={(e) => setTicketDueDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={ticketNotes}
                    onChange={(e) => setTicketNotes(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    placeholder="Add any notes or context for this ticket..."
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={resetCreateForm}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleCreateTicket}
                    disabled={creating || !selectedCustomer || !selectedCollector || selectedInvoicesForTicket.length === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {creating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Create Ticket
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {(showOnlyAssigned || activeTab === 'tickets' || activeTab === 'overdue' || activeTab === 'closed') && (
            <div className="p-6">
              <TicketSearchFilter
                filters={filters}
                onFiltersChange={setFilters}
                showAssignedToFilter={!showOnlyAssigned}
              />

              <div className="mt-6">
                <BatchActionToolbar
                  selectedCount={selectedInvoices.size}
                  totalCount={totalInvoiceCount}
                  showBatchColorMenu={showBatchColorMenu}
                  colorOptions={colorOptions}
                  processingBatch={processingBatch}
                  onToggleSelectAll={toggleSelectAll}
                  onToggleBatchColorMenu={() => setShowBatchColorMenu(!showBatchColorMenu)}
                  onBatchColorChange={handleBatchColorChange}
                  onBatchAddNote={() => setShowBatchNoteModal(true)}
                />
              </div>

              <div className="mt-6 space-y-6">
                {(() => {
                  const displayTickets = showOnlyAssigned
                    ? filteredTickets
                    : activeTab === 'overdue'
                      ? overdueTickets
                      : activeTab === 'closed'
                        ? filteredClosedTickets
                        : filteredTickets;

                  const emptyMessage = activeTab === 'overdue'
                    ? 'No overdue tickets'
                    : activeTab === 'closed'
                      ? closedTickets.length === 0
                        ? 'No closed tickets'
                        : 'No closed tickets match your search'
                      : tickets.length === 0
                        ? showOnlyAssigned
                          ? 'No tickets assigned to you'
                          : 'No tickets found'
                        : 'No tickets match your search';

                  return displayTickets.length === 0 ? (
                    <div className="text-center py-12">
                      <TicketIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">{emptyMessage}</p>
                    </div>
                  ) : (
                    displayTickets.map(ticket => (
                      <TicketCard
                        key={ticket.ticket_id}
                        ticket={ticket}
                        selectedInvoices={selectedInvoices}
                        changingColorForInvoice={changingColorForInvoice}
                        changingTicketStatus={changingTicketStatus}
                        changingTicketPriority={changingTicketPriority}
                        statusOptions={statusOptions}
                        colorOptions={colorOptions}
                        onToggleInvoiceSelection={toggleInvoiceSelection}
                        onSelectAllInTicket={handleSelectAllInTicket}
                        onColorChange={handleColorChange}
                        onToggleColorPicker={setChangingColorForInvoice}
                        onOpenMemo={handleOpenMemo}
                        onTicketStatusChange={handleTicketStatusChange}
                        onTicketPriorityChange={handleTicketPriorityChange}
                        onPromiseDateSet={loadTickets}
                        onOpenTicketReminder={handleOpenTicketReminder}
                        onOpenInvoiceReminder={handleOpenInvoiceReminder}
                        onAddInvoices={handleAddInvoicesToTicket}
                        onRemoveInvoice={handleRemoveInvoiceFromTicket}
                      />
                    ))
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'individual' && (
            <div className="p-6">
              <TicketSearchFilter
                filters={filters}
                onFiltersChange={setFilters}
                showAssignedToFilter={!showOnlyAssigned}
              />

              <div className="mt-6">
                <BatchActionToolbar
                  selectedCount={selectedInvoices.size}
                  totalCount={totalInvoiceCount}
                  showBatchColorMenu={showBatchColorMenu}
                  colorOptions={colorOptions}
                  processingBatch={processingBatch}
                  onToggleSelectAll={toggleSelectAll}
                  onToggleBatchColorMenu={() => setShowBatchColorMenu(!showBatchColorMenu)}
                  onBatchColorChange={handleBatchColorChange}
                  onBatchAddNote={() => setShowBatchNoteModal(true)}
                />
              </div>

              <div className="mt-6 space-y-4">
                {filteredIndividualAssignments.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">
                      {individualAssignments.length === 0
                        ? showOnlyAssigned
                          ? 'No individual invoices assigned to you'
                          : 'No individual invoices found'
                        : 'No invoices match your search'
                      }
                    </p>
                  </div>
                ) : (
                  filteredIndividualAssignments.map(invoice => (
                    <IndividualInvoiceCard
                      key={invoice.invoice_reference_number}
                      invoice={invoice}
                      isSelected={selectedInvoices.has(invoice.invoice_reference_number)}
                      showColorPicker={changingColorForInvoice === invoice.invoice_reference_number}
                      colorOptions={colorOptions}
                      onToggleSelection={() => toggleInvoiceSelection(invoice.invoice_reference_number)}
                      onColorChange={(color) => handleColorChange(invoice.invoice_reference_number, color)}
                      onToggleColorPicker={() => setChangingColorForInvoice(
                        changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number
                      )}
                      onOpenMemo={() => handleOpenMemo(invoice)}
                      onOpenReminder={() => handleOpenInvoiceReminder(invoice)}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {memoModalInvoice && (
        <InvoiceMemoModal
          invoice={memoModalInvoice}
          onClose={() => setMemoModalInvoice(null)}
          onUpdate={() => {
            setMemoModalInvoice(null);
            loadTickets();
          }}
        />
      )}

      {showBatchNoteModal && (
        <BatchNoteModal
          selectedCount={selectedInvoices.size}
          batchNote={batchNote}
          createReminder={createReminder}
          reminderDate={reminderDate}
          processingBatch={processingBatch}
          onBatchNoteChange={setBatchNote}
          onCreateReminderChange={setCreateReminder}
          onReminderDateChange={setReminderDate}
          onConfirm={handleBatchAddNote}
          onCancel={() => {
            setShowBatchNoteModal(false);
            setBatchNote('');
            setCreateReminder(false);
            setReminderDate('');
          }}
        />
      )}

      {promiseDateModalInvoice && (
        <PromiseDateModal
          invoiceNumber={promiseDateModalInvoice}
          onConfirm={handlePromiseDateConfirm}
          onCancel={() => setPromiseDateModalInvoice(null)}
        />
      )}

      {reminderModal && (
        <CreateReminderModal
          type={reminderModal.type}
          ticketId={reminderModal.ticketId}
          ticketNumber={reminderModal.ticketNumber}
          invoiceReference={reminderModal.invoiceReference}
          customerName={reminderModal.customerName}
          onClose={() => setReminderModal(null)}
          onSuccess={loadTickets}
        />
      )}

      {statusChangeModal && (
        <TicketStatusChangeModal
          ticketId={statusChangeModal.ticketId}
          ticketNumber={statusChangeModal.ticketNumber}
          currentStatus={statusChangeModal.currentStatus}
          newStatus={statusChangeModal.newStatus}
          currentStatusDisplay={statusChangeModal.currentStatusDisplay}
          newStatusDisplay={statusChangeModal.newStatusDisplay}
          onConfirm={confirmTicketStatusChange}
          onCancel={() => setStatusChangeModal(null)}
        />
      )}
    </div>
  );
}
