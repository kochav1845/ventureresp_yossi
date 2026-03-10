import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, ExternalLink, Clock, AlertTriangle, Calendar, MessageSquare, Paperclip, Bell, Link2, DollarSign, FileText, CalendarDays, History, ChevronDown, ChevronUp, Plus, X, Trash2, CheckSquare as CheckIcon, Square as SquareIcon, CheckCircle, Banknote, User, Image, File, ArrowUp, ArrowDown } from 'lucide-react';
import { formatDistanceToNow, format as dateFnsFormat } from 'date-fns';
import { TicketGroup, Assignment, TicketStatusOption } from './types';
import { getPriorityColor, getStatusColor, calculateTotalBalance, sortInvoices } from './utils';
import type { InvoiceSortField, SortDirection } from './utils';
import { getAcumaticaCustomerUrl, getAcumaticaInvoiceUrl } from '../../lib/acumaticaLinks';
import { supabase } from '../../lib/supabase';
import { formatDate, isDatePast } from '../../lib/dateUtils';
import TicketPromiseDateModal from './TicketPromiseDateModal';
import TicketHistory from './TicketHistory';
import ColorStatusPicker from './ColorStatusPicker';
import { isPromiseBroken } from './utils';

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
  onOpenTicketMemo: (ticket: TicketGroup) => void;
  onOpenTicketReminder: (ticket: TicketGroup) => void;
  onOpenInvoiceReminder: (invoice: Assignment) => void;
  onSelectAllInTicket?: (invoiceRefs: string[]) => void;
  onAddInvoices?: (ticketId: string, invoiceRefs: string[], collectorId: string) => Promise<void>;
  onRemoveInvoice?: (ticketId: string, invoiceRef: string) => Promise<void>;
  isTicketSelected?: boolean;
  onToggleTicketSelection?: (ticketId: string) => void;
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
  onOpenTicketMemo,
  onOpenTicketReminder,
  onOpenInvoiceReminder,
  onSelectAllInTicket,
  onAddInvoices,
  onRemoveInvoice,
  isTicketSelected = false,
  onToggleTicketSelection
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
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [invoiceSortField, setInvoiceSortField] = useState<InvoiceSortField | null>(null);
  const [invoiceSortDir, setInvoiceSortDir] = useState<SortDirection>('asc');
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node)) {
        setShowPriorityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInvoiceSort = (field: InvoiceSortField) => {
    if (invoiceSortField === field) {
      setInvoiceSortDir(invoiceSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setInvoiceSortField(field);
      setInvoiceSortDir('asc');
    }
  };

  const rawOpenInvoices = ticket.invoices.filter(inv => inv.balance > 0 && inv.invoice_status !== 'Closed');
  const openInvoices = invoiceSortField ? sortInvoices(rawOpenInvoices, invoiceSortField, invoiceSortDir) : rawOpenInvoices;
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
    isDatePast(ticket.promise_date.split('T')[0]);

  const isOverdue = ticket.ticket_due_date && isDatePast(ticket.ticket_due_date.split('T')[0]);

  const currentStatus = statusOptions.find(s => s.status_name === ticket.ticket_status);
  const statusColorClass = currentStatus?.color_class || 'bg-gray-100 text-gray-800';
  const statusDisplayName = currentStatus?.display_name || ticket.ticket_status.replace('_', ' ').toUpperCase();

  const oldestInvoiceDate = ticket.invoices.length > 0
    ? ticket.invoices.filter(inv => inv.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]?.date
    : null;

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
    <div id={`ticket-${ticket.ticket_id}`} className={`border rounded-lg overflow-hidden transition-shadow hover:shadow-md ${isTicketSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'}`}>

      <div className={`px-3 py-2 ${getPriorityColor(ticket.ticket_priority)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {onToggleTicketSelection && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleTicketSelection(ticket.ticket_id); }}
                className="flex-shrink-0 focus:outline-none"
                title={isTicketSelected ? 'Deselect this ticket' : 'Select this ticket'}
              >
                {isTicketSelected ? (
                  <CheckIcon className="w-4 h-4 text-blue-700" />
                ) : (
                  <SquareIcon className="w-4 h-4 text-gray-400 hover:text-blue-500 transition-colors" />
                )}
              </button>
            )}
            <Ticket className="w-4 h-4 flex-shrink-0" />
            <button
              onClick={() => navigate(`/ticket/${ticket.ticket_id}`)}
              className="font-mono font-bold text-sm hover:underline hover:text-blue-700 transition-colors cursor-pointer"
            >
              {ticket.ticket_number}
            </button>
            <button
              onClick={() => navigate(`/ticket/${ticket.ticket_id}`)}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-white/80 border border-current rounded hover:bg-white transition-colors"
              title="Open ticket detail page"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Open
            </button>
            <div className="relative" ref={statusDropdownRef}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowStatusDropdown(!showStatusDropdown); setShowPriorityDropdown(false); }}
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 transition-all ${statusColorClass}`}
                title="Click to change status"
              >
                {changingTicketStatus === ticket.ticket_id ? '...' : statusDisplayName}
                <ChevronDown className="w-2.5 h-2.5 inline-block ml-0.5 -mt-0.5" />
              </button>
              {showStatusDropdown && (
                <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-1 min-w-[170px] z-50">
                  {statusOptions.map((option) => {
                    const parts = option.color_class.split(' ');
                    const bgColor = parts.find(p => p.startsWith('bg-')) || 'bg-gray-500';
                    const isActive = option.status_name === ticket.ticket_status;
                    return (
                      <button
                        key={option.status_name}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowStatusDropdown(false);
                          if (option.status_name === 'promised') {
                            setPendingStatus('promised');
                            setShowPromiseDateModal(true);
                          } else if (option.status_name !== ticket.ticket_status) {
                            onTicketStatusChange(ticket.ticket_id, option.status_name);
                          }
                        }}
                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${
                          isActive ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${bgColor}`}></span>
                        {option.display_name}
                        {isActive && <CheckIcon className="w-3 h-3 text-blue-600 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {ticket.ticket_type && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {ticket.ticket_type.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </span>
            )}
            {(ticket.has_images || ticket.has_memo_images || ticket.has_documents || ticket.has_memo_documents) && (
              <div className="flex items-center gap-1">
                {(ticket.has_images || ticket.has_memo_images) && (
                  <span className="flex items-center px-1 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600" title="Contains images">
                    <Image className="w-3 h-3" />
                  </span>
                )}
                {(ticket.has_documents || ticket.has_memo_documents) && (
                  <span className="flex items-center px-1 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-600" title="Contains attachments">
                    <Paperclip className="w-3 h-3" />
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="relative flex-shrink-0" ref={priorityDropdownRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowPriorityDropdown(!showPriorityDropdown); setShowStatusDropdown(false); }}
              className="flex items-center gap-1 text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-400 rounded px-2 py-0.5 transition-all"
              title="Click to change priority"
            >
              {changingTicketPriority === ticket.ticket_id ? '...' : ticket.ticket_priority.toUpperCase()}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showPriorityDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-1 min-w-[140px] z-50">
                {[
                  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
                  { value: 'high', label: 'High', color: 'bg-orange-500' },
                  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
                  { value: 'low', label: 'Low', color: 'bg-green-500' },
                ].map((option) => {
                  const isActive = option.value === ticket.ticket_priority;
                  return (
                    <button
                      key={option.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPriorityDropdown(false);
                        if (option.value !== ticket.ticket_priority) {
                          onTicketPriorityChange(ticket.ticket_id, option.value);
                        }
                      }}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${
                        isActive ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${option.color}`}></span>
                      {option.label}
                      {isActive && <CheckIcon className="w-3 h-3 text-blue-600 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-600">
          {ticket.assigned_collector_name && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-teal-600" />
              <span className="text-gray-500">Assigned:</span>
              <span className="font-medium text-gray-800">{ticket.assigned_collector_name}</span>
            </span>
          )}
          {ticket.ticket_created_at && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-blue-500" />
              <span className="text-gray-500">Created:</span>
              <span className="font-medium text-gray-800">{dateFnsFormat(new Date(ticket.ticket_created_at), 'MMM d, yyyy')}</span>
            </span>
          )}
          {ticket.ticket_closed_at && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3 text-gray-500" />
              <span className="text-gray-500">Closed:</span>
              <span className="font-medium text-gray-800">{dateFnsFormat(new Date(ticket.ticket_closed_at), 'MMM d, yyyy')}</span>
            </span>
          )}
          {oldestInvoiceDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3 text-amber-500" />
              <span className="text-gray-500">Oldest Inv:</span>
              <span className="font-medium text-gray-800">{formatDate(oldestInvoiceDate)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 bg-white">
        {isBrokenPromise && (
          <div className="mb-2 px-2.5 py-1.5 bg-red-50 border border-red-300 rounded flex items-center gap-2 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
            <div>
              <span className="font-bold text-red-800">BROKEN PROMISE</span>
              <span className="text-red-700 ml-1.5">
                Pay by {formatDate(ticket.promise_date!)}
                {' '}({formatDistanceToNow(new Date(ticket.promise_date! + 'T12:00:00'), { addSuffix: true })})
              </span>
              {ticket.promise_by_user_name && (
                <span className="text-red-600 ml-1">- by {ticket.promise_by_user_name}</span>
              )}
            </div>
          </div>
        )}

        {ticket.ticket_status === 'promised' && ticket.promise_date && !isBrokenPromise && (
          <div className="mb-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <div>
              <span className="font-semibold text-blue-800">Promise Active</span>
              <span className="text-blue-700 ml-1.5">
                Pay by {formatDate(ticket.promise_date!)}
                {' '}({formatDistanceToNow(new Date(ticket.promise_date! + 'T12:00:00'), { addSuffix: true })})
              </span>
              {ticket.promise_by_user_name && (
                <span className="text-blue-600 ml-1">- by {ticket.promise_by_user_name}</span>
              )}
            </div>
          </div>
        )}

        {isOverdue && (
          <div className="mb-2 px-2.5 py-1.5 bg-orange-50 border border-orange-300 rounded flex items-center gap-2 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
            <span className="font-bold text-orange-800">OVERDUE</span>
            <span className="text-orange-700">
              Due {formatDate(ticket.ticket_due_date!)}
              {' '}({formatDistanceToNow(new Date(ticket.ticket_due_date! + 'T12:00:00'), { addSuffix: true })})
            </span>
          </div>
        )}

        {ticket.ticket_due_date && !isOverdue && (
          <div className="mb-2 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
            <span className="font-medium text-green-800">Due by</span>
            <span className="text-green-700">
              {formatDate(ticket.ticket_due_date!)}
              {' '}({formatDistanceToNow(new Date(ticket.ticket_due_date! + 'T12:00:00'), { addSuffix: true })})
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <a
              href={`/acumatica-customers?customer=${ticket.customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-bold text-blue-600 hover:text-blue-800 hover:underline truncate"
            >
              {ticket.customer_name}
            </a>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{ticket.customer_id}</span>
            <a
              href={getAcumaticaCustomerUrl(ticket.customer_id)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-1.5 py-0.5 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 flex-shrink-0"
              title="View in Acumatica"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Acumatica
            </a>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => onOpenTicketMemo(ticket)}
              className="px-2 py-1 bg-gray-700 text-white rounded text-[11px] hover:bg-gray-800 transition-colors flex items-center gap-1"
              title="Ticket Memos"
            >
              <FileText className="w-3 h-3" />
              Memos
              {ticket.memo_count && ticket.memo_count > 0 && (
                <span className="bg-white/20 text-white text-[10px] px-1 rounded-full">{ticket.memo_count}</span>
              )}
            </button>
            <button
              onClick={() => onOpenTicketReminder(ticket)}
              className="px-2 py-1 bg-amber-600 text-white rounded text-[11px] hover:bg-amber-700 transition-colors flex items-center gap-1"
              title="Set Reminder"
            >
              <Bell className="w-3 h-3" />
              Remind
            </button>
          </div>
        </div>

        {(ticket.customer_balance !== undefined || ticket.open_invoice_count !== undefined || ticket.oldest_invoice_date || ticket.last_payment_date) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] py-1.5 px-2 bg-gray-50 rounded border border-gray-100">
            {ticket.customer_balance !== undefined && (
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-green-600" />
                <span className="text-gray-500">Balance:</span>
                <span className="font-bold text-gray-900">${ticket.customer_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            )}
            {ticket.open_invoice_count !== undefined && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3 text-blue-600" />
                <span className="font-bold text-gray-900">{ticket.open_invoice_count}</span>
                <span className="text-gray-500">open</span>
              </span>
            )}
            {ticket.oldest_invoice_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-orange-600" />
                <span className="text-gray-500">Oldest:</span>
                <span className="font-medium text-gray-800">{formatDate(ticket.oldest_invoice_date)}</span>
              </span>
            )}
            {ticket.last_payment_amount != null && (
              <span className="flex items-center gap-1">
                <Banknote className="w-3 h-3 text-teal-600" />
                <span className="text-gray-500">Last Pmt:</span>
                <span className="font-bold text-teal-700">${ticket.last_payment_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            )}
            {ticket.last_payment_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-teal-600" />
                <span className="text-gray-500">on</span>
                <span className="font-medium text-gray-800">{formatDate(ticket.last_payment_date)}</span>
              </span>
            )}
          </div>
        )}

        {relatedTickets.length > 0 && (
          <div className="mt-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <Link2 className="w-3 h-3 text-amber-600" />
              <span className="font-semibold text-amber-800">
                {relatedTickets.length} Other Active Ticket{relatedTickets.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1">
              {relatedTickets.map((relatedTicket) => {
                const statusOption = statusOptions.find(s => s.status_name === relatedTicket.status);
                const relStatusName = statusOption?.display_name || relatedTicket.status.replace('_', ' ').toUpperCase();
                const relStatusClass = statusOption?.color_class || 'bg-gray-100 text-gray-800';
                return (
                  <div key={relatedTicket.id} className="flex items-center justify-between gap-2 py-1 px-1.5 bg-white rounded border border-amber-100">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-amber-900">{relatedTicket.ticket_number}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${relStatusClass}`}>{relStatusName}</span>
                      <span className="text-[10px] text-amber-600">{relatedTicket.invoice_count} inv</span>
                    </div>
                    <a
                      href={`/ticket/${relatedTicket.id}`}
                      onClick={(e) => { e.preventDefault(); navigate(`/ticket/${relatedTicket.id}`); }}
                      className="px-1.5 py-0.5 text-[10px] bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center gap-0.5 no-underline"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      View
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ticket.note_count && ticket.note_count > 0 && (
          <div className="mt-2 px-2 py-1.5 bg-blue-50 border border-blue-100 rounded text-xs">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 text-blue-500" />
              {ticket.has_attachments && <Paperclip className="w-3 h-3 text-blue-500" />}
              <span className="font-semibold text-blue-800">{ticket.note_count} Note{ticket.note_count !== 1 ? 's' : ''}</span>
              {ticket.last_note && (
                <span className="text-blue-600 truncate ml-1">
                  {ticket.last_note.note_text} - {formatDistanceToNow(new Date(ticket.last_note.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        )}

        {ticket.memo_count && ticket.memo_count > 0 && (
          <div
            className="mt-2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs cursor-pointer hover:bg-slate-100 transition-colors"
            onClick={() => onOpenTicketMemo(ticket)}
          >
            <div className="flex items-center gap-1.5">
              <FileText className="w-3 h-3 text-slate-500" />
              {ticket.has_memo_attachments && <Paperclip className="w-3 h-3 text-slate-500" />}
              <span className="font-semibold text-slate-800">{ticket.memo_count} Memo{ticket.memo_count !== 1 ? 's' : ''}</span>
              {ticket.last_memo && (
                <span className="text-slate-600 truncate ml-1">
                  {ticket.last_memo.memo_text} - {formatDistanceToNow(new Date(ticket.last_memo.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-gray-100">
          {!showHistory && (ticket.last_status_change || ticket.last_activity) && (
            <div className="flex items-start gap-4 text-[11px] text-gray-500 mb-2">
              {ticket.last_status_change && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <span className="text-gray-400">Status:</span>
                  <span className="text-gray-600">{ticket.last_status_change.status}</span>
                  <span>{formatDistanceToNow(new Date(ticket.last_status_change.changed_at), { addSuffix: true })}</span>
                  <span>by {ticket.last_status_change.changed_by_name}</span>
                </div>
              )}
              {ticket.last_activity && (
                <div className="flex items-center gap-1 min-w-0">
                  <Clock className="w-3 h-3 text-green-400 flex-shrink-0" />
                  <span className="text-gray-400">Activity:</span>
                  <span className="text-gray-600 truncate">{ticket.last_activity.description}</span>
                  <span className="flex-shrink-0">{formatDistanceToNow(new Date(ticket.last_activity.created_at), { addSuffix: true })}</span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded border transition-all hover:shadow-sm bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300"
          >
            <History className="w-3.5 h-3.5" />
            {showHistory ? 'Hide History' : 'Full History'}
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showHistory && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <TicketHistory ticketId={ticket.ticket_id} />
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-700 text-sm">
              Invoices ({openInvoices.length} open{paidInvoices.length > 0 ? `, ${paidInvoices.length} paid` : ''})
            </h4>
            {onSelectAllInTicket && openInvoices.length > 0 && (() => {
              const ticketInvoiceRefs = openInvoices.map(inv => inv.invoice_reference_number);
              const allSelected = ticketInvoiceRefs.every(ref => selectedInvoices.has(ref));
              const someSelected = ticketInvoiceRefs.some(ref => selectedInvoices.has(ref));
              return (
                <button
                  onClick={() => onSelectAllInTicket(ticketInvoiceRefs)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors flex items-center gap-1 ${
                    allSelected
                      ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200'
                      : someSelected
                        ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  {allSelected ? <CheckIcon className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              );
            })()}
          </div>
          <div className="flex items-center gap-3">
            {onAddInvoices && (
              <button
                onClick={handleOpenAddInvoices}
                className="px-2 py-1 bg-green-600 text-white rounded text-[11px] hover:bg-green-700 transition-colors flex items-center gap-1 font-medium"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            )}
            <div className="text-right">
              <p className="text-[10px] text-gray-500 leading-none">Outstanding</p>
              <p className="text-sm font-bold text-red-600 leading-tight">
                ${calculateTotalBalance(ticket.invoices).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {showAddInvoices && (
          <div className="mb-3 border border-green-300 rounded bg-green-50 overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-green-100 border-b border-green-300">
              <h5 className="font-semibold text-green-900 text-xs flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Add Invoices to Ticket
              </h5>
              <button onClick={() => setShowAddInvoices(false)} className="p-0.5 text-green-700 hover:text-green-900 rounded hover:bg-green-200 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-2.5">
              {loadingAvailable ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                  <span className="ml-2 text-xs text-green-700">Loading...</span>
                </div>
              ) : availableInvoices.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-3">No additional open invoices found.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-green-800">{availableInvoices.length} available</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-green-700 hover:text-green-900">
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
                        className="h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      All
                    </label>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {availableInvoices.map((inv) => (
                      <label
                        key={inv.reference_number}
                        className={`flex items-center p-2 rounded border cursor-pointer transition-colors text-xs ${
                          selectedNewInvoices.has(inv.reference_number)
                            ? 'bg-green-100 border-green-400'
                            : 'bg-white border-gray-200 hover:border-green-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedNewInvoices.has(inv.reference_number)}
                          onChange={() => toggleNewInvoice(inv.reference_number)}
                          className="mr-2 h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-medium text-gray-900">#{inv.reference_number}</span>
                          {inv.description && <span className="text-gray-500 ml-1.5 truncate">{inv.description}</span>}
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <div className="text-[10px] text-gray-500">Due: {formatDate(inv.due_date)}</div>
                          <div className="font-semibold text-red-600">${inv.balance.toFixed(2)}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button onClick={() => setShowAddInvoices(false)} className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                      onClick={handleConfirmAddInvoices}
                      disabled={selectedNewInvoices.size === 0 || addingInvoices}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {addingInvoices ? 'Adding...' : `Add ${selectedNewInvoices.size}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {openInvoices.length === 0 && paidInvoices.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-2.5 text-green-700 bg-green-50 rounded border border-green-200 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">All invoices are paid</span>
          </div>
        )}

        {openInvoices.length > 0 && (
          <div className="border border-gray-200 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-7 px-1.5 py-1.5 text-center border-r border-gray-200">
                      {onSelectAllInTicket && (() => {
                        const refs = openInvoices.map(inv => inv.invoice_reference_number);
                        const allSel = refs.every(ref => selectedInvoices.has(ref));
                        return (
                          <input type="checkbox" checked={allSel} onChange={() => onSelectAllInTicket(refs)} className="h-3 w-3 text-blue-600 border-gray-300 rounded cursor-pointer" />
                        );
                      })()}
                    </th>
                    {([
                      { field: 'invoice_reference_number' as InvoiceSortField, label: 'Invoice #', align: 'text-left' },
                      { field: 'invoice_status' as InvoiceSortField, label: 'Status', align: 'text-left' },
                      { field: 'date' as InvoiceSortField, label: 'Inv Date', align: 'text-left' },
                      { field: 'due_date' as InvoiceSortField, label: 'Due Date', align: 'text-left' },
                      { field: 'collection_date' as InvoiceSortField, label: 'Collected', align: 'text-left' },
                      { field: 'amount' as InvoiceSortField, label: 'Amount', align: 'text-right' },
                      { field: 'balance' as InvoiceSortField, label: 'Balance', align: 'text-right' },
                      { field: 'color_status' as InvoiceSortField, label: 'Color', align: 'text-center' },
                      { field: 'days' as InvoiceSortField, label: 'Days', align: 'text-center' },
                    ]).map(col => (
                      <th key={col.field} className={`px-1.5 py-1.5 ${col.align} font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors select-none`} onClick={() => handleInvoiceSort(col.field)}>
                        <div className={`flex items-center gap-0.5 ${col.align === 'text-right' ? 'justify-end' : col.align === 'text-center' ? 'justify-center' : ''}`}>
                          {col.label}
                          {invoiceSortField === col.field ? (invoiceSortDir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-blue-600" /> : <ArrowDown className="w-2.5 h-2.5 text-blue-600" />) : <ArrowDown className="w-2.5 h-2.5 text-gray-300" />}
                        </div>
                      </th>
                    ))}
                    <th className="px-1.5 py-1.5 text-center font-semibold text-gray-600 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllInvoices ? openInvoices : openInvoices.slice(0, 5)).map((invoice, idx) => {
                    const colorOption = invoice.color_status ? colorOptions.find(opt => opt.status_name === invoice.color_status) : null;
                    const colorParts = colorOption?.color_class?.split(' ') || [];
                    const bgColor = colorParts.find(p => p.startsWith('bg-')) || '';
                    const daysToCollect = invoice.date && invoice.collection_date
                      ? Math.ceil((new Date(invoice.collection_date).getTime() - new Date(invoice.date).getTime()) / (1000 * 60 * 60 * 24))
                      : null;
                    const isShortPaid = invoice.amount !== invoice.balance && invoice.balance > 0;
                    const brokenPromise = isPromiseBroken(invoice);
                    return (
                      <tr key={invoice.invoice_reference_number} className={`border-b border-gray-100 hover:bg-blue-50/50 transition-colors group ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} ${selectedInvoices.has(invoice.invoice_reference_number) ? '!bg-blue-50' : ''}`}>
                        <td className="px-1.5 py-1 text-center border-r border-gray-100">
                          <input type="checkbox" checked={selectedInvoices.has(invoice.invoice_reference_number)} onChange={() => onToggleInvoiceSelection(invoice.invoice_reference_number)} className="h-3 w-3 text-blue-600 border-gray-300 rounded cursor-pointer" />
                        </td>
                        <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-semibold text-gray-900">#{invoice.invoice_reference_number}</span>
                            <a href={getAcumaticaInvoiceUrl(invoice.invoice_reference_number)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 opacity-60 hover:opacity-100"><ExternalLink className="w-2.5 h-2.5" /></a>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${invoice.invoice_status === 'Open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{invoice.invoice_status}</span>
                            {brokenPromise && <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-600 text-white" title={`Promise date was ${formatDate(invoice.promise_date!)}`}>BP</span>}
                          </div>
                        </td>
                        <td className="px-1.5 py-1 border-r border-gray-100 text-gray-600 whitespace-nowrap">{invoice.date ? formatDate(invoice.date) : '-'}</td>
                        <td className="px-1.5 py-1 border-r border-gray-100 text-gray-600 whitespace-nowrap">{invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
                        <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">{invoice.collection_date ? <span className="text-green-700 font-medium">{formatDate(invoice.collection_date)}</span> : <span className="text-gray-400">-</span>}</td>
                        <td className="px-1.5 py-1 border-r border-gray-100 text-right whitespace-nowrap text-gray-600">${(invoice.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className={`px-1.5 py-1 border-r border-gray-100 text-right whitespace-nowrap font-semibold ${isShortPaid ? 'text-orange-600' : 'text-gray-900'}`}>
                          ${(invoice.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          {isShortPaid && <span className="text-[9px] ml-0.5 text-orange-500">(short)</span>}
                        </td>
                        <td className="px-1.5 py-1 border-r border-gray-100 text-center whitespace-nowrap">
                          <div className="relative color-picker-container inline-block">
                            <button onClick={(e) => { e.stopPropagation(); onToggleColorPicker(changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number); }} className="focus:outline-none">
                              {colorOption ? <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full text-white ${bgColor}`}>{colorOption.display_name}</span> : <span className="px-1.5 py-0.5 text-[10px] text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded-full cursor-pointer">Set</span>}
                            </button>
                            {changingColorForInvoice === invoice.invoice_reference_number && (
                              <div className="absolute z-20 top-full mt-1 right-0">
                                <ColorStatusPicker currentStatus={invoice.color_status} onColorChange={(color) => onColorChange(invoice.invoice_reference_number, color)} onClose={() => onToggleColorPicker(null)} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-1.5 py-1 border-r border-gray-100 text-center whitespace-nowrap">
                          {daysToCollect !== null ? <span className="text-blue-700 font-medium text-[10px]">{daysToCollect}d</span> : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-1.5 py-1 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-0.5">
                            <button onClick={() => onOpenInvoiceReminder(invoice)} className="p-0.5 text-amber-600 hover:bg-amber-100 rounded transition-colors" title="Reminder"><Bell className="w-3 h-3" /></button>
                            <button onClick={() => onOpenMemo(invoice)} className={`p-0.5 rounded transition-colors relative ${invoice.memo_count && invoice.memo_count > 0 ? 'text-amber-700 hover:bg-amber-100' : 'text-blue-600 hover:bg-blue-100'}`} title="Memos">
                              <MessageSquare className="w-3 h-3" />
                              {invoice.memo_count && invoice.memo_count > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{invoice.memo_count}</span>}
                            </button>
                            {onRemoveInvoice && (
                              <button onClick={() => handleRemoveInvoice(invoice.invoice_reference_number)} disabled={removingInvoice === invoice.invoice_reference_number} className="p-0.5 text-red-500 hover:bg-red-100 rounded transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50" title="Remove">
                                {removingInvoice === invoice.invoice_reference_number ? <div className="w-3 h-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent"></div> : <Trash2 className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                    <td colSpan={7} className="px-1.5 py-1 text-right text-gray-600 border-r border-gray-200 text-xs">Total Outstanding:</td>
                    <td className="px-1.5 py-1 text-right text-red-700 border-r border-gray-200 whitespace-nowrap text-xs">${calculateTotalBalance(openInvoices).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {openInvoices.length > 5 && (
          <button
            onClick={() => setShowAllInvoices(!showAllInvoices)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            {showAllInvoices ? (
              <><ChevronUp className="w-3.5 h-3.5" /> Show Less</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> {openInvoices.length - 5} More Open Invoice{openInvoices.length - 5 !== 1 ? 's' : ''}</>
            )}
          </button>
        )}

        {paidInvoices.length > 0 && (
          <div className={openInvoices.length > 0 ? 'mt-2 pt-2 border-t border-gray-200' : 'mt-1'}>
            <button
              onClick={() => setShowPaidInvoices(!showPaidInvoices)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {showPaidInvoices ? 'Hide' : 'Show'} {paidInvoices.length} Paid
              {showPaidInvoices ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showPaidInvoices && (
              <div className="mt-2 border border-gray-200 rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-1.5 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">Invoice #</th>
                        <th className="px-1.5 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">Status</th>
                        <th className="px-1.5 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">Inv Date</th>
                        <th className="px-1.5 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">Due Date</th>
                        <th className="px-1.5 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">Collected</th>
                        <th className="px-1.5 py-1.5 text-right font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">Amount</th>
                        <th className="px-1.5 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidInvoices.map((invoice, idx) => (
                        <tr key={invoice.invoice_reference_number} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} opacity-60`}>
                          <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-medium">#{invoice.invoice_reference_number}</span>
                              <a href={getAcumaticaInvoiceUrl(invoice.invoice_reference_number)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600"><ExternalLink className="w-2.5 h-2.5" /></a>
                            </div>
                          </td>
                          <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Paid</span></td>
                          <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">{invoice.date ? formatDate(invoice.date) : '-'}</td>
                          <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">{invoice.due_date ? formatDate(invoice.due_date) : '-'}</td>
                          <td className="px-1.5 py-1 border-r border-gray-100 whitespace-nowrap">{invoice.collection_date ? <span className="text-green-600">{formatDate(invoice.collection_date)}</span> : '-'}</td>
                          <td className="px-1.5 py-1 border-r border-gray-100 text-right whitespace-nowrap">${(invoice.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-1.5 py-1 text-right whitespace-nowrap text-green-700 font-medium">${(invoice.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
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
    </>
  );
}
