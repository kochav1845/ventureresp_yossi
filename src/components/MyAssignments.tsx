import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Ticket, FileText, Calendar, DollarSign, MessageSquare, ArrowLeft } from 'lucide-react';
import InvoiceMemoModal from './InvoiceMemoModal';

interface Assignment {
  assignment_id: string;
  invoice_reference_number: string;
  ticket_id: string | null;
  ticket_number: string | null;
  ticket_status: string | null;
  ticket_priority: string | null;
  customer: string;
  customer_name: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  invoice_status: string;
  color_status: string | null;
  description: string;
  assignment_notes: string;
}

interface TicketGroup {
  ticket_id: string;
  ticket_number: string;
  ticket_status: string;
  ticket_priority: string;
  customer_id: string;
  customer_name: string;
  invoices: Assignment[];
}

interface CustomerAssignment {
  assignment_id: string;
  customer_id: string;
  customer_name: string;
  customer_balance: number;
  notes: string;
  assigned_at: string;
}

interface MyAssignmentsProps {
  onBack?: () => void;
}

export default function MyAssignments({ onBack }: MyAssignmentsProps) {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<TicketGroup[]>([]);
  const [individualAssignments, setIndividualAssignments] = useState<Assignment[]>([]);
  const [customerAssignments, setCustomerAssignments] = useState<CustomerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<'tickets' | 'individual' | 'customers'>('tickets');
  const [memoModalInvoice, setMemoModalInvoice] = useState<any>(null);

  useEffect(() => {
    if (user && profile) {
      loadAssignments();
    }
  }, [user, profile]);

  const loadAssignments = async () => {
    if (!user || !profile) {
      return;
    }

    const collectorId = profile.id;

    setLoading(true);
    try {
      // Load invoice assignments
      const { data: assignments, error } = await supabase
        .from('collector_assignment_details')
        .select('*')
        .eq('assigned_collector_id', collectorId);

      if (error) {
        console.error('Error loading assignments:', error);
        throw error;
      }

      if (assignments) {
        const ticketGroups = new Map<string, TicketGroup>();
        const individualList: Assignment[] = [];

        assignments.forEach((assignment: Assignment) => {
          if (assignment.ticket_id) {
            if (!ticketGroups.has(assignment.ticket_id)) {
              ticketGroups.set(assignment.ticket_id, {
                ticket_id: assignment.ticket_id,
                ticket_number: assignment.ticket_number || '',
                ticket_status: assignment.ticket_status || '',
                ticket_priority: assignment.ticket_priority || '',
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

        setTickets(Array.from(ticketGroups.values()));
        setIndividualAssignments(individualList);
      }

      // Load customer assignments
      const { data: custAssignments, error: custError } = await supabase
        .from('collector_customer_assignment_details')
        .select('*')
        .eq('assigned_collector_id', collectorId);

      if (custError) {
        console.error('Error loading customer assignments:', custError);
      } else if (custAssignments) {
        setCustomerAssignments(custAssignments);
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getColorStatusStyle = (colorStatus: string | null) => {
    switch (colorStatus) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'orange':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return '';
    }
  };

  const getColorStatusLabel = (colorStatus: string | null) => {
    switch (colorStatus) {
      case 'green':
        return 'Will Pay';
      case 'orange':
        return 'Will Take Care';
      case 'red':
        return 'Will Not Pay';
      default:
        return null;
    }
  };

  const handleOpenMemo = async (invoice: Assignment) => {
    try {
      const { data: invoiceData, error } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, customer, customer_name, date, balance, status')
        .eq('reference_number', invoice.invoice_reference_number)
        .maybeSingle();

      if (error) {
        console.error('Error fetching invoice:', error);
        alert('Failed to load invoice details');
        return;
      }

      if (!invoiceData) {
        alert('Invoice not found in database');
        return;
      }

      setMemoModalInvoice(invoiceData);
    } catch (err) {
      console.error('Error in handleOpenMemo:', err);
      alert('Failed to open memo');
    }
  };

  const calculateTotalBalance = (invoices: Assignment[]) => {
    return invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading assignments...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Assignments</h1>
        <p className="text-gray-600">Collection tickets and invoices assigned to you</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setSelectedView('tickets')}
              className={`px-6 py-3 font-medium ${
                selectedView === 'tickets'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4" />
                <span>Collection Tickets ({tickets.length})</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedView('individual')}
              className={`px-6 py-3 font-medium ${
                selectedView === 'individual'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>Individual Invoices ({individualAssignments.length})</span>
              </div>
            </button>
            <button
              onClick={() => setSelectedView('customers')}
              className={`px-6 py-3 font-medium ${
                selectedView === 'customers'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>Assigned Customers ({customerAssignments.length})</span>
              </div>
            </button>
          </div>
        </div>

        <div className="p-6">
          {selectedView === 'tickets' ? (
            <div className="space-y-6">
              {tickets.length === 0 ? (
                <div className="text-center py-12">
                  <Ticket className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No tickets assigned to you</p>
                </div>
              ) : (
                tickets.map(ticket => (
                  <div
                    key={ticket.ticket_id}
                    className="border-2 border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className={`p-4 border-b-2 ${getPriorityColor(ticket.ticket_priority)}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Ticket className="w-5 h-5" />
                          <span className="font-mono font-bold text-lg">
                            {ticket.ticket_number}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(ticket.ticket_status)}`}>
                            {ticket.ticket_status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-semibold">
                          Priority: {ticket.ticket_priority.toUpperCase()}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {ticket.customer_name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Customer ID: {ticket.customer_id}
                      </p>
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
                          <div
                            key={invoice.invoice_reference_number}
                            className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="font-mono font-semibold text-gray-900">
                                    #{invoice.invoice_reference_number}
                                  </span>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    invoice.invoice_status === 'Open'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {invoice.invoice_status}
                                  </span>
                                  {invoice.color_status && (
                                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getColorStatusStyle(invoice.color_status)}`}>
                                      {getColorStatusLabel(invoice.color_status)}
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <DollarSign className="w-4 h-4" />
                                    <span>Balance: ${invoice.balance.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleOpenMemo(invoice)}
                                className="ml-4 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                title="View/Add Notes"
                              >
                                <MessageSquare className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : selectedView === 'individual' ? (
            <div className="space-y-4">
              {individualAssignments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No individual invoices assigned to you</p>
                </div>
              ) : (
                individualAssignments.map(invoice => (
                  <div
                    key={invoice.invoice_reference_number}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono font-semibold text-lg text-gray-900">
                            Invoice #{invoice.invoice_reference_number}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            invoice.invoice_status === 'Open'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {invoice.invoice_status}
                          </span>
                          {invoice.color_status && (
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${getColorStatusStyle(invoice.color_status)}`}>
                              {getColorStatusLabel(invoice.color_status)}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {invoice.customer_name}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                          Customer ID: {invoice.customer}
                        </p>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Invoice Date</p>
                            <p className="font-medium text-gray-900">
                              {new Date(invoice.date).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Due Date</p>
                            <p className="font-medium text-gray-900">
                              {new Date(invoice.due_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Balance Due</p>
                            <p className="font-bold text-red-600 text-lg">
                              ${invoice.balance.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        {invoice.assignment_notes && (
                          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-gray-700 italic">{invoice.assignment_notes}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleOpenMemo(invoice)}
                        className="ml-4 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        title="View/Add Notes"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {customerAssignments.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No customers assigned to you</p>
                </div>
              ) : (
                customerAssignments.map(customer => (
                  <div
                    key={customer.assignment_id}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-bold text-xl text-gray-900">
                            {customer.customer_name}
                          </h3>
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                            Customer Assignment
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                          Customer ID: <span className="font-mono font-medium">{customer.customer_id}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Total Balance</p>
                            <p className="text-2xl font-bold text-red-600">
                              ${(customer.customer_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Assigned On</p>
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(customer.assigned_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {customer.notes && (
                          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm font-medium text-gray-700 mb-1">Assignment Notes:</p>
                            <p className="text-sm text-gray-700 italic">{customer.notes}</p>
                          </div>
                        )}
                        <div className="mt-4">
                          <p className="text-xs text-gray-500">
                            Manage all invoices for this customer through the customer detail page
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {memoModalInvoice && (
        <InvoiceMemoModal
          invoice={memoModalInvoice}
          onClose={() => {
            setMemoModalInvoice(null);
            loadAssignments();
          }}
        />
      )}
    </div>
  );
}
