import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, ExternalLink, Clock, AlertTriangle, Calendar } from 'lucide-react';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';
import { TicketGroup, Assignment, TicketStatusOption } from './types';
import { getPriorityColor, getStatusColor, calculateTotalBalance } from './utils';
import { getAcumaticaCustomerUrl } from '../../lib/acumaticaLinks';
import InvoiceItem from './InvoiceItem';
import TicketPromiseDateModal from './TicketPromiseDateModal';

interface TicketCardProps {
  ticket: TicketGroup;
  selectedInvoices: Set<string>;
  changingColorForInvoice: string | null;
  changingTicketStatus: string | null;
  statusOptions: TicketStatusOption[];
  onToggleInvoiceSelection: (refNumber: string) => void;
  onColorChange: (refNumber: string, color: string | null) => void;
  onToggleColorPicker: (refNumber: string | null) => void;
  onOpenMemo: (invoice: Assignment) => void;
  onTicketStatusChange: (ticketId: string, newStatus: string) => void;
  onPromiseDateSet: () => void;
}

export default function TicketCard({
  ticket,
  selectedInvoices,
  changingColorForInvoice,
  changingTicketStatus,
  statusOptions,
  onToggleInvoiceSelection,
  onColorChange,
  onToggleColorPicker,
  onOpenMemo,
  onTicketStatusChange,
  onPromiseDateSet
}: TicketCardProps) {
  const navigate = useNavigate();
  const [localTicketStatus, setLocalTicketStatus] = useState(ticket.ticket_status);
  const [showPromiseDateModal, setShowPromiseDateModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

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
    <div className="border-2 border-gray-200 rounded-lg hover:shadow-md transition-shadow">
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
          </div>
          <span className="text-sm font-semibold">
            Priority: {ticket.ticket_priority.toUpperCase()}
          </span>
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

        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => navigate(`/customers?customer=${ticket.customer_id}`)}
            className="text-xl font-bold text-blue-600 hover:text-blue-800 hover:underline"
          >
            {ticket.customer_name}
          </button>
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
        <p className="text-sm text-gray-600">
          Customer ID: {ticket.customer_id}
        </p>

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

        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-xs">
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
        </div>
      </div>

      <div className="p-4 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-700">
            Invoices ({ticket.invoices.length})
          </h4>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Outstanding</p>
            <p className="text-xl font-bold text-red-600">
              ${calculateTotalBalance(ticket.invoices).toFixed(2)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {ticket.invoices.map(invoice => (
            <InvoiceItem
              key={invoice.invoice_reference_number}
              invoice={invoice}
              isSelected={selectedInvoices.has(invoice.invoice_reference_number)}
              showColorPicker={changingColorForInvoice === invoice.invoice_reference_number}
              onToggleSelection={() => onToggleInvoiceSelection(invoice.invoice_reference_number)}
              onColorChange={(color) => onColorChange(invoice.invoice_reference_number, color)}
              onToggleColorPicker={() => onToggleColorPicker(
                changingColorForInvoice === invoice.invoice_reference_number ? null : invoice.invoice_reference_number
              )}
              onOpenMemo={() => onOpenMemo(invoice)}
            />
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
