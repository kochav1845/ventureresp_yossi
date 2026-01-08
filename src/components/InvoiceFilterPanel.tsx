import { useState, useEffect } from 'react';
import { Filter, Calendar, DollarSign, ChevronDown, ChevronUp, X, TrendingUp, TrendingDown, Clock, RotateCcw } from 'lucide-react';

interface InvoiceFilters {
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  colorStatus: string;
  invoiceStatus: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface InvoiceStats {
  highest_invoice_amount: number | null;
  highest_invoice_ref: string | null;
  lowest_invoice_amount: number | null;
  lowest_invoice_ref: string | null;
  avg_invoice_amount: number | null;
  oldest_unpaid_date: string | null;
  oldest_unpaid_ref: string | null;
  newest_unpaid_date: string | null;
  newest_unpaid_ref: string | null;
  most_overdue_days: number | null;
  most_overdue_ref: string | null;
}

interface FilteredStats {
  total_count: number;
  total_amount: number;
  total_balance: number;
}

interface InvoiceFilterPanelProps {
  filters: InvoiceFilters;
  onFiltersChange: (filters: InvoiceFilters) => void;
  stats: InvoiceStats | null;
  filteredStats: FilteredStats | null;
  activeTab: 'open-invoices' | 'paid-invoices' | 'payments';
  onQuickFilter: (type: string) => void;
}

export default function InvoiceFilterPanel({
  filters,
  onFiltersChange,
  stats,
  filteredStats,
  activeTab,
  onQuickFilter
}: InvoiceFilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  useEffect(() => {
    const active = !!(
      filters.dateFrom ||
      filters.dateTo ||
      filters.amountMin ||
      filters.amountMax ||
      filters.colorStatus ||
      filters.invoiceStatus
    );
    setHasActiveFilters(active);
  }, [filters]);

  const handleFilterChange = (key: keyof InvoiceFilters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleSortChange = (sortBy: string) => {
    if (filters.sortBy === sortBy) {
      onFiltersChange({
        ...filters,
        sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc'
      });
    } else {
      onFiltersChange({
        ...filters,
        sortBy,
        sortOrder: 'desc'
      });
    }
  };

  const clearAllFilters = () => {
    onFiltersChange({
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      colorStatus: '',
      invoiceStatus: '',
      sortBy: 'date',
      sortOrder: 'desc'
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (activeTab === 'payments') return null;

  return (
    <div className="mb-4">
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-3">
            <Filter className={`w-5 h-5 ${hasActiveFilters ? 'text-blue-600' : 'text-gray-500'}`} />
            <span className="font-medium text-gray-900">Advanced Filters</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                Active
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {stats && (
              <div className="mt-4 mb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <button
                  onClick={() => onQuickFilter('highest')}
                  className="p-3 bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-green-700">Highest Invoice</span>
                  </div>
                  <p className="text-sm font-bold text-green-900">{formatCurrency(stats.highest_invoice_amount)}</p>
                  {stats.highest_invoice_ref && (
                    <p className="text-xs text-green-600 mt-1">Ref: {stats.highest_invoice_ref}</p>
                  )}
                </button>

                <button
                  onClick={() => onQuickFilter('lowest')}
                  className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">Lowest Invoice</span>
                  </div>
                  <p className="text-sm font-bold text-blue-900">{formatCurrency(stats.lowest_invoice_amount)}</p>
                  {stats.lowest_invoice_ref && (
                    <p className="text-xs text-blue-600 mt-1">Ref: {stats.lowest_invoice_ref}</p>
                  )}
                </button>

                <button
                  onClick={() => onQuickFilter('oldest_unpaid')}
                  className="p-3 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-orange-600" />
                    <span className="text-xs font-medium text-orange-700">Oldest Unpaid</span>
                  </div>
                  <p className="text-sm font-bold text-orange-900">{formatDate(stats.oldest_unpaid_date)}</p>
                  {stats.oldest_unpaid_ref && (
                    <p className="text-xs text-orange-600 mt-1">Ref: {stats.oldest_unpaid_ref}</p>
                  )}
                </button>

                <button
                  onClick={() => onQuickFilter('newest_unpaid')}
                  className="p-3 bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-cyan-600" />
                    <span className="text-xs font-medium text-cyan-700">Newest Unpaid</span>
                  </div>
                  <p className="text-sm font-bold text-cyan-900">{formatDate(stats.newest_unpaid_date)}</p>
                  {stats.newest_unpaid_ref && (
                    <p className="text-xs text-cyan-600 mt-1">Ref: {stats.newest_unpaid_ref}</p>
                  )}
                </button>

                <button
                  onClick={() => onQuickFilter('most_overdue')}
                  className="p-3 bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-medium text-red-700">Most Overdue</span>
                  </div>
                  <p className="text-sm font-bold text-red-900">
                    {stats.most_overdue_days !== null ? `${stats.most_overdue_days} days` : 'N/A'}
                  </p>
                  {stats.most_overdue_ref && (
                    <p className="text-xs text-red-600 mt-1">Ref: {stats.most_overdue_ref}</p>
                  )}
                </button>

                <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">Average Invoice</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(stats.avg_invoice_amount)}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    value={filters.amountMin}
                    onChange={(e) => handleFilterChange('amountMin', e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    value={filters.amountMax}
                    onChange={(e) => handleFilterChange('amountMax', e.target.value)}
                    placeholder="No limit"
                    min="0"
                    step="0.01"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color Status</label>
                <select
                  value={filters.colorStatus}
                  onChange={(e) => handleFilterChange('colorStatus', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">All Colors</option>
                  <option value="red">Red - Won't Pay</option>
                  <option value="yellow">Yellow - Will Take Care</option>
                  <option value="green">Green - Will Pay</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Status</label>
                <select
                  value={filters.invoiceStatus}
                  onChange={(e) => handleFilterChange('invoiceStatus', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Balanced">Balanced</option>
                  <option value="Closed">Closed</option>
                  <option value="Voided">Voided</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <div className="flex gap-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="date">Invoice Date</option>
                    <option value="due_date">Due Date</option>
                    <option value="amount">Amount</option>
                    <option value="balance">Balance</option>
                    <option value="days_overdue">Days Overdue</option>
                    <option value="reference_number">Reference</option>
                  </select>
                  <button
                    onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                    className={`px-3 py-2 border rounded-lg transition-colors ${
                      filters.sortOrder === 'desc'
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-300 text-gray-700'
                    }`}
                    title={filters.sortOrder === 'desc' ? 'Descending' : 'Ascending'}
                  >
                    {filters.sortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Clear All Filters
                  </button>
                )}
              </div>

              {filteredStats && (
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-gray-600">
                    <span className="font-medium text-gray-900">{filteredStats.total_count}</span> invoices
                  </div>
                  <div className="text-gray-600">
                    Total: <span className="font-medium text-gray-900">{formatCurrency(filteredStats.total_amount)}</span>
                  </div>
                  <div className="text-gray-600">
                    Balance: <span className="font-medium text-red-600">{formatCurrency(filteredStats.total_balance)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
