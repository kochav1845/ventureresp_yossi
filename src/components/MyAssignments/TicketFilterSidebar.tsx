import { useState, useEffect } from 'react';
import {
  Search, X, Filter, Calendar, AlertTriangle, DollarSign, Clock,
  FileText, Users, ChevronDown, ChevronUp, RotateCcw, Hash
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface TicketAdvancedFilters {
  searchTerm: string;
  status: string;
  priority: string;
  ticketType: string;
  dateFrom: string;
  dateTo: string;
  assignedTo: string;
  brokenPromise: boolean;
  // Advanced invoice-based filters
  minTotalBalance: string;
  maxTotalBalance: string;
  minSingleInvoice: string;
  maxSingleInvoice: string;
  minInvoiceCount: string;
  maxInvoiceCount: string;
  minDaysOpen: string;
  maxDaysOpen: string;
  minCustomerBalance: string;
  maxCustomerBalance: string;
  minDaysOverdue: string;
  maxDaysOverdue: string;
  hasNotes: string;
  hasMemos: string;
  dueDateFrom: string;
  dueDateTo: string;
  promiseDateFrom: string;
  promiseDateTo: string;
}

export const emptyFilters: TicketAdvancedFilters = {
  searchTerm: '',
  status: '',
  priority: '',
  ticketType: '',
  dateFrom: '',
  dateTo: '',
  assignedTo: '',
  brokenPromise: false,
  minTotalBalance: '',
  maxTotalBalance: '',
  minSingleInvoice: '',
  maxSingleInvoice: '',
  minInvoiceCount: '',
  maxInvoiceCount: '',
  minDaysOpen: '',
  maxDaysOpen: '',
  minCustomerBalance: '',
  maxCustomerBalance: '',
  minDaysOverdue: '',
  maxDaysOverdue: '',
  hasNotes: '',
  hasMemos: '',
  dueDateFrom: '',
  dueDateTo: '',
  promiseDateFrom: '',
  promiseDateTo: '',
};

interface TicketFilterSidebarProps {
  filters: TicketAdvancedFilters;
  onFiltersChange: (filters: TicketAdvancedFilters) => void;
  showAssignedToFilter?: boolean;
  ticketCount: number;
  totalBalance: number;
}

export default function TicketFilterSidebar({
  filters,
  onFiltersChange,
  showAssignedToFilter = false,
  ticketCount,
  totalBalance
}: TicketFilterSidebarProps) {
  const [ticketTypes, setTicketTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [statusOptions, setStatusOptions] = useState<Array<{ status_name: string; display_name: string; color_class: string }>>([]);
  const [collectors, setCollectors] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadTicketTypes();
    loadStatusOptions();
    if (showAssignedToFilter) {
      loadCollectors();
    }
  }, [showAssignedToFilter]);

  const loadTicketTypes = async () => {
    const { data } = await supabase
      .from('ticket_type_options')
      .select('value, label')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    setTicketTypes(data || []);
  };

  const loadStatusOptions = async () => {
    const { data } = await supabase
      .from('ticket_status_options')
      .select('status_name, display_name, color_class')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setStatusOptions(data || []);
  };

  const loadCollectors = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .eq('account_status', 'approved')
      .order('full_name', { ascending: true });
    setCollectors(data || []);
  };

  const handleChange = (key: keyof TicketAdvancedFilters, value: string | boolean) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange(emptyFilters);
  };

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === 'brokenPromise') return v === true;
    return v !== '';
  });

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'brokenPromise') return v === true;
    return v !== '';
  }).length;

  return (
    <div className="w-full h-full flex flex-col bg-white border-r border-gray-200 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            Filters
          </h3>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
            >
              <RotateCcw className="w-3 h-3" />
              Clear All
            </button>
          )}
        </div>
        {activeFilterCount > 0 && (
          <div className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded font-medium">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </div>
        )}
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={filters.searchTerm}
            onChange={(e) => handleChange('searchTerm', e.target.value)}
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {filters.searchTerm && (
            <button
              onClick={() => handleChange('searchTerm', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Basic Filters */}
      <div className="p-4 space-y-4 border-b border-gray-100">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Status</label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
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
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Priority</label>
          <select
            value={filters.priority}
            onChange={(e) => handleChange('priority', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Ticket Type</label>
          <select
            value={filters.ticketType}
            onChange={(e) => handleChange('ticketType', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            {ticketTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {showAssignedToFilter && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Assigned To</label>
            <select
              value={filters.assignedTo}
              onChange={(e) => handleChange('assignedTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Collectors</option>
              {collectors.map((collector) => (
                <option key={collector.id} value={collector.id}>
                  {collector.full_name || collector.email}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => handleChange('brokenPromise', !filters.brokenPromise)}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            filters.brokenPromise
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Broken Promise
        </button>
      </div>

      {/* Date Filters */}
      <div className="p-4 space-y-3 border-b border-gray-100">
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          Created Date
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
            title="From"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
            title="To"
          />
        </div>

        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1 mt-3">
          <Calendar className="w-3.5 h-3.5" />
          Due Date
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={filters.dueDateFrom}
            onChange={(e) => handleChange('dueDateFrom', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
            title="From"
          />
          <input
            type="date"
            value={filters.dueDateTo}
            onChange={(e) => handleChange('dueDateTo', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
            title="To"
          />
        </div>

        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1 mt-3">
          <Calendar className="w-3.5 h-3.5" />
          Promise Date
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={filters.promiseDateFrom}
            onChange={(e) => handleChange('promiseDateFrom', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
            title="From"
          />
          <input
            type="date"
            value={filters.promiseDateTo}
            onChange={(e) => handleChange('promiseDateTo', e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
            title="To"
          />
        </div>
      </div>

      {/* Advanced Filters Toggle */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-4 flex items-center justify-between text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            Advanced Filters
          </span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="px-4 pb-4 space-y-4">
            {/* Total Ticket Balance */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Total Ticket Balance
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minTotalBalance}
                  onChange={(e) => handleChange('minTotalBalance', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxTotalBalance}
                  onChange={(e) => handleChange('maxTotalBalance', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Single Invoice Amount */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Has Invoice Over
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minSingleInvoice}
                  onChange={(e) => handleChange('minSingleInvoice', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxSingleInvoice}
                  onChange={(e) => handleChange('maxSingleInvoice', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Invoice Count */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Hash className="w-3 h-3" />
                Invoice Count
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minInvoiceCount}
                  onChange={(e) => handleChange('minInvoiceCount', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxInvoiceCount}
                  onChange={(e) => handleChange('maxInvoiceCount', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Days Open */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Days Open
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minDaysOpen}
                  onChange={(e) => handleChange('minDaysOpen', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxDaysOpen}
                  onChange={(e) => handleChange('maxDaysOpen', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Customer Open Balance */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Customer Open Balance
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minCustomerBalance}
                  onChange={(e) => handleChange('minCustomerBalance', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxCustomerBalance}
                  onChange={(e) => handleChange('maxCustomerBalance', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Days Overdue (oldest invoice) */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Days Overdue (oldest)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minDaysOverdue}
                  onChange={(e) => handleChange('minDaysOverdue', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxDaysOverdue}
                  onChange={(e) => handleChange('maxDaysOverdue', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Has Notes / Memos */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Has Notes</label>
                <select
                  value={filters.hasNotes}
                  onChange={(e) => handleChange('hasNotes', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Has Memos</label>
                <select
                  value={filters.hasMemos}
                  onChange={(e) => handleChange('hasMemos', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Summary */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 mt-auto">
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Tickets shown:</span>
            <span className="font-bold text-gray-900">{ticketCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Total balance:</span>
            <span className="font-bold text-red-600">
              ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
