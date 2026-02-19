import { useState, useEffect } from 'react';
import { Ticket, Calendar, Clock, ChevronDown, ChevronRight, FileText, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';

interface Invoice {
  reference_number: string;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  balance: number | null;
  status: string | null;
}

interface ClosedTicket {
  ticket_id: string;
  ticket_number: string;
  customer_name: string;
  ticket_type: string;
  priority: string;
  created_at: string;
  resolved_at: string | null;
  days_to_close: number;
  invoice_count: number;
  invoices: Invoice[];
}

interface Props {
  collectorId: string;
}

export default function CollectorClosedTickets({ collectorId }: Props) {
  const [tickets, setTickets] = useState<ClosedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  useEffect(() => {
    loadClosedTickets();
  }, [collectorId]);

  const loadClosedTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_collector_closed_tickets', {
        p_collector_id: collectorId
      });
      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      console.error('Error loading closed tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return '--';
    }
  };

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '--';
    try {
      return format(new Date(dateStr), 'M/d/yy');
    } catch {
      return '--';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="py-6 text-center">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-sm text-gray-500 mt-2">Loading closed tickets...</p>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-8">
        <Ticket className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">No closed tickets found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-lg text-gray-800">Closed Tickets</h4>
          <span className="px-2.5 py-0.5 rounded-full text-sm font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {tickets.length}
          </span>
        </div>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {tickets.map((ticket) => {
          const isOpen = expandedTicket === ticket.ticket_id;
          return (
            <div
              key={ticket.ticket_id}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors"
            >
              <button
                onClick={() => setExpandedTicket(isOpen ? null : ticket.ticket_id)}
                className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex-shrink-0 text-gray-400">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm text-gray-900">{ticket.ticket_number}</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {ticket.ticket_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 truncate">{ticket.customer_name}</p>
                </div>

                <div className="hidden sm:flex items-center gap-4 flex-shrink-0 text-xs text-gray-500">
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 mb-0.5">Created</p>
                    <p className="font-medium text-gray-700">{formatShortDate(ticket.created_at)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 mb-0.5">Closed</p>
                    <p className="font-medium text-gray-700">{formatShortDate(ticket.resolved_at)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 mb-0.5">Days</p>
                    <p className="font-semibold text-slate-700">{ticket.days_to_close}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400 mb-0.5">Invoices</p>
                    <p className="font-semibold text-slate-700">{ticket.invoice_count}</p>
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3">
                  <div className="sm:hidden grid grid-cols-4 gap-3 mb-3 pb-3 border-b border-gray-200">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">Created</p>
                      <p className="text-xs font-medium text-gray-700">{formatShortDate(ticket.created_at)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">Closed</p>
                      <p className="text-xs font-medium text-gray-700">{formatShortDate(ticket.resolved_at)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">Days</p>
                      <p className="text-xs font-semibold text-slate-700">{ticket.days_to_close}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400">Invoices</p>
                      <p className="text-xs font-semibold text-slate-700">{ticket.invoice_count}</p>
                    </div>
                  </div>

                  {ticket.invoices.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Invoice Details</p>
                      <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                        <div className="col-span-3">Reference</div>
                        <div className="col-span-2">Invoice Date</div>
                        <div className="col-span-2">Due Date</div>
                        <div className="col-span-2 text-right">Amount</div>
                        <div className="col-span-2 text-right">Balance</div>
                        <div className="col-span-1 text-right">Status</div>
                      </div>
                      {ticket.invoices.map((inv, idx) => (
                        <div
                          key={idx}
                          className="bg-white rounded-lg border border-gray-200 px-3 py-2.5"
                        >
                          <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-3">
                              <span className="font-mono text-sm font-medium text-gray-900">{inv.reference_number}</span>
                            </div>
                            <div className="col-span-2">
                              <div className="flex items-center gap-1.5 text-sm text-gray-700">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                {formatDate(inv.invoice_date)}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                {formatDate(inv.due_date)}
                              </div>
                            </div>
                            <div className="col-span-2 text-right">
                              <span className="text-sm font-medium text-gray-800">
                                ${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="col-span-2 text-right">
                              <span className={`text-sm font-medium ${(inv.balance || 0) === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${(inv.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="col-span-1 text-right">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                inv.status === 'Closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {inv.status || '--'}
                              </span>
                            </div>
                          </div>

                          <div className="sm:hidden space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm font-medium text-gray-900">{inv.reference_number}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                inv.status === 'Closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {inv.status || '--'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-600">
                              <span>Date: {formatShortDate(inv.invoice_date)}</span>
                              <span>Due: {formatShortDate(inv.due_date)}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-gray-600">Amt: ${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                              <span className={(inv.balance || 0) === 0 ? 'text-green-600' : 'text-red-600'}>
                                Bal: ${(inv.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No invoices linked to this ticket</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
