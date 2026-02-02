import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, X, Ticket, User, AlertCircle, ExternalLink, Clock, MessageSquare, ChevronDown, ChevronUp, FileText, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAcumaticaCustomerUrl, getAcumaticaInvoiceUrl } from '../lib/acumaticaLinks';
import { formatDistanceToNow } from 'date-fns';
import TicketNoteModal from './TicketNoteModal';

interface Customer {
  customer_id: string;
  customer_name: string;
}

interface Invoice {
  reference_number: string;
  customer: string;
  customer_name: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  status: string;
  description: string;
}

interface Collector {
  id: string;
  email: string;
  role: string;
  full_name?: string;
}

interface Ticket {
  id: string;
  ticket_number: string;
  customer_id: string;
  customer_name: string;
  assigned_collector_id: string;
  status: string;
  priority: string;
  notes: string;
  ticket_type: string;
  created_at: string;
  updated_at: string;
  assigned_at?: string;
  assigned_by?: string;
  invoice_count?: number;
  collector_email?: string;
  collector_name?: string;
  assigner_email?: string;
  last_status_change?: {
    status: string;
    changed_at: string;
    changed_by_name: string;
  };
  last_activity?: {
    description: string;
    created_at: string;
    created_by_name: string;
  };
}

interface StatusHistory {
  id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  changed_at: string;
  notes: string | null;
  changer_name?: string;
  changer_email?: string;
}

interface ActivityLog {
  id: string;
  activity_type: string;
  description: string;
  created_by: string;
  created_at: string;
  metadata: any;
  creator_name?: string;
  creator_email?: string;
}

interface TicketInvoice {
  invoice_reference_number: string;
  added_at: string;
  invoice?: Invoice;
}

interface MergeEvent {
  merge_id: string;
  merged_at: string;
  merged_by_name: string;
  merged_by_email: string;
  invoice_count: number;
  invoice_reference_numbers: string[];
  notes: string;
}

export default function CollectionTicketing({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const handleBack = onBack || (() => navigate(-1));
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('list');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [selectedCollector, setSelectedCollector] = useState<string>('');
  const [priority, setPriority] = useState<string>('medium');
  const [ticketType, setTicketType] = useState<string>('overdue payment');
  const [notes, setNotes] = useState<string>('');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'latest' | 'oldest' | 'highest'>('all');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string>('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketDetails, setTicketDetails] = useState<{
    statusHistory: StatusHistory[];
    activityLog: ActivityLog[];
    invoices: TicketInvoice[];
    mergeHistory: MergeEvent[];
  } | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');
  const [newNote, setNewNote] = useState<string>('');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [changingColorForInvoice, setChangingColorForInvoice] = useState<string | null>(null);
  const [existingTicket, setExistingTicket] = useState<Ticket | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [expandedMergeEvents, setExpandedMergeEvents] = useState<Set<string>>(new Set());

  const [selectedInvoicesInTicket, setSelectedInvoicesInTicket] = useState<string[]>([]);
  const [showBatchOperations, setShowBatchOperations] = useState(false);
  const [batchColorStatus, setBatchColorStatus] = useState<string>('');
  const [batchNote, setBatchNote] = useState<string>('');
  const [showTicketNoteModal, setShowTicketNoteModal] = useState(false);
  const [showReminderPrompt, setShowReminderPrompt] = useState(false);
  const [reminderDate, setReminderDate] = useState<string>('');
  const [reminderTime, setReminderTime] = useState<string>('09:00');
  const [pendingBatchNote, setPendingBatchNote] = useState<string>('');

  useEffect(() => {
    loadCustomers();
    loadCollectors();
    loadTickets();

    // Subscribe to ticket_invoices changes to detect when invoices are removed
    const subscription = supabase
      .channel('ticket_invoices_changes')
      .on('postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'ticket_invoices'
        },
        (payload) => {
          // Reload tickets and refresh details if viewing affected ticket
          loadTickets();
          if (selectedTicket && payload.old.ticket_id === selectedTicket.id) {
            loadTicketDetails(selectedTicket);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedTicket]);

  // Handle opening a ticket from URL query parameter
  useEffect(() => {
    const ticketId = searchParams.get('ticketId');
    if (ticketId && tickets.length > 0) {
      const ticket = tickets.find(t => t.id === ticketId);
      if (ticket) {
        loadTicketDetails(ticket);
        setActiveTab('list');
        // Clear the query parameter after opening
        setSearchParams({});
      }
    }
  }, [tickets, searchParams]);

  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerInvoices();
    }
  }, [selectedCustomer, invoiceFilter]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const colorPickers = document.querySelectorAll('.color-picker-container');
      let clickedInside = false;

      colorPickers.forEach((picker) => {
        if (picker.contains(event.target as Node)) {
          clickedInside = true;
        }
      });

      if (!clickedInside) {
        setChangingColorForInvoice(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadCustomers = async () => {
    try {
      let allCustomers: Customer[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name')
          .order('customer_name')
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('Error loading customers:', error);
          setError('Failed to load customers');
          break;
        }

        if (data && data.length > 0) {
          allCustomers = [...allCustomers, ...data];
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setCustomers(allCustomers);
    } catch (err) {
      console.error('Exception loading customers:', err);
    }
  };

  const loadCollectors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role, full_name')
        .in('role', ['collector', 'admin', 'manager'])
        .order('email');

      if (error) {
        console.error('Error loading collectors:', error);
        setError('Failed to load collectors');
      } else {
        setCollectors(data || []);
      }
    } catch (err) {
      console.error('Exception loading collectors:', err);
    }
  };

  const loadTickets = async () => {
    try {
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('collection_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketsError) {
        console.error('Error loading tickets:', ticketsError);
        setError('Failed to load tickets: ' + ticketsError.message);
        return;
      }

      if (!ticketsData || ticketsData.length === 0) {
        setTickets([]);
        return;
      }

      const enrichedTickets = await Promise.all(
        ticketsData.map(async (ticket) => {
          const { count } = await supabase
            .from('ticket_invoices')
            .select('*', { count: 'exact', head: true })
            .eq('ticket_id', ticket.id);

          const { data: collectorData } = await supabase
            .from('user_profiles')
            .select('email, full_name')
            .eq('id', ticket.assigned_collector_id)
            .maybeSingle();

          let assignerEmail = null;
          if (ticket.assigned_by) {
            const { data: assignerData } = await supabase
              .from('user_profiles')
              .select('email')
              .eq('id', ticket.assigned_by)
              .maybeSingle();
            assignerEmail = assignerData?.email;
          }

          // Fetch last status change
          const { data: lastStatus } = await supabase
            .from('ticket_status_history')
            .select('new_status, changed_at, changed_by, user_profiles!ticket_status_history_changed_by_fkey(full_name)')
            .eq('ticket_id', ticket.id)
            .order('changed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let last_status_change = undefined;
          if (lastStatus) {
            last_status_change = {
              status: lastStatus.new_status,
              changed_at: lastStatus.changed_at,
              changed_by_name: (lastStatus as any).user_profiles?.full_name || 'Unknown'
            };
          }

          // Fetch last activity
          const { data: lastActivity } = await supabase
            .from('ticket_activity_log')
            .select('description, created_at, created_by, user_profiles!ticket_activity_log_created_by_fkey(full_name)')
            .eq('ticket_id', ticket.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let last_activity = undefined;
          if (lastActivity) {
            last_activity = {
              description: lastActivity.description,
              created_at: lastActivity.created_at,
              created_by_name: (lastActivity as any).user_profiles?.full_name || 'Unknown'
            };
          }

          return {
            ...ticket,
            invoice_count: count || 0,
            collector_email: collectorData?.email || 'Unassigned',
            collector_name: collectorData?.full_name || collectorData?.email || 'Unassigned',
            assigner_email: assignerEmail,
            last_status_change,
            last_activity
          };
        })
      );

      setTickets(enrichedTickets);
    } catch (err) {
      console.error('Exception loading tickets:', err);
      setError('Exception: ' + (err as Error).message);
    }
  };

  const loadCustomerInvoices = async () => {
    if (!selectedCustomer) return;

    let query = supabase
      .from('acumatica_invoices')
      .select('*')
      .eq('customer', selectedCustomer)
      .gt('balance', 0)
      .eq('status', 'Open');

    if (invoiceFilter === 'latest') {
      query = query.order('date', { ascending: false }).limit(10);
    } else if (invoiceFilter === 'oldest') {
      query = query.order('due_date', { ascending: true }).limit(10);
    } else if (invoiceFilter === 'highest') {
      query = query.order('balance', { ascending: false }).limit(10);
    } else {
      query = query.order('due_date', { ascending: true });
    }

    const { data } = await query;
    if (data) setCustomerInvoices(data);
  };

  const loadTicketDetails = async (ticket: Ticket) => {
    setDetailsLoading(true);
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);

    try {
      const [statusHistoryRes, activityLogRes, invoicesRes, mergeHistoryRes] = await Promise.all([
        supabase
          .from('ticket_status_history')
          .select('*, user_profiles!ticket_status_history_changed_by_fkey(email, full_name)')
          .eq('ticket_id', ticket.id)
          .order('changed_at', { ascending: false }),

        supabase
          .from('ticket_activity_log')
          .select('*, user_profiles!ticket_activity_log_created_by_fkey(email, full_name)')
          .eq('ticket_id', ticket.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('ticket_invoices')
          .select('invoice_reference_number, added_at')
          .eq('ticket_id', ticket.id),

        supabase.rpc('get_ticket_merge_history', { p_ticket_id: ticket.id })
      ]);

      const statusHistory = (statusHistoryRes.data || []).map((sh: any) => ({
        ...sh,
        changer_name: sh.user_profiles?.full_name || sh.user_profiles?.email,
        changer_email: sh.user_profiles?.email
      }));

      const activityLog = (activityLogRes.data || []).map((al: any) => ({
        ...al,
        creator_name: al.user_profiles?.full_name || al.user_profiles?.email,
        creator_email: al.user_profiles?.email
      }));

      const invoiceRefs = (invoicesRes.data || []).map((ti: any) => ti.invoice_reference_number);
      let invoices: TicketInvoice[] = [];

      if (invoiceRefs.length > 0) {
        const { data: invoiceData } = await supabase
          .from('acumatica_invoices')
          .select('*')
          .in('reference_number', invoiceRefs);

        invoices = (invoicesRes.data || []).map((ti: any) => ({
          ...ti,
          invoice: (invoiceData || []).find((inv: any) => inv.reference_number === ti.invoice_reference_number)
        }));
      }

      setTicketDetails({
        statusHistory,
        activityLog,
        invoices,
        mergeHistory: mergeHistoryRes.data || []
      });
    } catch (error) {
      console.error('Error loading ticket details:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!selectedCustomer || !selectedCollector || selectedInvoices.length === 0) {
      alert('Please select a customer, collector, and at least one invoice');
      return;
    }

    setLoading(true);
    try {
      if (!profile) throw new Error('Not authenticated');

      // Check if there's an existing open ticket for this customer and collector
      const { data: existingTickets, error: checkError } = await supabase
        .from('collection_tickets')
        .select('*')
        .eq('customer_id', selectedCustomer)
        .eq('assigned_collector_id', selectedCollector)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (checkError) throw checkError;

      if (existingTickets && existingTickets.length > 0) {
        // Found an existing ticket, show merge modal
        setExistingTicket(existingTickets[0]);
        setShowMergeModal(true);
        setLoading(false);
        return;
      }

      // No existing ticket, proceed with creation
      const customer = customers.find(c => c.customer_id === selectedCustomer);

      const { data: ticket, error: ticketError } = await supabase
        .from('collection_tickets')
        .insert({
          customer_id: selectedCustomer,
          customer_name: customer?.customer_name || '',
          assigned_collector_id: selectedCollector,
          status: 'open',
          priority,
          ticket_type: ticketType,
          notes,
          created_by: profile.id,
          assigned_at: new Date().toISOString(),
          assigned_by: profile.id
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      const ticketInvoices = selectedInvoices.map(invoiceRef => ({
        ticket_id: ticket.id,
        invoice_reference_number: invoiceRef,
        added_by: profile.id
      }));

      const { error: invoicesError } = await supabase
        .from('ticket_invoices')
        .insert(ticketInvoices);

      if (invoicesError) throw invoicesError;

      const assignments = selectedInvoices.map(invoiceRef => ({
        invoice_reference_number: invoiceRef,
        assigned_collector_id: selectedCollector,
        ticket_id: ticket.id,
        assigned_by: profile?.id
      }));

      const { error: assignmentsError } = await supabase
        .from('invoice_assignments')
        .upsert(assignments, { onConflict: 'invoice_reference_number' });

      if (assignmentsError) throw assignmentsError;

      alert('Ticket created successfully!');
      setSelectedCustomer('');
      setCustomerInvoices([]);
      setSelectedInvoices([]);
      setSelectedCollector('');
      setPriority('medium');
      setTicketType('overdue payment');
      setNotes('');
      setActiveTab('list');
      loadTickets();
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      alert('Failed to create ticket: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMergeWithExisting = async () => {
    if (!existingTicket || !profile) return;

    setLoading(true);
    try {
      // Add new invoices to the existing ticket
      const ticketInvoices = selectedInvoices.map(invoiceRef => ({
        ticket_id: existingTicket.id,
        invoice_reference_number: invoiceRef,
        added_by: profile.id
      }));

      const { error: invoicesError } = await supabase
        .from('ticket_invoices')
        .insert(ticketInvoices);

      if (invoicesError) throw invoicesError;

      // Update invoice assignments
      const assignments = selectedInvoices.map(invoiceRef => ({
        invoice_reference_number: invoiceRef,
        assigned_collector_id: selectedCollector,
        ticket_id: existingTicket.id,
        assigned_by: profile.id
      }));

      const { error: assignmentsError } = await supabase
        .from('invoice_assignments')
        .upsert(assignments, { onConflict: 'invoice_reference_number' });

      if (assignmentsError) throw assignmentsError;

      // Record the merge event
      const { error: mergeError } = await supabase
        .from('ticket_merge_events')
        .insert({
          target_ticket_id: existingTicket.id,
          merged_by: profile.id,
          invoice_count: selectedInvoices.length,
          invoice_reference_numbers: selectedInvoices,
          notes: `Merged ${selectedInvoices.length} invoice(s) from ticket creation`
        });

      if (mergeError) throw mergeError;

      alert(`Successfully merged ${selectedInvoices.length} invoice(s) into existing ticket ${existingTicket.ticket_number}!`);

      // Reset form
      setSelectedCustomer('');
      setCustomerInvoices([]);
      setSelectedInvoices([]);
      setSelectedCollector('');
      setPriority('medium');
      setTicketType('overdue payment');
      setNotes('');
      setShowMergeModal(false);
      setExistingTicket(null);
      setActiveTab('list');
      loadTickets();
    } catch (error: any) {
      console.error('Error merging with existing ticket:', error);
      alert('Failed to merge tickets: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewTicket = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const customer = customers.find(c => c.customer_id === selectedCustomer);

      const { data: ticket, error: ticketError } = await supabase
        .from('collection_tickets')
        .insert({
          customer_id: selectedCustomer,
          customer_name: customer?.customer_name || '',
          assigned_collector_id: selectedCollector,
          status: 'open',
          priority,
          ticket_type: ticketType,
          notes,
          created_by: profile.id,
          assigned_at: new Date().toISOString(),
          assigned_by: profile.id
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      const ticketInvoices = selectedInvoices.map(invoiceRef => ({
        ticket_id: ticket.id,
        invoice_reference_number: invoiceRef,
        added_by: profile.id
      }));

      const { error: invoicesError } = await supabase
        .from('ticket_invoices')
        .insert(ticketInvoices);

      if (invoicesError) throw invoicesError;

      const assignments = selectedInvoices.map(invoiceRef => ({
        invoice_reference_number: invoiceRef,
        assigned_collector_id: selectedCollector,
        ticket_id: ticket.id,
        assigned_by: profile.id
      }));

      const { error: assignmentsError } = await supabase
        .from('invoice_assignments')
        .upsert(assignments, { onConflict: 'invoice_reference_number' });

      if (assignmentsError) throw assignmentsError;

      alert('New ticket created successfully!');

      // Reset form
      setSelectedCustomer('');
      setCustomerInvoices([]);
      setSelectedInvoices([]);
      setSelectedCollector('');
      setPriority('medium');
      setTicketType('overdue payment');
      setNotes('');
      setShowMergeModal(false);
      setExistingTicket(null);
      setActiveTab('list');
      loadTickets();
    } catch (error: any) {
      console.error('Error creating new ticket:', error);
      alert('Failed to create ticket: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedTicket || !newStatus) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('collection_tickets')
        .update({ status: newStatus })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      if (statusNote) {
        await supabase
          .from('ticket_activity_log')
          .insert({
            ticket_id: selectedTicket.id,
            activity_type: 'note',
            description: statusNote,
            created_by: profile?.id
          });
      }

      alert('Status updated successfully!');
      setStatusNote('');
      loadTickets();
      loadTicketDetails({ ...selectedTicket, status: newStatus });
    } catch (error: any) {
      console.error('Error updating status:', error);
      alert('Failed to update status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedTicket || !newNote.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket.id,
          activity_type: 'note',
          description: newNote,
          created_by: profile?.id
        });

      if (error) throw error;

      alert('Note added successfully!');
      setNewNote('');
      await loadTicketDetails(selectedTicket);
      await loadTickets();
    } catch (error: any) {
      console.error('Error adding note:', error);
      alert('Failed to add note: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleColorChange = async (invoiceRefNumber: string, newColor: string | null) => {
    if (!profile?.id) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc('update_invoice_color_status_by_ref', {
        p_reference_number: invoiceRefNumber,
        p_color_status: newColor,
        p_user_id: profile.id
      });

      if (error) throw error;

      await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket?.id,
          activity_type: 'note',
          description: `Invoice ${invoiceRefNumber} color changed to ${newColor || 'none'}`,
          created_by: profile.id,
          metadata: { invoice_ref: invoiceRefNumber, new_color: newColor }
        });

      setChangingColorForInvoice(null);

      if (selectedTicket) {
        await loadTicketDetails(selectedTicket);
      }
      await loadTickets();
    } catch (error: any) {
      console.error('Error changing color:', error);
      alert('Failed to change color: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const navigateToCustomer = (customerId: string) => {
    navigate(`/customers?customer=${customerId}`);
  };

  const toggleInvoiceSelection = (invoiceRef: string) => {
    setSelectedInvoices(prev =>
      prev.includes(invoiceRef)
        ? prev.filter(ref => ref !== invoiceRef)
        : [...prev, invoiceRef]
    );
  };

  const toggleInvoiceInTicketSelection = (invoiceRef: string) => {
    setSelectedInvoicesInTicket(prev =>
      prev.includes(invoiceRef)
        ? prev.filter(ref => ref !== invoiceRef)
        : [...prev, invoiceRef]
    );
  };

  const selectAllInvoicesInTicket = () => {
    if (!ticketDetails) return;
    const allRefs = ticketDetails.invoices.map(ti => ti.invoice_reference_number);
    setSelectedInvoicesInTicket(allRefs);
  };

  const deselectAllInvoicesInTicket = () => {
    setSelectedInvoicesInTicket([]);
  };

  const handleBatchColorChange = async () => {
    if (selectedInvoicesInTicket.length === 0 || !batchColorStatus || !profile?.id) {
      alert('Please select invoices and a color status');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('batch_update_invoice_color_status_by_refs', {
        p_reference_numbers: selectedInvoicesInTicket,
        p_color_status: batchColorStatus === 'none' ? null : batchColorStatus,
        p_user_id: profile.id
      });

      if (error) throw error;

      await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket?.id,
          activity_type: 'note',
          description: `Batch color changed for ${selectedInvoicesInTicket.length} invoice(s) to ${batchColorStatus}`,
          created_by: profile.id,
          metadata: { invoice_refs: selectedInvoicesInTicket, new_color: batchColorStatus }
        });

      alert(`Successfully updated color for ${selectedInvoicesInTicket.length} invoice(s)`);
      setSelectedInvoicesInTicket([]);
      setBatchColorStatus('');
      setShowBatchOperations(false);

      if (selectedTicket) {
        await loadTicketDetails(selectedTicket);
      }
      await loadTickets();
    } catch (error: any) {
      console.error('Error changing batch color:', error);
      alert('Failed to change color: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchNotePrompt = () => {
    if (selectedInvoicesInTicket.length === 0 || !batchNote.trim()) {
      alert('Please select invoices and enter a note');
      return;
    }

    setPendingBatchNote(batchNote);
    setShowReminderPrompt(true);
  };

  const handleBatchNoteWithoutReminder = async () => {
    if (selectedInvoicesInTicket.length === 0 || !pendingBatchNote.trim() || !profile?.id) return;

    setLoading(true);
    try {
      // Get invoice IDs for the selected invoices
      const { data: invoices } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number')
        .in('reference_number', selectedInvoicesInTicket);

      if (!invoices || invoices.length === 0) {
        throw new Error('Could not find invoices');
      }

      const memoInserts = invoices.map(invoice => ({
        invoice_id: invoice.id,
        invoice_reference: invoice.reference_number,
        memo_text: pendingBatchNote,
        created_by_user_id: profile.id
      }));

      const { error } = await supabase
        .from('invoice_memos')
        .insert(memoInserts);

      if (error) throw error;

      await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket?.id,
          activity_type: 'note',
          description: `Batch note added to ${selectedInvoicesInTicket.length} invoice(s): "${pendingBatchNote}"`,
          created_by: profile.id,
          metadata: { invoice_refs: selectedInvoicesInTicket, note: pendingBatchNote }
        });

      alert(`Successfully added note to ${selectedInvoicesInTicket.length} invoice(s)`);
      setSelectedInvoicesInTicket([]);
      setBatchNote('');
      setPendingBatchNote('');
      setShowBatchOperations(false);
      setShowReminderPrompt(false);

      if (selectedTicket) {
        await loadTicketDetails(selectedTicket);
      }
      await loadTickets();
    } catch (error: any) {
      console.error('Error adding batch note:', error);
      alert('Failed to add note: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchNoteWithReminder = async () => {
    if (!reminderDate || !reminderTime || !profile?.id) {
      alert('Please select a reminder date and time');
      return;
    }

    setLoading(true);
    try {
      const reminderDateTime = new Date(`${reminderDate}T${reminderTime}`);

      // Get invoice IDs for the selected invoices
      const { data: invoices } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number')
        .in('reference_number', selectedInvoicesInTicket);

      if (!invoices || invoices.length === 0) {
        throw new Error('Could not find invoices');
      }

      const memoInserts = invoices.map(invoice => ({
        invoice_id: invoice.id,
        invoice_reference: invoice.reference_number,
        memo_text: pendingBatchNote,
        created_by_user_id: profile.id
      }));

      const { error: memoError } = await supabase
        .from('invoice_memos')
        .insert(memoInserts);

      if (memoError) throw memoError;

      // Create reminders for each invoice
      for (const invoice of invoices) {
        await supabase
          .from('invoice_reminders')
          .insert({
            invoice_id: invoice.id,
            invoice_reference_number: invoice.reference_number,
            ticket_id: selectedTicket?.id,
            user_id: profile.id,
            reminder_date: reminderDateTime.toISOString(),
            title: `Follow up on invoice ${invoice.reference_number}`,
            description: pendingBatchNote,
            reminder_message: pendingBatchNote,
            status: 'pending'
          });
      }

      await supabase
        .from('ticket_activity_log')
        .insert({
          ticket_id: selectedTicket?.id,
          activity_type: 'note',
          description: `Batch note added to ${selectedInvoicesInTicket.length} invoice(s) with reminder for ${reminderDateTime.toLocaleString()}: "${pendingBatchNote}"`,
          created_by: profile.id,
          metadata: {
            invoice_refs: selectedInvoicesInTicket,
            note: pendingBatchNote,
            reminder_date: reminderDateTime.toISOString()
          }
        });

      alert(`Successfully added note and ${selectedInvoicesInTicket.length} reminder(s) for ${reminderDateTime.toLocaleString()}`);
      setSelectedInvoicesInTicket([]);
      setBatchNote('');
      setPendingBatchNote('');
      setReminderDate('');
      setReminderTime('09:00');
      setShowBatchOperations(false);
      setShowReminderPrompt(false);

      if (selectedTicket) {
        await loadTicketDetails(selectedTicket);
      }
      await loadTickets();
    } catch (error: any) {
      console.error('Error adding batch note with reminder:', error);
      alert('Failed to add note with reminder: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllInvoices = () => {
    if (selectedInvoices.length === customerInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(customerInvoices.map(inv => inv.reference_number));
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.customer_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'promised': return 'bg-cyan-100 text-cyan-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'disputed': return 'bg-red-100 text-red-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTicketTypeColor = (type: string) => {
    switch (type) {
      case 'overdue payment': return 'bg-red-50 text-red-700 border-red-200';
      case 'partial payment': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'chargeback': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'settlement': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Merge Confirmation Modal */}
      {showMergeModal && existingTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Existing Ticket Found</h2>
                <button
                  onClick={() => {
                    setShowMergeModal(false);
                    setExistingTicket(null);
                    setLoading(false);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-yellow-900 mb-1">
                      An open ticket already exists for this customer and collector
                    </p>
                    <p className="text-sm text-yellow-700">
                      Would you like to merge these {selectedInvoices.length} invoice(s) into the existing ticket, or create a separate new ticket?
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Existing Ticket Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-blue-600">
                      {existingTicket.ticket_number}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      existingTicket.status === 'open' ? 'bg-green-100 text-green-800' :
                      existingTicket.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {existingTicket.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      existingTicket.priority === 'high' ? 'bg-red-100 text-red-800' :
                      existingTicket.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {existingTicket.priority.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-gray-700">
                    <strong>Customer:</strong> {existingTicket.customer_name}
                  </div>
                  <div className="text-gray-700">
                    <strong>Collector:</strong> {existingTicket.collector_name || existingTicket.collector_email}
                  </div>
                  <div className="text-gray-700">
                    <strong>Created:</strong> {new Date(existingTicket.created_at).toLocaleString()}
                  </div>
                  <div className="text-gray-700">
                    <strong>Current Invoices:</strong> {existingTicket.invoice_count || 0}
                  </div>
                  {existingTicket.notes && (
                    <div className="text-gray-700">
                      <strong>Notes:</strong> {existingTicket.notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Invoices to Add ({selectedInvoices.length})</h3>
                <div className="space-y-1 text-sm text-gray-700 max-h-40 overflow-y-auto">
                  {selectedInvoices.map(inv => {
                    const invoice = customerInvoices.find(ci => ci.reference_number === inv);
                    return (
                      <div key={inv} className="flex items-center justify-between py-1 border-b border-blue-100 last:border-0">
                        <span className="font-mono">{inv}</span>
                        {invoice && (
                          <span className="text-gray-600">
                            ${invoice.balance?.toLocaleString() || '0.00'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleMergeWithExisting}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {loading ? 'Merging...' : 'Merge into Existing Ticket'}
                </button>
                <button
                  onClick={handleCreateNewTicket}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {loading ? 'Creating...' : 'Create New Ticket'}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setExistingTicket(null);
                  setLoading(false);
                }}
                className="w-full mt-3 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Prompt Modal */}
      {showReminderPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Create Reminder?</h2>
                <button
                  onClick={() => {
                    setShowReminderPrompt(false);
                    setPendingBatchNote('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  Would you like to set a reminder for these {selectedInvoicesInTicket.length} invoice(s)?
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  You'll receive an email notification with links to the invoices and ticket.
                </p>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700"><strong>Note:</strong> {pendingBatchNote}</p>
              </div>

              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Date</label>
                  <input
                    type="date"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Time</label>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleBatchNoteWithReminder}
                  disabled={!reminderDate || !reminderTime || loading}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
                >
                  {loading ? 'Creating...' : 'Add Note with Reminder'}
                </button>
                <button
                  onClick={handleBatchNoteWithoutReminder}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 font-semibold"
                >
                  {loading ? 'Adding...' : 'Add Note Only (No Reminder)'}
                </button>
                <button
                  onClick={() => {
                    setShowReminderPrompt(false);
                    setPendingBatchNote('');
                  }}
                  className="w-full px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Collection Ticketing System</h1>
              <p className="text-sm text-gray-500">Manage collection tickets and assignments</p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create Ticket
          </button>
        </div>

        {selectedTicket && ticketDetails ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>Created {new Date(selectedTicket.created_at).toLocaleDateString()} at {new Date(selectedTicket.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="font-mono font-bold text-xl text-gray-900">
                      {selectedTicket.ticket_number}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTicketTypeColor(selectedTicket.ticket_type)}`}>
                      {selectedTicket.ticket_type}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(selectedTicket.priority)}`}>
                      {selectedTicket.priority}
                    </span>
                  </div>
                  <button
                    onClick={() => navigateToCustomer(selectedTicket.customer_id)}
                    className="text-2xl font-bold text-blue-600 hover:text-blue-800 hover:underline mb-2"
                  >
                    {selectedTicket.customer_name}
                  </button>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    <span>Customer ID: {selectedTicket.customer_id}</span>
                    <a
                      href={getAcumaticaCustomerUrl(selectedTicket.customer_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View in Acumatica
                    </a>
                  </div>

                  {/* Last Status Change and Activity */}
                  {(selectedTicket.last_status_change || selectedTicket.last_activity) && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {selectedTicket.last_status_change && (
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-gray-700">Last Status Change</p>
                              <p className="text-gray-600">{selectedTicket.last_status_change.status}</p>
                              <p className="text-gray-500 text-xs">
                                {formatDistanceToNow(new Date(selectedTicket.last_status_change.changed_at), { addSuffix: true })}
                              </p>
                              <p className="text-gray-500 text-xs">by {selectedTicket.last_status_change.changed_by_name}</p>
                            </div>
                          </div>
                        )}
                        {selectedTicket.last_activity && (
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-gray-700">Last Activity</p>
                              <p className="text-gray-600">{selectedTicket.last_activity.description}</p>
                              <p className="text-gray-500 text-xs">
                                {formatDistanceToNow(new Date(selectedTicket.last_activity.created_at), { addSuffix: true })}
                              </p>
                              <p className="text-gray-500 text-xs">by {selectedTicket.last_activity.created_by_name}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedTicket(null);
                    setTicketDetails(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Assigned to</p>
                  <p className="font-medium">{selectedTicket.collector_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium">{new Date(selectedTicket.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Invoices</p>
                  <p className="font-medium">{ticketDetails.invoices.length}</p>
                </div>
                <div>
                  <p className="text-gray-500">Last updated</p>
                  <p className="font-medium">{new Date(selectedTicket.updated_at).toLocaleString()}</p>
                </div>
              </div>

              {selectedTicket.notes && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">{selectedTicket.notes}</p>
                </div>
              )}
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Status</h3>
                <div className="flex gap-3">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="promised">Promised</option>
                    <option value="paid">Paid</option>
                    <option value="disputed">Disputed</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button
                    onClick={handleStatusChange}
                    disabled={loading || newStatus === selectedTicket.status}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Update Status
                  </button>
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Add a note about this status change (optional - you can leave this blank)"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 italic"
                  />
                  <p className="text-xs text-gray-500 mt-1">Note: You can update the status without adding a note</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Ticket Notes</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Add notes with text, voice recordings, images, or documents
                </p>
                <button
                  onClick={() => setShowTicketNoteModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm font-medium"
                >
                  <MessageSquare className="w-5 h-5" />
                  Open Ticket Notes
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Invoices ({ticketDetails.invoices.length})
                    {selectedInvoicesInTicket.length > 0 && (
                      <span className="text-sm font-normal text-blue-600">
                        ({selectedInvoicesInTicket.length} selected)
                      </span>
                    )}
                  </h3>
                  <div className="flex gap-2">
                    {selectedInvoicesInTicket.length > 0 && (
                      <button
                        onClick={() => setShowBatchOperations(!showBatchOperations)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        Batch Actions
                      </button>
                    )}
                    {selectedInvoicesInTicket.length === ticketDetails.invoices.length ? (
                      <button
                        onClick={deselectAllInvoicesInTicket}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                      >
                        Deselect All
                      </button>
                    ) : (
                      <button
                        onClick={selectAllInvoicesInTicket}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                      >
                        Select All
                      </button>
                    )}
                  </div>
                </div>

                {showBatchOperations && selectedInvoicesInTicket.length > 0 && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-3">Batch Operations ({selectedInvoicesInTicket.length} invoices)</h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Change Color Status</label>
                        <div className="flex gap-2">
                          <select
                            value={batchColorStatus}
                            onChange={(e) => setBatchColorStatus(e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">Select color...</option>
                            <option value="red">Red - Will Not Pay</option>
                            <option value="orange">Orange - Will Pay Later</option>
                            <option value="yellow">Yellow - Working On It</option>
                            <option value="green">Green - Resolved</option>
                            <option value="none">Clear Color</option>
                          </select>
                          <button
                            onClick={handleBatchColorChange}
                            disabled={!batchColorStatus || loading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Add Note to Selected Invoices</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={batchNote}
                            onChange={(e) => setBatchNote(e.target.value)}
                            placeholder="e.g., Customer will pay next week..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <button
                            onClick={handleBatchNotePrompt}
                            disabled={!batchNote.trim() || loading}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            Add Note
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {ticketDetails.invoices.map((ti) => (
                    <div key={ti.invoice_reference_number} className={`p-4 rounded-lg border ${
                      selectedInvoicesInTicket.includes(ti.invoice_reference_number)
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedInvoicesInTicket.includes(ti.invoice_reference_number)}
                            onChange={() => toggleInvoiceInTicketSelection(ti.invoice_reference_number)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-gray-900">Invoice #{ti.invoice_reference_number}</p>
                              <a
                                href={getAcumaticaInvoiceUrl(ti.invoice_reference_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                                title="View in Acumatica"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                            {ti.invoice && (
                              <>
                                <p className="text-sm text-gray-600">
                                  Balance: ${ti.invoice.balance.toFixed(2)} of ${ti.invoice.amount.toFixed(2)}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Due: {new Date(ti.invoice.due_date).toLocaleDateString()}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        {ti.invoice && (
                          <div className="relative color-picker-container">
                            <button
                              onClick={() => setChangingColorForInvoice(changingColorForInvoice === ti.invoice_reference_number ? null : ti.invoice_reference_number)}
                              className="focus:outline-none"
                            >
                              {ti.invoice.color_status ? (
                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full uppercase cursor-pointer hover:opacity-80 transition-opacity ${
                                  ti.invoice.color_status === 'red' ? 'bg-red-500 text-white border-2 border-red-700' :
                                  ti.invoice.color_status === 'yellow' ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600' :
                                  ti.invoice.color_status === 'orange' ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600' :
                                  ti.invoice.color_status === 'green' ? 'bg-green-500 text-white border-2 border-green-700' :
                                  'bg-gray-200 text-gray-700'
                                }`}>
                                  {ti.invoice.color_status}
                                </span>
                              ) : (
                                <span className="px-3 py-1 text-xs text-gray-400 cursor-pointer hover:text-gray-600 border border-gray-300 rounded-full">Set Status</span>
                              )}
                            </button>

                            {changingColorForInvoice === ti.invoice_reference_number && (
                              <div className="absolute z-50 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 min-w-[140px]">
                                <button
                                  onClick={() => handleColorChange(ti.invoice_reference_number, 'red')}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 rounded flex items-center gap-2"
                                >
                                  <span className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-700"></span>
                                  Will Not Pay
                                </button>
                                <button
                                  onClick={() => handleColorChange(ti.invoice_reference_number, 'yellow')}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-yellow-50 rounded flex items-center gap-2"
                                >
                                  <span className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-yellow-600"></span>
                                  Will Take Care
                                </button>
                                <button
                                  onClick={() => handleColorChange(ti.invoice_reference_number, 'green')}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 rounded flex items-center gap-2"
                                >
                                  <span className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700"></span>
                                  Will Pay
                                </button>
                                {ti.invoice.color_status && (
                                  <>
                                    <div className="border-t border-gray-200 my-1"></div>
                                    <button
                                      onClick={() => handleColorChange(ti.invoice_reference_number, null)}
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded text-gray-600"
                                    >
                                      Clear Status
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {ticketDetails.mergeHistory && ticketDetails.mergeHistory.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600" />
                    Merge History ({ticketDetails.mergeHistory.length})
                  </h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {ticketDetails.mergeHistory.map((merge) => {
                      const isExpanded = expandedMergeEvents.has(merge.merge_id);

                      return (
                        <div key={merge.merge_id} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-blue-900 mb-1">
                                Merged {merge.invoice_count} invoice{merge.invoice_count !== 1 ? 's' : ''}
                              </p>
                              <p className="text-sm text-blue-700">
                                By {merge.merged_by_name || merge.merged_by_email || 'Unknown'} on {new Date(merge.merged_at).toLocaleString()}
                              </p>
                              {merge.notes && (
                                <p className="text-sm text-blue-600 mt-1 italic">{merge.notes}</p>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const newSet = new Set(expandedMergeEvents);
                              if (isExpanded) {
                                newSet.delete(merge.merge_id);
                              } else {
                                newSet.add(merge.merge_id);
                              }
                              setExpandedMergeEvents(newSet);
                            }}
                            className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium mt-2"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-4 h-4" />
                                Hide Invoices
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4" />
                                View {merge.invoice_count} Invoice{merge.invoice_count !== 1 ? 's' : ''}
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 pl-4 border-l-2 border-blue-300 space-y-1">
                              {merge.invoice_reference_numbers.map((invRef) => (
                                <div key={invRef} className="flex items-center gap-2 text-sm">
                                  <span className="font-mono text-blue-800">{invRef}</span>
                                  <a
                                    href={getAcumaticaInvoiceUrl(invRef)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Status History
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {ticketDetails.statusHistory.length === 0 ? (
                    <p className="text-sm text-gray-500">No status changes yet</p>
                  ) : (
                    ticketDetails.statusHistory.map((sh) => (
                      <div key={sh.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {sh.old_status && (
                              <>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(sh.old_status)}`}>
                                  {sh.old_status}
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </>
                            )}
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(sh.new_status)}`}>
                              {sh.new_status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            Changed by {sh.changer_name || 'Unknown'} on {new Date(sh.changed_at).toLocaleString()}
                          </p>
                          {sh.notes && (
                            <p className="text-sm text-gray-500 mt-1 italic">{sh.notes}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Activity Log
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {ticketDetails.activityLog.length === 0 ? (
                    <p className="text-sm text-gray-500">No activity yet</p>
                  ) : (
                    ticketDetails.activityLog.map((al) => (
                      <div key={al.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{al.description}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {al.creator_name || 'Unknown'} • {new Date(al.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('list')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'list'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  All Tickets ({tickets.length})
                </button>
                <button
                  onClick={() => setActiveTab('create')}
                  className={`px-6 py-3 font-medium ${
                    activeTab === 'create'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Create Ticket
                </button>
              </div>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                  <div className="flex">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'list' ? (
                <div className="space-y-4">
                  {tickets.length === 0 ? (
                    <div className="text-center py-12">
                      <Ticket className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No tickets created yet</p>
                    </div>
                  ) : (
                    tickets.map(ticket => (
                      <div
                        key={ticket.id}
                        onClick={() => loadTicketDetails(ticket)}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-300"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>Created {new Date(ticket.created_at).toLocaleDateString()} at {new Date(ticket.created_at).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono font-semibold text-gray-900">
                                {ticket.ticket_number}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTicketTypeColor(ticket.ticket_type)}`}>
                                {ticket.ticket_type}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                                {ticket.status}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                                {ticket.priority}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/customers?customer=${ticket.customer_id}`);
                                }}
                                className="font-semibold text-lg text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {ticket.customer_name}
                              </button>
                              <a
                                href={getAcumaticaCustomerUrl(ticket.customer_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                                title="View in Acumatica"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Acumatica
                              </a>
                            </div>
                            <p className="text-sm text-gray-500 mb-2">
                              Customer ID: {ticket.customer_id}
                            </p>

                            {/* Last Status Change and Activity */}
                            {(ticket.last_status_change || ticket.last_activity) && (
                              <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {ticket.last_status_change && (
                                    <div className="flex items-start gap-1">
                                      <Clock className="w-3 h-3 text-blue-500 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-semibold text-gray-700">Status: {ticket.last_status_change.status}</p>
                                        <p className="text-gray-500">
                                          {formatDistanceToNow(new Date(ticket.last_status_change.changed_at), { addSuffix: true })}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                  {ticket.last_activity && (
                                    <div className="flex items-start gap-1">
                                      <Clock className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-semibold text-gray-700">Activity</p>
                                        <p className="text-gray-600 truncate">{ticket.last_activity.description}</p>
                                        <p className="text-gray-500">
                                          {formatDistanceToNow(new Date(ticket.last_activity.created_at), { addSuffix: true })}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                <span>{ticket.collector_name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <FileText className="w-4 h-4" />
                                <span>{ticket.invoice_count} invoices</span>
                              </div>
                            </div>
                            {ticket.notes && (
                              <p className="mt-2 text-sm text-gray-600 italic line-clamp-2">
                                {ticket.notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            <p className="mb-1">Created: {new Date(ticket.created_at).toLocaleDateString()}</p>
                            {ticket.assigned_at && (
                              <p className="mb-1">Assigned: {new Date(ticket.assigned_at).toLocaleDateString()}</p>
                            )}
                            {ticket.assigner_email && (
                              <p className="text-xs text-gray-400">by {ticket.assigner_email}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {collectors.length === 0 && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                      <div className="flex">
                        <AlertCircle className="h-5 w-5 text-yellow-400" />
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-yellow-800">
                            No Collectors Available
                          </h3>
                          <div className="mt-2 text-sm text-yellow-700">
                            <p>
                              To create collection tickets, you need to have users with the "collector" role.
                              Go to the user management sidebar and assign the collector role to users who will handle collections.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {customers.length === 0 && (
                    <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                      <div className="flex">
                        <AlertCircle className="h-5 w-5 text-blue-400" />
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-blue-800">
                            No Customers Found
                          </h3>
                          <div className="mt-2 text-sm text-blue-700">
                            <p>
                              Make sure customers are synced from Acumatica. Check the Sync Status page.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(collectors.length > 0 || customers.length > 0) && (
                    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
                        <p className="text-sm text-gray-600">Total Customers</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-blue-600">{collectors.length}</p>
                        <p className="text-sm text-gray-600">Collectors</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-900">{tickets.length}</p>
                        <p className="text-sm text-gray-600">Active Tickets</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Ticket Type
                    </label>
                    <select
                      value={ticketType}
                      onChange={(e) => setTicketType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="overdue payment">Overdue Payment</option>
                      <option value="partial payment">Partial Payment</option>
                      <option value="chargeback">Chargeback</option>
                      <option value="settlement">Settlement</option>
                    </select>
                  </div>

                  <div className="relative" ref={dropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Customer {searchTerm && `(${filteredCustomers.length} of ${customers.length} shown)`}
                    </label>
                    <input
                      type="text"
                      placeholder="Search customers by name or ID..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                    />
                    {selectedCustomer && (
                      <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-900">
                          Selected: {customers.find(c => c.customer_id === selectedCustomer)?.customer_name} ({selectedCustomer})
                        </span>
                        <button
                          onClick={() => {
                            setSelectedCustomer('');
                            setCustomerInvoices([]);
                            setSelectedInvoices([]);
                            setSearchTerm('');
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {showCustomerDropdown && searchTerm && (
                      <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">
                            No customers found matching "{searchTerm}"
                          </div>
                        ) : (
                          filteredCustomers.slice(0, 100).map(customer => (
                            <div
                              key={customer.customer_id}
                              onClick={() => {
                                setSelectedCustomer(customer.customer_id);
                                setShowCustomerDropdown(false);
                              }}
                              className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-900">{customer.customer_name}</div>
                              <div className="text-sm text-gray-500">{customer.customer_id}</div>
                            </div>
                          ))
                        )}
                        {filteredCustomers.length > 100 && (
                          <div className="p-3 text-center text-sm text-gray-500 bg-gray-50">
                            Showing first 100 of {filteredCustomers.length} results. Keep typing to narrow down...
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedCustomer && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Filter Invoices
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setInvoiceFilter('all')}
                            className={`px-4 py-2 rounded-lg ${
                              invoiceFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setInvoiceFilter('latest')}
                            className={`px-4 py-2 rounded-lg ${
                              invoiceFilter === 'latest'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Latest
                          </button>
                          <button
                            onClick={() => setInvoiceFilter('oldest')}
                            className={`px-4 py-2 rounded-lg ${
                              invoiceFilter === 'oldest'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Oldest Owed
                          </button>
                          <button
                            onClick={() => setInvoiceFilter('highest')}
                            className={`px-4 py-2 rounded-lg ${
                              invoiceFilter === 'highest'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            Highest Balance
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">
                            Select Invoices ({selectedInvoices.length} selected)
                          </label>
                          {customerInvoices.length > 0 && (
                            <button
                              type="button"
                              onClick={handleSelectAllInvoices}
                              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                              {selectedInvoices.length === customerInvoices.length ? 'Deselect All' : 'Select All'}
                            </button>
                          )}
                        </div>
                        <div className="max-h-96 overflow-y-auto border border-gray-300 rounded-lg">
                          {customerInvoices.map(invoice => (
                            <div
                              key={invoice.reference_number}
                              onClick={() => toggleInvoiceSelection(invoice.reference_number)}
                              className={`p-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                                selectedInvoices.includes(invoice.reference_number)
                                  ? 'bg-blue-50 border-l-4 border-l-blue-600'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">
                                    Invoice #{invoice.reference_number}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    Due: {new Date(invoice.due_date).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-gray-900">
                                    ${invoice.balance.toFixed(2)}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    of ${invoice.amount.toFixed(2)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Assign To
                    </label>
                    <select
                      value={selectedCollector}
                      onChange={(e) => setSelectedCollector(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Choose a collector...</option>
                      {collectors.map(collector => (
                        <option key={collector.id} value={collector.id}>
                          {collector.full_name || collector.email} - {collector.role.charAt(0).toUpperCase() + collector.role.slice(1)}
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Add any notes about this collection ticket..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleCreateTicket}
                      disabled={loading || !selectedCustomer || !selectedCollector || selectedInvoices.length === 0}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Creating...' : 'Create Ticket'}
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('list');
                        setSelectedCustomer('');
                        setCustomerInvoices([]);
                        setSelectedInvoices([]);
                        setSelectedCollector('');
                        setPriority('medium');
                        setTicketType('overdue payment');
                        setNotes('');
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ticket Note Modal */}
      {showTicketNoteModal && selectedTicket?.id && (
        <TicketNoteModal
          key={selectedTicket.id}
          ticketId={selectedTicket.id}
          ticketNumber={selectedTicket.ticket_number}
          onClose={() => setShowTicketNoteModal(false)}
          onSaved={() => {
            // Reload ticket details to show updated activity
            loadTicketDetails(selectedTicket.id).catch(console.error);
          }}
        />
      )}
    </div>
  );
}
