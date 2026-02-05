import { Search, X, Filter, Calendar } from 'lucide-react';
import { useState } from 'react';

interface TicketSearchFilterProps {
  onFilterChange: (filters: TicketFilters) => void;
  showAdvancedFilters?: boolean;
}

export interface TicketFilters {
  searchTerm: string;
  status: string;
  priority: string;
  ticketType: string;
  dateFrom: string;
  dateTo: string;
  assignedTo: string;
}

export default function TicketSearchFilter({ onFilterChange, showAdvancedFilters = false }: TicketSearchFilterProps) {
  const [filters, setFilters] = useState<TicketFilters>({
    searchTerm: '',
    status: '',
    priority: '',
    ticketType: '',
    dateFrom: '',
    dateTo: '',
    assignedTo: ''
  });
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedFilters);

  const handleFilterChange = (key: keyof TicketFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: TicketFilters = {
      searchTerm: '',
      status: '',
      priority: '',
      ticketType: '',
      dateFrom: '',
      dateTo: '',
      assignedTo: ''
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

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
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="pending">Pending</option>
                <option value="promised">Promised</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
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
                <option value="overdue payment">Overdue Payment</option>
                <option value="dispute">Dispute</option>
                <option value="follow up">Follow Up</option>
                <option value="payment plan">Payment Plan</option>
                <option value="other">Other</option>
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
  status?: string;
  priority?: string;
  ticket_type?: string;
  created_at?: string;
  notes?: string;
  invoices?: Array<{ invoice_reference_number?: string }>;
  invoice_reference_number?: string;
  last_note?: { note_text: string };
  last_memo?: { memo_text: string };
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
