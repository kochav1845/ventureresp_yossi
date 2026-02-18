import { Search, X, Filter, Calendar, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface TicketSearchFilterProps {
  filters?: TicketFilters;
  onFilterChange?: (filters: TicketFilters) => void;
  onFiltersChange?: (filters: TicketFilters) => void;
  showAdvancedFilters?: boolean;
  showAssignedToFilter?: boolean;
}

export interface TicketFilters {
  searchTerm: string;
  status: string;
  priority: string;
  ticketType: string;
  dateFrom: string;
  dateTo: string;
  assignedTo: string;
  brokenPromise: boolean;
}

export default function TicketSearchFilter({
  filters: controlledFilters,
  onFilterChange,
  onFiltersChange,
  showAdvancedFilters = false,
  showAssignedToFilter = false
}: TicketSearchFilterProps) {
  const [internalFilters, setInternalFilters] = useState<TicketFilters>({
    searchTerm: '',
    status: '',
    priority: '',
    ticketType: '',
    dateFrom: '',
    dateTo: '',
    assignedTo: '',
    brokenPromise: false
  });

  const filters = controlledFilters || internalFilters;
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedFilters);
  const [ticketTypes, setTicketTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [statusOptions, setStatusOptions] = useState<Array<{ status_name: string; display_name: string }>>([]);
  const [collectors, setCollectors] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  useEffect(() => {
    loadTicketTypes();
    loadStatusOptions();
    if (showAssignedToFilter) {
      loadCollectors();
    }
  }, [showAssignedToFilter]);

  const loadTicketTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_type_options')
        .select('value, label')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTicketTypes(data || []);
    } catch (error) {
      console.error('Error loading ticket types:', error);
    }
  };

  const loadStatusOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_status_options')
        .select('status_name, display_name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setStatusOptions(data || []);
    } catch (error) {
      console.error('Error loading status options:', error);
    }
  };

  const loadCollectors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .eq('account_status', 'approved')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setCollectors(data || []);
    } catch (error) {
      console.error('Error loading collectors:', error);
    }
  };

  const handleFilterChange = (key: keyof TicketFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };

    if (!controlledFilters) {
      setInternalFilters(newFilters);
    }

    if (onFilterChange) {
      onFilterChange(newFilters);
    }
    if (onFiltersChange) {
      onFiltersChange(newFilters);
    }
  };

  const clearFilters = () => {
    const emptyFilters: TicketFilters = {
      searchTerm: '',
      status: '',
      priority: '',
      ticketType: '',
      dateFrom: '',
      dateTo: '',
      assignedTo: '',
      brokenPromise: false
    };

    if (!controlledFilters) {
      setInternalFilters(emptyFilters);
    }

    if (onFilterChange) {
      onFilterChange(emptyFilters);
    }
    if (onFiltersChange) {
      onFiltersChange(emptyFilters);
    }
  };

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => k === 'brokenPromise' ? v === true : v !== '');

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 shadow-sm">
      <div className="flex flex-col gap-4">
        {/* Main Search Bar */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by ticket number, customer name, customer ID, invoice number, notes..."
              value={filters.searchTerm}
              onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-4 py-2 flex items-center gap-2 rounded-lg border transition-colors ${
              showAdvanced
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Statuses</option>
                {statusOptions.map((option) => (
                  <option key={option.status_name} value={option.status_name}>
                    {option.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => handleFilterChange('priority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ticket Type</label>
              <select
                value={filters.ticketType}
                onChange={(e) => handleFilterChange('ticketType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Types</option>
                {ticketTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Created From
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Created To
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            {showAssignedToFilter && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Assigned To</label>
                <select
                  value={filters.assignedTo}
                  onChange={(e) => handleFilterChange('assignedTo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">All Collectors</option>
                  {collectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.full_name} ({collector.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end">
              <button
                onClick={() => {
                  const newFilters = { ...filters, brokenPromise: !filters.brokenPromise };
                  if (!controlledFilters) setInternalFilters(newFilters);
                  if (onFilterChange) onFilterChange(newFilters);
                  if (onFiltersChange) onFiltersChange(newFilters);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  filters.brokenPromise
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Broken Promise
              </button>
            </div>
          </div>
        )}

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500">Active filters:</span>
            {filters.searchTerm && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Search: {filters.searchTerm}
                <button onClick={() => handleFilterChange('searchTerm', '')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.status && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Status: {filters.status}
                <button onClick={() => handleFilterChange('status', '')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.priority && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Priority: {filters.priority}
                <button onClick={() => handleFilterChange('priority', '')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.ticketType && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Type: {filters.ticketType}
                <button onClick={() => handleFilterChange('ticketType', '')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Date: {filters.dateFrom || 'start'} to {filters.dateTo || 'end'}
                <button onClick={() => {
                  handleFilterChange('dateFrom', '');
                  handleFilterChange('dateTo', '');
                }} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.assignedTo && showAssignedToFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                Assigned to: {collectors.find(c => c.id === filters.assignedTo)?.full_name || filters.assignedTo}
                <button onClick={() => handleFilterChange('assignedTo', '')} className="hover:text-blue-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.brokenPromise && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                <AlertTriangle className="w-3 h-3" />
                Broken Promise
                <button onClick={() => {
                  const newFilters = { ...filters, brokenPromise: false };
                  if (!controlledFilters) setInternalFilters(newFilters);
                  if (onFilterChange) onFilterChange(newFilters);
                  if (onFiltersChange) onFiltersChange(newFilters);
                }} className="hover:text-red-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function to filter tickets based on all criteria
export function filterTickets<T extends {
  ticket_number?: string;
  customer_id?: string;
  customer_name?: string;
  collector_name?: string;
  collector_email?: string;
  assigned_collector_id?: string | null;
  status?: string;
  priority?: string;
  ticket_type?: string;
  ticket_status?: string;
  created_at?: string;
  notes?: string;
  invoices?: Array<{ invoice_reference_number?: string; color_status?: string | null; promise_date?: string | null }>;
  invoice_reference_number?: string;
  last_note?: { note_text: string };
  last_memo?: { memo_text: string };
  promise_date?: string | null;
}>(tickets: T[], filters: TicketFilters): T[] {
  return tickets.filter(ticket => {
    // Search term - check multiple fields
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const matches = [
        ticket.ticket_number?.toLowerCase().includes(searchLower),
        ticket.customer_id?.toLowerCase().includes(searchLower),
        ticket.customer_name?.toLowerCase().includes(searchLower),
        ticket.collector_name?.toLowerCase().includes(searchLower),
        ticket.collector_email?.toLowerCase().includes(searchLower),
        ticket.notes?.toLowerCase().includes(searchLower),
        ticket.invoice_reference_number?.toLowerCase().includes(searchLower),
        ticket.last_note?.note_text?.toLowerCase().includes(searchLower),
        ticket.last_memo?.memo_text?.toLowerCase().includes(searchLower),
        // Check invoice numbers in ticket
        ticket.invoices?.some(inv =>
          inv.invoice_reference_number?.toLowerCase().includes(searchLower)
        )
      ].some(match => match);

      if (!matches) return false;
    }

    // Status filter
    if (filters.status && ticket.status !== filters.status) {
      return false;
    }

    // Priority filter
    if (filters.priority && ticket.priority !== filters.priority) {
      return false;
    }

    // Ticket type filter
    if (filters.ticketType && ticket.ticket_type !== filters.ticketType) {
      return false;
    }

    // Assigned collector filter
    if (filters.assignedTo && ticket.assigned_collector_id !== filters.assignedTo) {
      return false;
    }

    // Broken promise filter
    if (filters.brokenPromise) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const ticketStatus = ticket.ticket_status || ticket.status;
      const ticketPromiseBroken = ticketStatus === 'promised' &&
        ticket.promise_date &&
        new Date(ticket.promise_date) < now;

      const hasInvoiceBrokenPromise = ticket.invoices?.some(inv => {
        if (inv.color_status !== 'green' || !inv.promise_date) return false;
        return new Date(inv.promise_date) < now;
      });

      if (!ticketPromiseBroken && !hasInvoiceBrokenPromise) return false;
    }

    // Date range filter
    if (filters.dateFrom && ticket.created_at) {
      const ticketDate = new Date(ticket.created_at).setHours(0, 0, 0, 0);
      const fromDate = new Date(filters.dateFrom).setHours(0, 0, 0, 0);
      if (ticketDate < fromDate) return false;
    }

    if (filters.dateTo && ticket.created_at) {
      const ticketDate = new Date(ticket.created_at).setHours(23, 59, 59, 999);
      const toDate = new Date(filters.dateTo).setHours(23, 59, 59, 999);
      if (ticketDate > toDate) return false;
    }

    return true;
  });
}
