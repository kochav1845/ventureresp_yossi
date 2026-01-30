import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, X, Ticket, User, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

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
  created_at: string;
  updated_at: string;
  assigned_at?: string;
  assigned_by?: string;
  invoice_count?: number;
  collector_email?: string;
  assigner_email?: string;
}

export default function CollectionTicketing({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
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
  const [notes, setNotes] = useState<string>('');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'latest' | 'oldest' | 'highest'>('all');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string>('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCustomers();
    loadCollectors();
    loadTickets();
  }, []);

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

      console.log('Loaded customers:', allCustomers.length);
      setCustomers(allCustomers);
    } catch (err) {
      console.error('Exception loading customers:', err);
    }
  };

  const loadCollectors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, role')
        .in('role', ['collector', 'admin', 'manager'])
        .order('email');

      if (error) {
        console.error('Error loading collectors:', error);
        setError('Failed to load collectors');
      } else {
        console.log('Loaded collectors (including admins/managers):', data?.length);
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

      console.log('Raw tickets data:', ticketsData);

      if (!ticketsData || ticketsData.length === 0) {
        console.log('No tickets found');
        setTickets([]);
        return;
      }

      const enrichedTickets = await Promise.all(
        ticketsData.map(async (ticket) => {
          const { data: invoiceCount } = await supabase
            .from('ticket_invoices')
            .select('id', { count: 'exact', head: true })
            .eq('ticket_id', ticket.id);

          const { data: collectorData } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('id', ticket.assigned_collector_id)
            .single();

          let assignerEmail = null;
          if (ticket.assigned_by) {
            const { data: assignerData } = await supabase
              .from('user_profiles')
              .select('email')
              .eq('id', ticket.assigned_by)
              .single();
            assignerEmail = assignerData?.email;
          }

          return {
            ...ticket,
            invoice_count: invoiceCount || 0,
            collector_email: collectorData?.email || 'Unassigned',
            assigner_email: assignerEmail
          };
        })
      );

      console.log('Enriched tickets:', enrichedTickets);
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

  const handleCreateTicket = async () => {
    if (!selectedCustomer || !selectedCollector || selectedInvoices.length === 0) {
      alert('Please select a customer, collector, and at least one invoice');
      return;
    }

    setLoading(true);
    try {
      if (!profile) throw new Error('Not authenticated');

      const customer = customers.find(c => c.customer_id === selectedCustomer);

      const { data: ticket, error: ticketError } = await supabase
        .from('collection_tickets')
        .insert({
          customer_id: selectedCustomer,
          customer_name: customer?.customer_name || '',
          assigned_collector_id: selectedCollector,
          status: 'open',
          priority,
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

  const toggleInvoiceSelection = (invoiceRef: string) => {
    setSelectedInvoices(prev =>
      prev.includes(invoiceRef)
        ? prev.filter(ref => ref !== invoiceRef)
        : [...prev, invoiceRef]
    );
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
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
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
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono font-semibold text-gray-900">
                              {ticket.ticket_number}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                              {ticket.status.replace('_', ' ')}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                              {ticket.priority}
                            </span>
                          </div>
                          <h3 className="font-semibold text-lg text-gray-900 mb-1">
                            {ticket.customer_name}
                          </h3>
                          <p className="text-sm text-gray-500 mb-2">
                            Customer ID: {ticket.customer_id}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <User className="w-4 h-4" />
                              <span>{ticket.collector_email}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <AlertCircle className="w-4 h-4" />
                              <span>{ticket.invoice_count} invoices</span>
                            </div>
                          </div>
                          {ticket.notes && (
                            <p className="mt-2 text-sm text-gray-600 italic">
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
                {/* Setup Status */}
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

                {/* System Stats */}
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
                        {collector.email} - {collector.role.charAt(0).toUpperCase() + collector.role.slice(1)}
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
      </div>
    </div>
  );
}
