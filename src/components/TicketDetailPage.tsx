import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Ticket, DollarSign, FileText, Calendar, CalendarDays,
  User, AlertTriangle, Clock, Banknote, Link2, ExternalLink,
  Bell, MessageSquare, Paperclip, Image, File, CheckCircle,
  ChevronDown, ChevronUp, Plus, X, Trash2, History, Loader2,
  RefreshCw, TrendingUp, Hash
} from 'lucide-react';
import { formatDistanceToNow, isPast, parseISO, format as formatDate } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getAcumaticaCustomerUrl, getAcumaticaInvoiceUrl } from '../lib/acumaticaLinks';
import InvoiceMemoModal from './InvoiceMemoModal';
import TicketMemoModal from './TicketMemoModal';
import CreateReminderModal from './CreateReminderModal';
import TicketStatusChangeModal from './TicketStatusChangeModal';
import TicketHistory from './MyAssignments/TicketHistory';
import TicketPromiseDateModal from './MyAssignments/TicketPromiseDateModal';
import { TicketGroup, Assignment, TicketStatusOption } from './MyAssignments/types';
import { getPriorityColor, calculateTotalBalance } from './MyAssignments/utils';
import ColorStatusPicker from './MyAssignments/ColorStatusPicker';

interface ColorStatusOption {
  status_name: string;
  display_name: string;
  color_class: string;
}

export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [ticket, setTicket] = useState<TicketGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusOptions, setStatusOptions] = useState<TicketStatusOption[]>([]);
  const [colorOptions, setColorOptions] = useState<ColorStatusOption[]>([]);
  const [localTicketStatus, setLocalTicketStatus] = useState('');
  const [localTicketPriority, setLocalTicketPriority] = useState('');
  const [changingTicketStatus, setChangingTicketStatus] = useState(false);
  const [changingTicketPriority, setChangingTicketPriority] = useState(false);

  const [changingColorForInvoice, setChangingColorForInvoice] = useState<string | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  const [showPromiseDateModal, setShowPromiseDateModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const [showAllInvoices, setShowAllInvoices] = useState(true);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);

  const [memoModal, setMemoModal] = useState<Assignment | null>(null);
  const [ticketMemoModal, setTicketMemoModal] = useState(false);
  const [reminderModal, setReminderModal] = useState<{
    type: 'ticket' | 'invoice';
    ticketId?: string;
    ticketNumber?: string;
    invoiceReference?: string;
    customerName?: string;
  } | null>(null);
  const [statusChangeModal, setStatusChangeModal] = useState<{
    ticketId: string;
    ticketNumber: string;
    currentStatus: string;
    newStatus: string;
    currentStatusDisplay?: string;
    newStatusDisplay?: string;
  } | null>(null);

  const [relatedTickets, setRelatedTickets] = useState<Array<{
    id: string;
    ticket_number: string;
    status: string;
    priority: string;
    invoice_count: number;
  }>>([]);

  const [showAddInvoices, setShowAddInvoices] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState<Array<{
    reference_number: string;
    date: string;
    due_date: string;
    amount: number;
    balance: number;
    description: string;
  }>>([]);
  const [selectedNewInvoices, setSelectedNewInvoices] = useState<Set<string>>(new Set());
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [addingInvoices, setAddingInvoices] = useState(false);
  const [removingInvoice, setRemovingInvoice] = useState<string | null>(null);

  const loadTicketData = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('collection_tickets')
        .select(`
          id, ticket_number, status, priority, notes, created_at, resolved_at,
          customer_id, assigned_collector_id, ticket_type, due_date,
          promise_date, promise_by_user_id,
          user_profiles!collection_tickets_assigned_collector_id_fkey (full_name)
        `)
        .eq('id', ticketId)
        .maybeSingle();

      if (ticketError) throw ticketError;
      if (!ticketData) {
        setError('Ticket not found');
        setLoading(false);
        return;
      }

      const { data: customerData } = await supabase
        .from('acumatica_customers')
        .select('customer_name')
        .eq('customer_id', ticketData.customer_id)
        .maybeSingle();

      const { data: assignments } = await supabase
        .from('invoice_assignments')
        .select('id, invoice_reference_number, notes, assigned_collector_id')
        .eq('ticket_id', ticketId);

      const invoiceRefs = (assignments || []).map(a => a.invoice_reference_number);
      let invoiceDataMap = new Map<string, any>();

      if (invoiceRefs.length > 0) {
        const { data: invoices } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, date, due_date, amount, balance, description, status, type')
          .in('reference_number', invoiceRefs);

        if (invoices) {
          invoices.forEach(inv => invoiceDataMap.set(inv.reference_number, inv));
        }
      }

      let colorStatusMap = new Map<string, string>();
      if (invoiceRefs.length > 0) {
        const { data: colorData } = await supabase
          .from('invoice_color_status')
          .select('invoice_reference_number, color_status')
          .in('invoice_reference_number', invoiceRefs);

        if (colorData) {
          colorData.forEach(c => colorStatusMap.set(c.invoice_reference_number, c.color_status));
        }
      }

      let promiseDateMap = new Map<string, string>();
      if (invoiceRefs.length > 0) {
        const { data: promiseData } = await supabase
          .from('invoice_promise_dates')
          .select('invoice_reference_number, promise_date')
          .in('invoice_reference_number', invoiceRefs);

        if (promiseData) {
          promiseData.forEach(p => promiseDateMap.set(p.invoice_reference_number, p.promise_date));
        }
      }

      let memoCountMap = new Map<string, number>();
      if (invoiceRefs.length > 0) {
        const { data: memoCounts } = await supabase
          .from('invoice_memos')
          .select('invoice_reference_number')
          .in('invoice_reference_number', invoiceRefs);

        if (memoCounts) {
          memoCounts.forEach(m => {
            const count = memoCountMap.get(m.invoice_reference_number) || 0;
            memoCountMap.set(m.invoice_reference_number, count + 1);
          });
        }
      }

      let appDataMap = new Map<string, string>();
      if (invoiceRefs.length > 0) {
        const { data: appData } = await supabase
          .from('payment_invoice_applications')
          .select('invoice_reference_number, application_date, amount_paid')
          .in('invoice_reference_number', invoiceRefs)
          .gt('amount_paid', 0)
          .order('application_date', { ascending: false });

        if (appData) {
          appData.forEach(a => {
            if (!appDataMap.has(a.invoice_reference_number) && a.application_date) {
              appDataMap.set(a.invoice_reference_number, a.application_date);
            }
          });
        }
      }

      const mappedInvoices: Assignment[] = (assignments || []).map(a => {
        const inv = invoiceDataMap.get(a.invoice_reference_number);
        return {
          assignment_id: a.id,
          invoice_reference_number: a.invoice_reference_number,
          ticket_id: ticketId,
          ticket_number: ticketData.ticket_number,
          ticket_status: ticketData.status,
          ticket_priority: ticketData.priority,
          ticket_type: ticketData.ticket_type,
          ticket_due_date: ticketData.due_date,
          customer: ticketData.customer_id,
          customer_name: customerData?.customer_name || ticketData.customer_id,
          date: inv?.date || '',
          due_date: inv?.due_date || '',
          amount: inv?.amount || 0,
          balance: inv?.balance || 0,
          invoice_status: inv?.status || 'Unknown',
          color_status: colorStatusMap.get(a.invoice_reference_number) || null,
          description: inv?.description || '',
          assignment_notes: a.notes || '',
          promise_date: promiseDateMap.get(a.invoice_reference_number) || null,
          collection_date: appDataMap.get(a.invoice_reference_number) || null,
          memo_count: memoCountMap.get(a.invoice_reference_number) || 0,
        };
      });

      let promiseByName: string | null = null;
      if (ticketData.promise_by_user_id) {
        const { data: promiseUser } = await supabase
          .from('user_profiles')
          .select('full_name')
          .eq('id', ticketData.promise_by_user_id)
          .maybeSingle();
        promiseByName = promiseUser?.full_name || null;
      }

      const { data: noteData } = await supabase
        .from('ticket_notes')
        .select('id, has_image, document_urls')
        .eq('ticket_id', ticketId);

      const noteCount = noteData?.length || 0;
      const hasImages = noteData?.some(n => n.has_image) || false;
      const hasDocuments = noteData?.some(n => n.document_urls && n.document_urls.length > 0) || false;

      const { data: memoData } = await supabase
        .from('invoice_memos')
        .select('id, attachment_urls')
        .eq('ticket_id', ticketId);

      const ticketMemoCount = memoData?.length || 0;
      const hasMemoAttachments = memoData?.some(m => m.attachment_urls && m.attachment_urls.length > 0) || false;

      const { data: activityData } = await supabase
        .from('ticket_activity_log')
        .select('description, created_at, metadata, activity_type, created_by:user_profiles!ticket_activity_log_created_by_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: statusChangeData } = await supabase
        .from('ticket_activity_log')
        .select('description, created_at, metadata, created_by:user_profiles!ticket_activity_log_created_by_fkey(full_name)')
        .eq('ticket_id', ticketId)
        .eq('activity_type', 'status_change')
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: balanceData } = await supabase
        .from('acumatica_invoices')
        .select('customer, date, balance, status')
        .eq('customer', ticketData.customer_id)
        .neq('status', 'Closed');

      let customerBalance = 0;
      let openInvoiceCount = 0;
      let oldestInvoiceDate: string | null = null;
      if (balanceData) {
        balanceData.forEach(inv => {
          customerBalance += inv.balance || 0;
          openInvoiceCount += 1;
          if (!oldestInvoiceDate || (inv.date && inv.date < oldestInvoiceDate)) {
            oldestInvoiceDate = inv.date;
          }
        });
      }

      const { data: lastPayment } = await supabase
        .from('acumatica_payments')
        .select('payment_amount, application_date')
        .eq('customer_id', ticketData.customer_id)
        .in('type', ['Payment', 'Prepayment'])
        .order('application_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const ticketGroup: TicketGroup = {
        ticket_id: ticketData.id,
        ticket_number: ticketData.ticket_number,
        ticket_status: ticketData.status,
        ticket_priority: ticketData.priority,
        ticket_type: ticketData.ticket_type || '',
        ticket_due_date: ticketData.due_date,
        ticket_created_at: ticketData.created_at,
        ticket_closed_at: ticketData.resolved_at,
        assigned_collector_id: ticketData.assigned_collector_id,
        assigned_collector_name: (ticketData.user_profiles as any)?.full_name || null,
        customer_id: ticketData.customer_id,
        customer_name: customerData?.customer_name || ticketData.customer_id,
        promise_date: ticketData.promise_date,
        promise_by_user_name: promiseByName,
        invoices: mappedInvoices,
        note_count: noteCount,
        has_images: hasImages,
        has_documents: hasDocuments,
        memo_count: ticketMemoCount,
        has_memo_attachments: hasMemoAttachments,
        last_status_change: statusChangeData?.[0] ? {
          status: statusChangeData[0].description,
          changed_at: statusChangeData[0].created_at,
          changed_by_name: (statusChangeData[0].created_by as any)?.full_name || 'System',
        } : undefined,
        last_activity: activityData?.[0] ? {
          description: activityData[0].description,
          created_at: activityData[0].created_at,
          created_by_name: (activityData[0].created_by as any)?.full_name || 'System',
        } : undefined,
        customer_balance: customerBalance,
        open_invoice_count: openInvoiceCount,
        oldest_invoice_date: oldestInvoiceDate,
        last_payment_amount: lastPayment?.payment_amount || null,
        last_payment_date: lastPayment?.application_date || null,
      };

      setTicket(ticketGroup);
      setLocalTicketStatus(ticketGroup.ticket_status);
      setLocalTicketPriority(ticketGroup.ticket_priority);

      const { data: otherTickets } = await supabase
        .from('collection_tickets')
        .select('id, ticket_number, status, priority')
        .eq('customer_id', ticketData.customer_id)
        .neq('id', ticketId)
        .neq('status', 'closed');

      if (otherTickets && otherTickets.length > 0) {
        const withCounts = await Promise.all(
          otherTickets.map(async t => {
            const { count } = await supabase
              .from('invoice_assignments')
              .select('*', { count: 'exact', head: true })
              .eq('ticket_id', t.id);
            return { ...t, invoice_count: count || 0 };
          })
        );
        setRelatedTickets(withCounts);
      }
    } catch (err: any) {
      console.error('Error loading ticket:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  const loadOptions = useCallback(async () => {
    const [statusResult, colorResult] = await Promise.all([
      supabase
        .from('ticket_status_options')
        .select('id, status_name, display_name, color_class, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('invoice_color_status_options')
        .select('status_name, display_name, color_class')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    setStatusOptions(statusResult.data || []);
    setColorOptions(colorResult.data || []);
  }, []);

  useEffect(() => {
    loadTicketData();
    loadOptions();
  }, [loadTicketData, loadOptions]);

  const handleTicketStatusChange = async (newStatus: string) => {
    if (!ticket) return;
    const currentStatusOpt = statusOptions.find(s => s.status_name === ticket.ticket_status);
    const newStatusOpt = statusOptions.find(s => s.status_name === newStatus);

    if (newStatus === 'closed' && ticket.invoices.some(inv => inv.balance > 0)) {
      setStatusChangeModal({
        ticketId: ticket.ticket_id,
        ticketNumber: ticket.ticket_number,
        currentStatus: ticket.ticket_status,
        newStatus,
        currentStatusDisplay: currentStatusOpt?.display_name,
        newStatusDisplay: newStatusOpt?.display_name,
      });
      return;
    }

    setChangingTicketStatus(true);
    try {
      const { error } = await supabase
        .from('collection_tickets')
        .update({ status: newStatus })
        .eq('id', ticket.ticket_id);
      if (error) throw error;

      await supabase.from('ticket_activity_log').insert({
        ticket_id: ticket.ticket_id,
        activity_type: 'status_change',
        description: `Status changed from ${currentStatusOpt?.display_name || ticket.ticket_status} to ${newStatusOpt?.display_name || newStatus}`,
        created_by: user?.id,
        metadata: { from: ticket.ticket_status, to: newStatus },
      });

      await loadTicketData();
    } catch (err) {
      console.error('Error changing ticket status:', err);
    } finally {
      setChangingTicketStatus(false);
    }
  };

  const handleTicketPriorityChange = async (newPriority: string) => {
    if (!ticket) return;
    setChangingTicketPriority(true);
    try {
      const { error } = await supabase
        .from('collection_tickets')
        .update({ priority: newPriority })
        .eq('id', ticket.ticket_id);
      if (error) throw error;

      await supabase.from('ticket_activity_log').insert({
        ticket_id: ticket.ticket_id,
        activity_type: 'priority_changed',
        description: `Priority changed from ${ticket.ticket_priority} to ${newPriority}`,
        created_by: user?.id,
        metadata: { from: ticket.ticket_priority, to: newPriority },
      });

      await loadTicketData();
    } catch (err) {
      console.error('Error changing ticket priority:', err);
    } finally {
      setChangingTicketPriority(false);
    }
  };

  const handleColorChange = async (refNumber: string, color: string | null) => {
    try {
      if (color) {
        await supabase.from('invoice_color_status').upsert({
          invoice_reference_number: refNumber,
          color_status: color,
          updated_by: user?.id,
        }, { onConflict: 'invoice_reference_number' });
      } else {
        await supabase.from('invoice_color_status')
          .delete()
          .eq('invoice_reference_number', refNumber);
      }
      setChangingColorForInvoice(null);
      await loadTicketData();
    } catch (err) {
      console.error('Error changing color:', err);
    }
  };

  const handleStatusUpdate = () => {
    if (localTicketStatus === 'promised') {
      setPendingStatus(localTicketStatus);
      setShowPromiseDateModal(true);
    } else {
      handleTicketStatusChange(localTicketStatus);
    }
  };

  const handlePromiseDateSuccess = () => {
    if (pendingStatus) {
      handleTicketStatusChange(pendingStatus);
      setPendingStatus(null);
    }
    loadTicketData();
  };

  const handleAddInvoices = async (invoiceRefs: string[]) => {
    if (!ticket) return;
    try {
      const { data: ticketData } = await supabase
        .from('collection_tickets')
        .select('assigned_collector_id')
        .eq('id', ticket.ticket_id)
        .maybeSingle();

      const collectorId = ticketData?.assigned_collector_id;
      if (!collectorId) throw new Error('No collector assigned');

      const insertData = invoiceRefs.map(ref => ({
        ticket_id: ticket.ticket_id,
        invoice_reference_number: ref,
        assigned_collector_id: collectorId,
      }));

      const { error } = await supabase.from('invoice_assignments').insert(insertData);
      if (error) throw error;

      setShowAddInvoices(false);
      setSelectedNewInvoices(new Set());
      await loadTicketData();
    } catch (err: any) {
      alert('Failed to add invoices: ' + err.message);
    }
  };

  const handleRemoveInvoice = async (invoiceRef: string) => {
    if (!ticket || !window.confirm(`Remove invoice ${invoiceRef} from this ticket?`)) return;
    setRemovingInvoice(invoiceRef);
    try {
      const { error } = await supabase
        .from('invoice_assignments')
        .delete()
        .eq('ticket_id', ticket.ticket_id)
        .eq('invoice_reference_number', invoiceRef);
      if (error) throw error;
      await loadTicketData();
    } catch (err: any) {
      alert('Failed to remove invoice: ' + err.message);
    } finally {
      setRemovingInvoice(null);
    }
  };

  const loadAvailableInvoices = async () => {
    if (!ticket) return;
    setLoadingAvailable(true);
    try {
      const currentRefs = ticket.invoices.map(inv => inv.invoice_reference_number);
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, date, due_date, amount, balance, description')
        .eq('customer', ticket.customer_id)
        .eq('status', 'Open')
        .gt('balance', 0)
        .order('date', { ascending: false });

      if (error) throw error;
      setAvailableInvoices((data || []).filter(inv => !currentRefs.includes(inv.reference_number)));
    } catch (err) {
      console.error('Error loading available invoices:', err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-gray-500 font-medium">Loading ticket details...</span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Ticket Not Found</h2>
        <p className="text-gray-500 mb-6">{error || 'The ticket you are looking for does not exist.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const openInvoices = ticket.invoices.filter(inv => inv.balance > 0 && inv.invoice_status !== 'Closed');
  const paidInvoices = ticket.invoices.filter(inv => inv.balance <= 0 || inv.invoice_status === 'Closed');
  const totalOutstanding = calculateTotalBalance(ticket.invoices);
  const totalOpen = openInvoices.reduce((s, inv) => s + (inv.balance || 0), 0);

  const isBrokenPromise = ticket.ticket_status === 'promised' &&
    ticket.promise_date && isPast(parseISO(ticket.promise_date));
  const isOverdue = ticket.ticket_due_date && isPast(parseISO(ticket.ticket_due_date));

  const currentStatus = statusOptions.find(s => s.status_name === ticket.ticket_status);
  const statusColorClass = currentStatus?.color_class || 'bg-gray-100 text-gray-800';
  const statusDisplayName = currentStatus?.display_name || ticket.ticket_status.replace('_', ' ').toUpperCase();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {showPromiseDateModal && (
        <TicketPromiseDateModal
          ticketId={ticket.ticket_id}
          ticketNumber={ticket.ticket_number}
          customerName={ticket.customer_name}
          onClose={() => { setShowPromiseDateModal(false); setPendingStatus(null); }}
          onSuccess={handlePromiseDateSuccess}
        />
      )}

      {memoModal && (
        <InvoiceMemoModal
          invoiceReferenceNumber={memoModal.invoice_reference_number}
          customerName={memoModal.customer_name}
          ticketId={ticket.ticket_id}
          onClose={() => { setMemoModal(null); loadTicketData(); }}
        />
      )}

      {ticketMemoModal && (
        <TicketMemoModal
          ticketId={ticket.ticket_id}
          ticketNumber={ticket.ticket_number}
          customerName={ticket.customer_name}
          customerId={ticket.customer_id}
          onClose={() => { setTicketMemoModal(false); loadTicketData(); }}
        />
      )}

      {reminderModal && (
        <CreateReminderModal
          onClose={() => setReminderModal(null)}
          defaultInvoiceRef={reminderModal.invoiceReference}
          defaultTicketId={reminderModal.ticketId}
          defaultTicketNumber={reminderModal.ticketNumber}
          defaultCustomerName={reminderModal.customerName}
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
          onConfirm={async () => {
            setChangingTicketStatus(true);
            try {
              await supabase.from('collection_tickets').update({ status: statusChangeModal.newStatus }).eq('id', statusChangeModal.ticketId);
              await supabase.from('ticket_activity_log').insert({
                ticket_id: statusChangeModal.ticketId,
                activity_type: 'status_change',
                description: `Status changed to ${statusChangeModal.newStatusDisplay || statusChangeModal.newStatus}`,
                created_by: user?.id,
              });
              setStatusChangeModal(null);
              await loadTicketData();
            } finally {
              setChangingTicketStatus(false);
            }
          }}
          onCancel={() => setStatusChangeModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <Ticket className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{ticket.ticket_number}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColorClass}`}>
              {statusDisplayName}
            </span>
            {ticket.ticket_type && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-800 border border-slate-300">
                {ticket.ticket_type.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityColor(ticket.ticket_priority)}`}>
              {ticket.ticket_priority.toUpperCase()}
            </span>
          </div>
        </div>
        <button
          onClick={loadTicketData}
          className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Alert Banners */}
      {isBrokenPromise && (
        <div className="p-4 bg-red-100 border-2 border-red-500 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-700 flex-shrink-0" />
            <div>
              <p className="font-bold text-red-900">BROKEN PROMISE</p>
              <p className="text-sm text-red-800">
                Customer promised to pay by {new Date(ticket.promise_date!).toLocaleDateString()}
                {' '}({formatDistanceToNow(parseISO(ticket.promise_date!), { addSuffix: true })})
                {ticket.promise_by_user_name && ` - recorded by ${ticket.promise_by_user_name}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {ticket.ticket_status === 'promised' && ticket.promise_date && !isBrokenPromise && (
        <div className="p-4 bg-blue-50 border border-blue-300 rounded-xl">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-700 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-900">Payment Promise Active</p>
              <p className="text-sm text-blue-800">
                Due by {new Date(ticket.promise_date).toLocaleDateString()}
                {' '}({formatDistanceToNow(parseISO(ticket.promise_date), { addSuffix: true })})
                {ticket.promise_by_user_name && ` - recorded by ${ticket.promise_by_user_name}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {isOverdue && (
        <div className="p-4 bg-orange-100 border-2 border-orange-500 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-700 flex-shrink-0" />
            <div>
              <p className="font-bold text-orange-900">TICKET OVERDUE</p>
              <p className="text-sm text-orange-800">
                Due date was {new Date(ticket.ticket_due_date!).toLocaleDateString()}
                {' '}({formatDistanceToNow(parseISO(ticket.ticket_due_date!), { addSuffix: true })})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <DashboardCard
          icon={DollarSign}
          label="Ticket Balance"
          value={`$${totalOpen.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          color="text-red-600"
          bg="bg-red-50 border-red-100"
        />
        <DashboardCard
          icon={FileText}
          label="Open Invoices"
          value={String(openInvoices.length)}
          color="text-blue-600"
          bg="bg-blue-50 border-blue-100"
        />
        <DashboardCard
          icon={TrendingUp}
          label="Customer Balance"
          value={`$${(ticket.customer_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          color="text-emerald-600"
          bg="bg-emerald-50 border-emerald-100"
        />
        <DashboardCard
          icon={Hash}
          label="All Customer Invoices"
          value={String(ticket.open_invoice_count || 0)}
          color="text-sky-600"
          bg="bg-sky-50 border-sky-100"
        />
        <DashboardCard
          icon={Banknote}
          label="Last Payment"
          value={ticket.last_payment_amount != null
            ? `$${ticket.last_payment_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
            : 'N/A'}
          subtitle={ticket.last_payment_date ? formatDate(new Date(ticket.last_payment_date), 'MMM d, yyyy') : undefined}
          color="text-teal-600"
          bg="bg-teal-50 border-teal-100"
        />
        <DashboardCard
          icon={CalendarDays}
          label="Oldest Invoice"
          value={ticket.oldest_invoice_date ? formatDate(new Date(ticket.oldest_invoice_date), 'MMM d, yyyy') : 'N/A'}
          color="text-amber-600"
          bg="bg-amber-50 border-amber-100"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Ticket Info */}
        <div className="space-y-4">
          {/* Customer Info */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Customer</h3>
            <div>
              <a
                href={`/customers?customer=${ticket.customer_id}`}
                className="text-lg font-bold text-blue-600 hover:text-blue-800 hover:underline"
              >
                {ticket.customer_name}
              </a>
              <p className="text-sm text-gray-500 mt-1">{ticket.customer_id}</p>
            </div>
            <a
              href={getAcumaticaCustomerUrl(ticket.customer_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View in Acumatica
            </a>
            {ticket.assigned_collector_name && (
              <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border border-teal-200 rounded-lg">
                <User className="w-4 h-4 text-teal-600" />
                <div>
                  <p className="text-xs text-teal-600 font-medium">Assigned to</p>
                  <p className="text-sm font-semibold text-teal-900">{ticket.assigned_collector_name}</p>
                </div>
              </div>
            )}
          </div>

          {/* Ticket Controls */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Controls</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
                <div className="flex items-center gap-2">
                  <select
                    value={localTicketStatus}
                    onChange={(e) => setLocalTicketStatus(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {statusOptions.map(status => (
                      <option key={status.id} value={status.status_name}>{status.display_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleStatusUpdate}
                    disabled={changingTicketStatus || localTicketStatus === ticket.ticket_status}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {changingTicketStatus ? '...' : 'Save'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Priority</label>
                <div className="flex items-center gap-2">
                  <select
                    value={localTicketPriority}
                    onChange={(e) => setLocalTicketPriority(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    onClick={() => handleTicketPriorityChange(localTicketPriority)}
                    disabled={changingTicketPriority || localTicketPriority === ticket.ticket_priority}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {changingTicketPriority ? '...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => setTicketMemoModal(true)}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <FileText className="w-4 h-4" />
                Memos & Activity
                {ticket.memo_count && ticket.memo_count > 0 && (
                  <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{ticket.memo_count}</span>
                )}
              </button>
              <button
                onClick={() => setReminderModal({
                  type: 'ticket',
                  ticketId: ticket.ticket_id,
                  ticketNumber: ticket.ticket_number,
                  customerName: ticket.customer_name,
                })}
                className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Bell className="w-4 h-4" />
                Set Reminder
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Timeline</h3>
            {ticket.ticket_created_at && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-gray-500">Created</span>
                <span className="font-medium text-gray-900 ml-auto">{formatDate(new Date(ticket.ticket_created_at), 'MMM d, yyyy')}</span>
              </div>
            )}
            {ticket.ticket_due_date && (
              <div className="flex items-center gap-3 text-sm">
                <CalendarDays className={`w-4 h-4 flex-shrink-0 ${isOverdue ? 'text-orange-500' : 'text-green-500'}`} />
                <span className="text-gray-500">Due Date</span>
                <span className={`font-medium ml-auto ${isOverdue ? 'text-orange-600' : 'text-gray-900'}`}>
                  {formatDate(new Date(ticket.ticket_due_date), 'MMM d, yyyy')}
                </span>
              </div>
            )}
            {ticket.ticket_closed_at && (
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-gray-500">Closed</span>
                <span className="font-medium text-gray-900 ml-auto">{formatDate(new Date(ticket.ticket_closed_at), 'MMM d, yyyy')}</span>
              </div>
            )}
            {ticket.last_status_change && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">Last Status Change</p>
                <p className="text-sm text-gray-800">{ticket.last_status_change.status}</p>
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(ticket.last_status_change.changed_at), { addSuffix: true })} by {ticket.last_status_change.changed_by_name}
                </p>
              </div>
            )}
            {ticket.last_activity && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">Last Activity</p>
                <p className="text-sm text-gray-800">{ticket.last_activity.description}</p>
                <p className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(ticket.last_activity.created_at), { addSuffix: true })} by {ticket.last_activity.created_by_name}
                </p>
              </div>
            )}
          </div>

          {/* Related Tickets */}
          {relatedTickets.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Related Tickets ({relatedTickets.length})
              </h3>
              <div className="space-y-2">
                {relatedTickets.map(rt => {
                  const statusOpt = statusOptions.find(s => s.status_name === rt.status);
                  return (
                    <button
                      key={rt.id}
                      onClick={() => navigate(`/ticket/${rt.id}`)}
                      className="w-full flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-amber-900">{rt.ticket_number}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusOpt?.color_class || 'bg-gray-100 text-gray-800'}`}>
                          {statusOpt?.display_name || rt.status}
                        </span>
                      </div>
                      <span className="text-xs text-amber-700">{rt.invoice_count} inv.</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Invoices & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoices Section */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">
                  Invoices ({openInvoices.length} open{paidInvoices.length > 0 ? `, ${paidInvoices.length} paid` : ''})
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowAddInvoices(true);
                    setSelectedNewInvoices(new Set());
                    loadAvailableInvoices();
                  }}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Invoices
                </button>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Outstanding</p>
                  <p className="text-lg font-bold text-red-600">
                    ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
              {/* Add Invoices Panel */}
              {showAddInvoices && (
                <div className="mb-5 border-2 border-green-300 rounded-lg bg-green-50 overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-green-100 border-b border-green-300">
                    <h5 className="font-semibold text-green-900 text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add Invoices to Ticket
                    </h5>
                    <button onClick={() => setShowAddInvoices(false)} className="p-1 text-green-700 hover:text-green-900 rounded hover:bg-green-200 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3">
                    {loadingAvailable ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
                        <span className="ml-2 text-sm text-green-700">Loading available invoices...</span>
                      </div>
                    ) : availableInvoices.length === 0 ? (
                      <p className="text-sm text-gray-600 text-center py-4">No additional open invoices found.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-green-800">{availableInvoices.length} available</span>
                          <label className="flex items-center gap-2 cursor-pointer text-sm text-green-700">
                            <input
                              type="checkbox"
                              checked={selectedNewInvoices.size === availableInvoices.length}
                              onChange={(e) => {
                                setSelectedNewInvoices(e.target.checked
                                  ? new Set(availableInvoices.map(i => i.reference_number))
                                  : new Set()
                                );
                              }}
                              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                            />
                            Select All
                          </label>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {availableInvoices.map(inv => (
                            <label
                              key={inv.reference_number}
                              className={`flex items-center p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                selectedNewInvoices.has(inv.reference_number)
                                  ? 'bg-green-100 border-green-400'
                                  : 'bg-white border-gray-200 hover:border-green-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedNewInvoices.has(inv.reference_number)}
                                onChange={() => {
                                  const next = new Set(selectedNewInvoices);
                                  next.has(inv.reference_number) ? next.delete(inv.reference_number) : next.add(inv.reference_number);
                                  setSelectedNewInvoices(next);
                                }}
                                className="mr-3 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="font-mono font-medium text-sm text-gray-900">#{inv.reference_number}</span>
                                {inv.description && <span className="text-xs text-gray-500 ml-2 truncate">{inv.description}</span>}
                              </div>
                              <div className="text-right ml-3 flex-shrink-0">
                                <div className="text-xs text-gray-500">Due: {new Date(inv.due_date).toLocaleDateString()}</div>
                                <div className="text-sm font-semibold text-red-600">${inv.balance.toFixed(2)}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <button onClick={() => setShowAddInvoices(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                          <button
                            onClick={() => handleAddInvoices(Array.from(selectedNewInvoices))}
                            disabled={selectedNewInvoices.size === 0 || addingInvoices}
                            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                          >
                            {addingInvoices ? 'Adding...' : `Add ${selectedNewInvoices.size} Invoice${selectedNewInvoices.size !== 1 ? 's' : ''}`}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {openInvoices.length === 0 && paidInvoices.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-6 text-green-700 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">All invoices are paid</span>
                </div>
              )}

              {openInvoices.length > 0 && (
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100 border-b-2 border-gray-300">
                          <th className="w-10 px-3 py-2.5 text-center border-r border-gray-300">
                            <input
                              type="checkbox"
                              checked={openInvoices.every(inv => selectedInvoices.has(inv.invoice_reference_number))}
                              onChange={(e) => {
                                const next = new Set(selectedInvoices);
                                openInvoices.forEach(inv => {
                                  e.target.checked ? next.add(inv.invoice_reference_number) : next.delete(inv.invoice_reference_number);
                                });
                                setSelectedInvoices(next);
                              }}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded cursor-pointer"
                            />
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Invoice #</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Status</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Inv Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Due Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Collected</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Amount</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Balance</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Color</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-700 border-r border-gray-300 whitespace-nowrap">Days</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-gray-700 whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllInvoices ? openInvoices : openInvoices.slice(0, 10)).map((invoice, idx) => {
                          const colorOption = invoice.color_status ? colorOptions.find(opt => opt.status_name === invoice.color_status) : null;
                          const colorParts = colorOption?.color_class?.split(' ') || [];
                          const bgColor = colorParts.find(p => p.startsWith('bg-')) || '';
                          const daysToCollect = invoice.date && invoice.collection_date
                            ? Math.ceil((new Date(invoice.collection_date).getTime() - new Date(invoice.date).getTime()) / (1000 * 60 * 60 * 24))
                            : null;
                          const isShortPaid = invoice.amount !== invoice.balance && invoice.balance > 0;

                          return (
                            <tr
                              key={invoice.invoice_reference_number}
                              className={`border-b border-gray-200 hover:bg-blue-50/50 transition-colors group ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                              } ${selectedInvoices.has(invoice.invoice_reference_number) ? '!bg-blue-50' : ''}`}
                            >
                              <td className="px-3 py-2.5 text-center border-r border-gray-200">
                                <input
                                  type="checkbox"
                                  checked={selectedInvoices.has(invoice.invoice_reference_number)}
                                  onChange={() => {
                                    const next = new Set(selectedInvoices);
                                    next.has(invoice.invoice_reference_number) ? next.delete(invoice.invoice_reference_number) : next.add(invoice.invoice_reference_number);
                                    setSelectedInvoices(next);
                                  }}
                                  className="h-4 w-4 text-blue-600 border-gray-300 rounded cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-gray-900">#{invoice.invoice_reference_number}</span>
                                  <a
                                    href={getAcumaticaInvoiceUrl(invoice.invoice_reference_number)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:text-blue-700 opacity-60 hover:opacity-100"
                                    title="View in Acumatica"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  invoice.invoice_status === 'Open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {invoice.invoice_status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-gray-600 whitespace-nowrap">
                                {invoice.date ? new Date(invoice.date).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-gray-600 whitespace-nowrap">
                                {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 whitespace-nowrap">
                                {invoice.collection_date ? (
                                  <span className="text-green-700 font-medium">{new Date(invoice.collection_date).toLocaleDateString()}</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-right whitespace-nowrap text-gray-600">
                                ${(invoice.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`px-3 py-2.5 border-r border-gray-200 text-right whitespace-nowrap font-semibold ${
                                isShortPaid ? 'text-orange-600' : 'text-gray-900'
                              }`}>
                                ${(invoice.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                {isShortPaid && <span className="text-xs ml-1 text-orange-500">(short)</span>}
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">
                                <div className="relative color-picker-container inline-block">
                                  <button
                                    onClick={() => setChangingColorForInvoice(
                                      changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number
                                    )}
                                    className="focus:outline-none"
                                  >
                                    {colorOption ? (
                                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full text-white ${bgColor}`}>
                                        {colorOption.display_name}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded-full cursor-pointer">Set</span>
                                    )}
                                  </button>
                                  {changingColorForInvoice === invoice.invoice_reference_number && (
                                    <div className="absolute z-20 top-full mt-1 right-0">
                                      <ColorStatusPicker
                                        currentStatus={invoice.color_status}
                                        onColorChange={(color) => handleColorChange(invoice.invoice_reference_number, color)}
                                        onClose={() => setChangingColorForInvoice(null)}
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 border-r border-gray-200 text-center whitespace-nowrap">
                                {daysToCollect !== null ? (
                                  <span className="text-blue-700 font-medium text-xs">{daysToCollect}d</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setReminderModal({
                                      type: 'invoice',
                                      invoiceReference: invoice.invoice_reference_number,
                                      customerName: ticket.customer_name,
                                    })}
                                    className="p-1.5 text-amber-600 hover:bg-amber-100 rounded transition-colors"
                                    title="Set Reminder"
                                  >
                                    <Bell className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setMemoModal(invoice)}
                                    className={`p-1.5 rounded transition-colors relative ${
                                      invoice.memo_count && invoice.memo_count > 0
                                        ? 'text-amber-700 hover:bg-amber-100'
                                        : 'text-blue-600 hover:bg-blue-100'
                                    }`}
                                    title="Memos"
                                  >
                                    <MessageSquare className="w-4 h-4" />
                                    {invoice.memo_count && invoice.memo_count > 0 && (
                                      <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                        {invoice.memo_count}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleRemoveInvoice(invoice.invoice_reference_number)}
                                    disabled={removingInvoice === invoice.invoice_reference_number}
                                    className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                    title="Remove from ticket"
                                  >
                                    {removingInvoice === invoice.invoice_reference_number ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold">
                          <td colSpan={7} className="px-3 py-2.5 text-right text-gray-700 border-r border-gray-300">Total Outstanding:</td>
                          <td className="px-3 py-2.5 text-right text-red-700 border-r border-gray-300 whitespace-nowrap">
                            ${totalOpen.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {openInvoices.length > 10 && (
                <button
                  onClick={() => setShowAllInvoices(!showAllInvoices)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {showAllInvoices ? (
                    <><ChevronUp className="w-4 h-4" /> Show Less</>
                  ) : (
                    <><ChevronDown className="w-4 h-4" /> Show All {openInvoices.length} Invoices</>
                  )}
                </button>
              )}

              {paidInvoices.length > 0 && (
                <div className={openInvoices.length > 0 ? 'mt-4 pt-4 border-t border-gray-200' : 'mt-2'}>
                  <button
                    onClick={() => setShowPaidInvoices(!showPaidInvoices)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {showPaidInvoices ? 'Hide' : 'Show'} {paidInvoices.length} Paid Invoice{paidInvoices.length !== 1 ? 's' : ''}
                    {showPaidInvoices ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showPaidInvoices && (
                    <div className="mt-3 border border-gray-300 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-green-50 border-b-2 border-green-200">
                              <th className="px-3 py-2 text-left font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Invoice #</th>
                              <th className="px-3 py-2 text-left font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Status</th>
                              <th className="px-3 py-2 text-left font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Inv Date</th>
                              <th className="px-3 py-2 text-left font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Due Date</th>
                              <th className="px-3 py-2 text-left font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Collected</th>
                              <th className="px-3 py-2 text-right font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Amount</th>
                              <th className="px-3 py-2 text-right font-semibold text-green-800 border-r border-green-200 whitespace-nowrap">Balance</th>
                              <th className="px-3 py-2 text-center font-semibold text-green-800 whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paidInvoices.map((invoice, idx) => (
                              <tr key={invoice.invoice_reference_number} className={`border-b border-gray-100 text-gray-500 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                                <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-medium">#{invoice.invoice_reference_number}</span>
                                    <a
                                      href={getAcumaticaInvoiceUrl(invoice.invoice_reference_number)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-600"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                </td>
                                <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Paid</span>
                                </td>
                                <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                                  {invoice.date ? new Date(invoice.date).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                                  {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                                  {invoice.collection_date ? (
                                    <span className="text-green-600">{new Date(invoice.collection_date).toLocaleDateString()}</span>
                                  ) : '-'}
                                </td>
                                <td className="px-3 py-2 border-r border-gray-200 text-right whitespace-nowrap">
                                  ${(invoice.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-3 py-2 border-r border-gray-200 text-right whitespace-nowrap text-green-700 font-medium">
                                  ${(invoice.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  <button
                                    onClick={() => setMemoModal(invoice)}
                                    className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                                    title="Memos"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes Section */}
          {ticket.note_count && ticket.note_count > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">{ticket.note_count} Note{ticket.note_count !== 1 ? 's' : ''}</h3>
                {(ticket.has_images || ticket.has_documents) && <Paperclip className="w-4 h-4 text-blue-500" />}
              </div>
              {ticket.last_note && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <p className="text-gray-800">{ticket.last_note.note_text}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatDistanceToNow(new Date(ticket.last_note.created_at), { addSuffix: true })}</p>
                </div>
              )}
            </div>
          )}

          {/* Full History */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Activity History</h3>
            </div>
            <div className="p-5">
              <TicketHistory ticketId={ticket.ticket_id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ icon: Icon, label, value, subtitle, color, bg }: {
  icon: any;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}
