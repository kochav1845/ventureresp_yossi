import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, ExternalLink, Clock, AlertTriangle, Calendar, MessageSquare, Paperclip, Bell, Link2, DollarSign, FileText, CalendarDays, History, ChevronDown, ChevronUp, Plus, X, Trash2, CheckSquare as CheckIcon, Square as SquareIcon, CheckCircle } from 'lucide-react';
import { formatDistanceToNow, isPast, parseISO, format as formatDate } from 'date-fns';
import { TicketGroup, Assignment, TicketStatusOption } from './types';
import { getPriorityColor, getStatusColor, calculateTotalBalance } from './utils';
import { getAcumaticaCustomerUrl } from '../../lib/acumaticaLinks';
import { supabase } from '../../lib/supabase';
import InvoiceItem from './InvoiceItem';
import TicketPromiseDateModal from './TicketPromiseDateModal';
import TicketHistory from './TicketHistory';

interface ColorStatusOption {
  status_name: string;
  display_name: string;
  color_class: string;
}

interface TicketCardProps {
  ticket: TicketGroup;
  selectedInvoices: Set<string>;
  changingColorForInvoice: string | null;
  changingTicketStatus: string | null;
  changingTicketPriority: string | null;
  statusOptions: TicketStatusOption[];
  colorOptions?: ColorStatusOption[];
  onToggleInvoiceSelection: (refNumber: string) => void;
  onColorChange: (refNumber: string, color: string | null) => void;
  onToggleColorPicker: (refNumber: string | null) => void;
  onOpenMemo: (invoice: Assignment) => void;
  onTicketStatusChange: (ticketId: string, newStatus: string) => void;
  onTicketPriorityChange: (ticketId: string, newPriority: string) => void;
  onPromiseDateSet: () => void;
  onOpenTicketReminder: (ticket: TicketGroup) => void;
  onOpenInvoiceReminder: (invoice: Assignment) => void;
  onSelectAllInTicket?: (invoiceRefs: string[]) => void;
  onAddInvoices?: (ticketId: string, invoiceRefs: string[], collectorId: string) => Promise<void>;
  onRemoveInvoice?: (ticketId: string, invoiceRef: string) => Promise<void>;
}

export default function TicketCard({
  ticket,
  selectedInvoices,
  changingColorForInvoice,
  changingTicketStatus,
  changingTicketPriority,
  statusOptions,
  colorOptions = [],
  onToggleInvoiceSelection,
  onColorChange,
  onToggleColorPicker,
  onOpenMemo,
  onTicketStatusChange,
  onTicketPriorityChange,
  onPromiseDateSet,
  onOpenTicketReminder,
  onOpenInvoiceReminder,
  onSelectAllInTicket,
  onAddInvoices,
  onRemoveInvoice
}: TicketCardProps) {
  const navigate = useNavigate();
  const [localTicketStatus, setLocalTicketStatus] = useState(ticket.ticket_status);
  const [localTicketPriority, setLocalTicketPriority] = useState(ticket.ticket_priority);
  const [showPromiseDateModal, setShowPromiseDateModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [relatedTickets, setRelatedTickets] = useState<Array<{
    id: string;
    ticket_number: string;
    status: string;
    priority: string;
    invoice_count: number;
  }>>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
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
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);

  const openInvoices = ticket.invoices.filter(inv => inv.balance > 0 && inv.invoice_status !== 'Closed');
  const paidInvoices = ticket.invoices.filter(inv => inv.balance <= 0 || inv.invoice_status === 'Closed');

  const loadAvailableInvoices = async () => {
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

      const filtered = (data || []).filter(inv => !currentRefs.includes(inv.reference_number));
      setAvailableInvoices(filtered);
    } catch (error) {
      console.error('Error loading available invoices:', error);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleOpenAddInvoices = () => {
    setShowAddInvoices(true);
    setSelectedNewInvoices(new Set());
    loadAvailableInvoices();
  };

  const handleConfirmAddInvoices = async () => {
    if (!onAddInvoices || selectedNewInvoices.size === 0) return;
    setAddingInvoices(true);
    try {
      const collectorId = ticket.invoices[0]?.assignment_id
        ? (await supabase.from('invoice_assignments').select('assigned_collector_id').eq('ticket_id', ticket.ticket_id).limit(1).maybeSingle())?.data?.assigned_collector_id
        : null;

      const { data: ticketData } = await supabase
        .from('collection_tickets')
        .select('assigned_collector_id')
        .eq('id', ticket.ticket_id)
        .maybeSingle();

      const finalCollectorId = collectorId || ticketData?.assigned_collector_id;
      if (!finalCollectorId) throw new Error('Could not determine collector');

      await onAddInvoices(ticket.ticket_id, Array.from(selectedNewInvoices), finalCollectorId);
      setShowAddInvoices(false);
      setSelectedNewInvoices(new Set());
    } catch (error: any) {
      alert('Failed to add invoices: ' + error.message);
    } finally {
      setAddingInvoices(false);
    }
  };

  const handleRemoveInvoice = async (invoiceRef: string) => {
    if (!onRemoveInvoice) return;
    if (!window.confirm(`Remove invoice ${invoiceRef} from this ticket?`)) return;

    setRemovingInvoice(invoiceRef);
    try {
      await onRemoveInvoice(ticket.ticket_id, invoiceRef);
    } catch (error: any) {
      alert('Failed to remove invoice: ' + error.message);
    } finally {
      setRemovingInvoice(null);
    }
  };

  const toggleNewInvoice = (ref: string) => {
    setSelectedNewInvoices(prev => {
      const next = new Set(prev);
      if (next.has(ref)) {
        next.delete(ref);
      } else {
        next.add(ref);
      }
      return next;
    });
  };

  useEffect(() => {
    const fetchRelatedTickets = async () => {
      if (!ticket.customer_id) return;

      setLoadingRelated(true);
      try {
        const { data, error } = await supabase
          .from('collection_tickets')
          .select('id, ticket_number, status, priority')
          .eq('customer_id', ticket.customer_id)
          .neq('status', 'closed')
          .order('created_at', { ascending: false });

        if (error) throw error;

        console.log('All active tickets for customer:', data);
        console.log('Current ticket ID:', ticket.ticket_id);

        if (data && data.length > 0) {
          const otherTickets = data.filter(t => t.id !== ticket.ticket_id);
          console.log('Other tickets after filtering:', otherTickets);

          if (otherTickets.length > 0) {
            const ticketsWithCounts = await Promise.all(
              otherTickets.map(async (t) => {
                const { count } = await supabase
                  .from('invoice_assignments')
                  .select('*', { count: 'exact', head: true })
                  .eq('ticket_id', t.id);

                return {
                  ...t,
                  invoice_count: count || 0
                };
              })
            );
            setRelatedTickets(ticketsWithCounts);
          }
        }
      } catch (error) {
        console.error('Error fetching related tickets:', error);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelatedTickets();
  }, [ticket.customer_id, ticket.ticket_id]);

  const handleStatusUpdate = () => {
    if (localTicketStatus === 'promised') {
      setPendingStatus(localTicketStatus);
      setShowPromiseDateModal(true);
    } else {
      onTicketStatusChange(ticket.ticket_id, localTicketStatus);
    }
  };

  const handlePromiseDateSuccess = () => {
    if (pendingStatus) {
      onTicketStatusChange(ticket.ticket_id, pendingStatus);
      setPendingStatus(null);
    }
    onPromiseDateSet();
  };

  const isBrokenPromise = ticket.ticket_status === 'promised' &&
    ticket.promise_date &&
    isPast(parseISO(ticket.promise_date));

  const isOverdue = ticket.ticket_due_date && isPast(parseISO(ticket.ticket_due_date));

  const currentStatus = statusOptions.find(s => s.status_name === ticket.ticket_status);
  const statusColorClass = currentStatus?.color_class || 'bg-gray-100 text-gray-800';
  const statusDisplayName = currentStatus?.display_name || ticket.ticket_status.replace('_', ' ').toUpperCase();

  return (
    <>
      {showPromiseDateModal && (
        <TicketPromiseDateModal
          ticketId={ticket.ticket_id}
          ticketNumber={ticket.ticket_number}
          customerName={ticket.customer_name}
          onClose={() => {
            setShowPromiseDateModal(false);
            setPendingStatus(null);
          }}
          onSuccess={handlePromiseDateSuccess}
        />
      )}
    <div id={`ticket-${ticket.ticket_id}`} className="border-2 border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className={`p-4 border-b-2 ${getPriorityColor(ticket.ticket_priority)}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Ticket className="w-5 h-5" />
            <span className="font-mono font-bold text-lg">
              {ticket.ticket_number}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColorClass}`}>
              {statusDisplayName}
            </span>
            {ticket.ticket_type && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300">
                {ticket.ticket_type.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {ticket.ticket_created_at && (
              <span className="text-gray-600 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(new Date(ticket.ticket_created_at), 'MMM d, yyyy')}
              </span>
            )}
            <span className="font-semibold">
              Priority: {ticket.ticket_priority.toUpperCase()}
            </span>
          </div>
        </div>

        {isBrokenPromise && (
          <div className="mb-3 p-3 bg-red-100 border-2 border-red-500 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-red-900 text-sm">BROKEN PROMISE</p>
                <p className="text-xs text-red-800">
                  Customer promised to pay by {new Date(ticket.promise_date!).toLocaleDateString()}
                  {' '}({formatDistanceToNow(parseISO(ticket.promise_date!), { addSuffix: true })})
                </p>
                {ticket.promise_by_user_name && (
                  <p className="text-xs text-red-700 mt-1">
                    Promise recorded by: {ticket.promise_by_user_name}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {ticket.ticket_status === 'promised' && ticket.promise_date && !isBrokenPromise && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-300 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900 text-sm">Payment Promise Active</p>
                <p className="text-xs text-blue-800">
                  Customer promised to pay by {new Date(ticket.promise_date!).toLocaleDateString()}
                  {' '}({formatDistanceToNow(parseISO(ticket.promise_date!), { addSuffix: true })})
                </p>
                {ticket.promise_by_user_name && (
                  <p className="text-xs text-blue-700 mt-1">
                    Promise recorded by: {ticket.promise_by_user_name}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isOverdue && (
          <div className="mb-3 p-3 bg-orange-100 border-2 border-orange-500 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-orange-900 text-sm">TICKET OVERDUE</p>
                <p className="text-xs text-orange-800">
                  Due date was {new Date(ticket.ticket_due_date!).toLocaleDateString()}
                  {' '}({formatDistanceToNow(parseISO(ticket.ticket_due_date!), { addSuffix: true })})
                </p>
              </div>
            </div>
          </div>
        )}

        {ticket.ticket_due_date && !isOverdue && (
          <div className="mb-3 p-3 bg-green-50 border border-green-300 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-green-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-900 text-sm">Ticket Due Date</p>
                <p className="text-xs text-green-800">
                  Due by {new Date(ticket.ticket_due_date!).toLocaleDateString()}
                  {' '}({formatDistanceToNow(parseISO(ticket.ticket_due_date!), { addSuffix: true })})
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <a
              href={`/acumatica-customers?customer=${ticket.customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xl font-bold text-blue-600 hover:text-blue-800 hover:underline"
            >
              {ticket.customer_name}
            </a>
            <a
              href={getAcumaticaCustomerUrl(ticket.customer_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
              title="View in Acumatica"
            >
              <ExternalLink className="w-3 h-3" />
              View in Acumatica
            </a>
          </div>
          <button
            onClick={() => onOpenTicketReminder(ticket)}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm"
            title="Set Reminder for this Ticket"
          >
            <Bell className="w-4 h-4" />
            Set Reminder
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-2">
          Customer ID: {ticket.customer_id}
        </p>

        {/* Real-time Balance Tracking */}
        {(ticket.customer_balance !== undefined || ticket.open_invoice_count !== undefined || ticket.oldest_invoice_date) && (
          <div className="mb-3 p-3 bg-slate-50 border border-slate-300 rounded-lg">
            <div className="grid grid-cols-3 gap-4">
              {ticket.customer_balance !== undefined && (
                <div className="flex items-start gap-2">
                  <DollarSign className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Customer Balance</p>
                    <p className="text-sm font-bold text-gray-900">
                      ${ticket.customer_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              )}
              {ticket.open_invoice_count !== undefined && (
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Open Invoices</p>
                    <p className="text-sm font-bold text-gray-900">
                      {ticket.open_invoice_count} invoice{ticket.open_invoice_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              )}
              {ticket.oldest_invoice_date && (
                <div className="flex items-start gap-2">
                  <CalendarDays className="w-4 h-4 text-orange-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Oldest Invoice</p>
                    <p className="text-sm font-bold text-gray-900">
                      {formatDate(new Date(ticket.oldest_invoice_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {relatedTickets.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-start gap-2">
              <Link2 className="w-4 h-4 text-amber-700 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 mb-2">
                  {relatedTickets.length} Other Active Ticket{relatedTickets.length !== 1 ? 's' : ''} for this Customer
                </p>
                <div className="space-y-1">
                  {relatedTickets.map((relatedTicket) => {
                    const statusOption = statusOptions.find(s => s.status_name === relatedTicket.status);
                    const statusDisplayName = statusOption?.display_name || relatedTicket.status.replace('_', ' ').toUpperCase();
                    const statusColorClass = statusOption?.color_class || 'bg-gray-100 text-gray-800';

                    return (
                      <div
                        key={relatedTicket.id}
                        className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-amber-200 hover:border-amber-400 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-mono text-sm font-semibold text-amber-900">
                            {relatedTicket.ticket_number}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColorClass}`}>
                            {statusDisplayName}
                          </span>
                          <span className="text-xs text-amber-700">
                            {relatedTicket.invoice_count} invoice{relatedTicket.invoice_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <a
                          href={`/collection-ticketing?ticket=${relatedTicket.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center gap-1 whitespace-nowrap no-underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {ticket.note_count && ticket.note_count > 0 && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-2 flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                {ticket.has_attachments && (
                  <Paperclip className="w-4 h-4 text-blue-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-900">
                  {ticket.note_count} Note{ticket.note_count !== 1 ? 's' : ''}
                  {ticket.has_attachments && ' (with attachment)'}
                </p>
                {ticket.last_note && (
                  <>
                    <p className="text-xs text-blue-800 mt-1 line-clamp-2">
                      {ticket.last_note.note_text}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {formatDistanceToNow(new Date(ticket.last_note.created_at), { addSuffix: true })}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-300">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Change Ticket Status</h4>
          <div className="flex gap-2 items-center">
            <select
              value={localTicketStatus}
              onChange={(e) => setLocalTicketStatus(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {statusOptions.map(status => (
                <option key={status.id} value={status.status_name}>
                  {status.display_name}
                </option>
              ))}
            </select>
            <button
              onClick={handleStatusUpdate}
              disabled={
                changingTicketStatus === ticket.ticket_id ||
                localTicketStatus === ticket.ticket_status
              }
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {changingTicketStatus === ticket.ticket_id ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-300">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Change Priority</h4>
          <div className="flex gap-2 items-center">
            <select
              value={localTicketPriority}
              onChange={(e) => setLocalTicketPriority(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button
              onClick={() => onTicketPriorityChange(ticket.ticket_id, localTicketPriority)}
              disabled={
                changingTicketPriority === ticket.ticket_id ||
                localTicketPriority === ticket.ticket_priority
              }
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {changingTicketPriority === ticket.ticket_id ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200">
          {!showHistory && (
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              {ticket.last_status_change && (
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-700">Last Status Change</p>
                    <p className="text-gray-600">{ticket.last_status_change.status}</p>
                    <p className="text-gray-500">
                      {formatDistanceToNow(new Date(ticket.last_status_change.changed_at), { addSuffix: true })}
                    </p>
                    <p className="text-gray-500">by {ticket.last_status_change.changed_by_name}</p>
                  </div>
                </div>
              )}
              {ticket.last_activity && (
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-700">Last Activity</p>
                    <p className="text-gray-600">{ticket.last_activity.description}</p>
                    <p className="text-gray-500">
                      {formatDistanceToNow(new Date(ticket.last_activity.created_at), { addSuffix: true })}
                    </p>
                    <p className="text-gray-500">by {ticket.last_activity.created_by_name}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-lg border transition-all duration-200 hover:shadow-sm bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300"
          >
            <History className="w-4 h-4" />
            {showHistory ? 'Hide Full History' : 'View Full History'}
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showHistory && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <TicketHistory ticketId={ticket.ticket_id} />
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h4 className="font-semibold text-gray-700">
              Invoices ({openInvoices.length} open{paidInvoices.length > 0 ? `, ${paidInvoices.length} paid` : ''})
            </h4>
            {onSelectAllInTicket && openInvoices.length > 0 && (() => {
              const ticketInvoiceRefs = openInvoices.map(inv => inv.invoice_reference_number);
              const allSelected = ticketInvoiceRefs.every(ref => selectedInvoices.has(ref));
              const someSelected = ticketInvoiceRefs.some(ref => selectedInvoices.has(ref));
              return (
                <button
                  onClick={() => onSelectAllInTicket(ticketInvoiceRefs)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                    allSelected
                      ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200'
                      : someSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  {allSelected ? (
                    <CheckIcon className="w-3.5 h-3.5" />
                  ) : (
                    <SquareIcon className="w-3.5 h-3.5" />
                  )}
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              );
            })()}
          </div>
          <div className="flex items-center gap-4">
            {onAddInvoices && (
              <button
                onClick={handleOpenAddInvoices}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Invoices
              </button>
            )}
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Outstanding</p>
              <p className="text-xl font-bold text-red-600">
                ${calculateTotalBalance(ticket.invoices).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {showAddInvoices && (
          <div className="mb-4 border-2 border-green-300 rounded-lg bg-green-50 overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-green-100 border-b border-green-300">
              <h5 className="font-semibold text-green-900 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Invoices to Ticket
              </h5>
              <button
                onClick={() => setShowAddInvoices(false)}
                className="p-1 text-green-700 hover:text-green-900 rounded hover:bg-green-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3">
              {loadingAvailable ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  <span className="ml-2 text-sm text-green-700">Loading available invoices...</span>
                </div>
              ) : availableInvoices.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-4">No additional open invoices found for this customer.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-green-800">
                      {availableInvoices.length} available invoice{availableInvoices.length !== 1 ? 's' : ''}
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-green-700 hover:text-green-900">
                      <input
                        type="checkbox"
                        checked={availableInvoices.length > 0 && selectedNewInvoices.size === availableInvoices.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedNewInvoices(new Set(availableInvoices.map(inv => inv.reference_number)));
                          } else {
                            setSelectedNewInvoices(new Set());
                          }
                        }}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      Select All
                    </label>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {availableInvoices.map((inv) => (
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
                          onChange={() => toggleNewInvoice(inv.reference_number)}
                          className="mr-3 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-medium text-sm text-gray-900">
                            #{inv.reference_number}
                          </span>
                          {inv.description && (
                            <span className="text-xs text-gray-500 ml-2 truncate">{inv.description}</span>
                          )}
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          <div className="text-xs text-gray-500">
                            Due: {new Date(inv.due_date).toLocaleDateString()}
                          </div>
                          <div className="text-sm font-semibold text-red-600">
                            ${inv.balance.toFixed(2)}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setShowAddInvoices(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmAddInvoices}
                      disabled={selectedNewInvoices.size === 0 || addingInvoices}
                      className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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
          <div className="flex items-center justify-center gap-2 py-4 text-green-700 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">All invoices are paid</span>
          </div>
        )}

        {openInvoices.length > 0 && (
          <div className="space-y-2">
            {(showAllInvoices ? openInvoices : openInvoices.slice(0, 2)).map(invoice => (
              <div key={invoice.invoice_reference_number} className="relative group">
                <InvoiceItem
                  invoice={invoice}
                  isSelected={selectedInvoices.has(invoice.invoice_reference_number)}
                  showColorPicker={changingColorForInvoice === invoice.invoice_reference_number}
                  colorOptions={colorOptions}
                  onToggleSelection={() => onToggleInvoiceSelection(invoice.invoice_reference_number)}
                  onColorChange={(color) => onColorChange(invoice.invoice_reference_number, color)}
                  onToggleColorPicker={() => onToggleColorPicker(
                    changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number
                  )}
                  onOpenMemo={() => onOpenMemo(invoice)}
                  onOpenReminder={() => onOpenInvoiceReminder(invoice)}
                />
                {onRemoveInvoice && (
                  <button
                    onClick={() => handleRemoveInvoice(invoice.invoice_reference_number)}
                    disabled={removingInvoice === invoice.invoice_reference_number}
                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 hover:text-red-800 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    title="Remove from ticket"
                  >
                    {removingInvoice === invoice.invoice_reference_number ? (
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent"></div>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {openInvoices.length > 2 && (
          <button
            onClick={() => setShowAllInvoices(!showAllInvoices)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            {showAllInvoices ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show {openInvoices.length - 2} More Open Invoice{openInvoices.length - 2 !== 1 ? 's' : ''}
              </>
            )}
          </button>
        )}

        {paidInvoices.length > 0 && (
          <div className={`${openInvoices.length > 0 ? 'mt-4 pt-4 border-t border-gray-200' : 'mt-2'}`}>
            <button
              onClick={() => setShowPaidInvoices(!showPaidInvoices)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              {showPaidInvoices ? 'Hide' : 'Show'} {paidInvoices.length} Paid Invoice{paidInvoices.length !== 1 ? 's' : ''}
              {showPaidInvoices ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showPaidInvoices && (
              <div className="mt-3 space-y-2">
                {paidInvoices.map(invoice => (
                  <div key={invoice.invoice_reference_number} className="relative group opacity-60">
                    <InvoiceItem
                      invoice={invoice}
                      isSelected={selectedInvoices.has(invoice.invoice_reference_number)}
                      showColorPicker={changingColorForInvoice === invoice.invoice_reference_number}
                      colorOptions={colorOptions}
                      onToggleSelection={() => onToggleInvoiceSelection(invoice.invoice_reference_number)}
                      onColorChange={(color) => onColorChange(invoice.invoice_reference_number, color)}
                      onToggleColorPicker={() => onToggleColorPicker(
                        changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number
                      )}
                      onOpenMemo={() => onOpenMemo(invoice)}
                      onOpenReminder={() => onOpenInvoiceReminder(invoice)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
