import { useState } from 'react';
import {
  Search, X, ArrowUpDown, DollarSign, FileText, Users, Clock,
  CheckSquare, Square, Loader2, Send, Filter, RotateCcw, AlertTriangle, TrendingDown
} from 'lucide-react';
import { useCustomerStatements } from './useCustomerStatements';
import CustomerStatementCard from './CustomerStatementCard';
import StatementActions from './StatementActions';
import StatementAutoSendRules from './StatementAutoSendRules';
import type { SortField } from './types';

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

type TabView = 'statements' | 'auto-rules';

export default function CustomerStatements() {
  const [activeTab, setActiveTab] = useState<TabView>('statements');

  const {
    customers, loading, loadingMore, totalLoaded, loadingInvoices, templates, selectedTemplateId, setSelectedTemplateId,
    selectedIds, toggleCustomer, selectAll, deselectAll,
    search, setSearch, minBalance, setMinBalance,
    sortField, setSortField, sortOrder, setSortOrder,
    expandedId, toggleExpand,
    ensureInvoicesLoaded,
  } = useCustomerStatements();

  const selectedCustomers = customers.filter(c => selectedIds.has(c.customer_id));
  const totalBalance = customers.reduce((s, c) => s + c.total_balance, 0);
  const totalInvoices = customers.reduce((s, c) => s + c.open_invoice_count, 0);
  const overdueCount = customers.filter(c => c.max_days_overdue > 30).length;

  const hasActiveFilters = search.trim() !== '' || minBalance > 0;

  const clearFilters = () => {
    setSearch('');
    setMinBalance(0);
  };

  if (loading && customers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading customer data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Statements</h1>
            <p className="text-sm text-gray-500 mt-0.5">Send and manage customer balance statements</p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('statements')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'statements'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Statements
            </button>
            <button
              onClick={() => setActiveTab('auto-rules')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'auto-rules'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Send className="w-4 h-4" />
              Auto Send Rules
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'auto-rules' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <StatementAutoSendRules templates={templates} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Filters */}
          <div className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
            {/* Filter Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  Filters
                </h3>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Name, ID, email..."
                  className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Min Balance */}
            <div className="p-4 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Minimum Balance</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="number"
                  value={minBalance || ''}
                  onChange={e => setMinBalance(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Sort */}
            <div className="p-4 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Sort By</label>
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 mb-2"
              >
                <option value="name">Customer Name</option>
                <option value="balance">Balance</option>
                <option value="invoices">Invoice Count</option>
                <option value="overdue">Days Overdue</option>
              </select>
              <button
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              </button>
            </div>

            {/* Selection */}
            <div className="p-4 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Selection</label>
              <button
                onClick={() => selectedIds.size === customers.length ? deselectAll() : selectAll()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                {selectedIds.size === customers.length && customers.length > 0
                  ? <><CheckSquare className="w-4 h-4" /> Deselect All</>
                  : <><Square className="w-4 h-4" /> Select All ({customers.length})</>
                }
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={deselectAll}
                  className="w-full mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors text-center"
                >
                  Clear {selectedIds.size} selected
                </button>
              )}
            </div>

            {/* Analytics at Bottom */}
            <div className="mt-auto p-4 bg-gray-50 border-t border-gray-200 space-y-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Summary</h4>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Users className="w-3.5 h-3.5 text-blue-500" />
                    Customers
                  </span>
                  <span className="text-sm font-bold text-gray-900">{customers.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <DollarSign className="w-3.5 h-3.5 text-red-500" />
                    Total Balance
                  </span>
                  <span className="text-sm font-bold text-red-600">{fmtCurrency(totalBalance)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    Open Invoices
                  </span>
                  <span className="text-sm font-bold text-gray-900">{totalInvoices.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Overdue 30+
                  </span>
                  <span className="text-sm font-bold text-amber-600">{overdueCount}</span>
                </div>
                {selectedIds.size > 0 && (
                  <div className="pt-2 mt-2 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-blue-600 font-medium">Selected</span>
                      <span className="text-sm font-bold text-blue-700">{selectedIds.size}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-blue-600 font-medium">Selected Balance</span>
                      <span className="text-sm font-bold text-blue-700">
                        {fmtCurrency(selectedCustomers.reduce((s, c) => s + c.total_balance, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Actions Bar */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3">
              <StatementActions
                selectedCustomers={selectedCustomers}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onTemplateChange={setSelectedTemplateId}
                ensureInvoicesLoaded={ensureInvoicesLoaded}
              />
            </div>

            {/* Customer List */}
            <div className="p-6 space-y-3" data-tour="statement-list">
              {customers.map(customer => (
                <CustomerStatementCard
                  key={customer.customer_id}
                  customer={customer}
                  selected={selectedIds.has(customer.customer_id)}
                  expanded={expandedId === customer.customer_id}
                  loadingInvoices={loadingInvoices === customer.customer_id}
                  onToggleSelect={() => toggleCustomer(customer.customer_id)}
                  onToggleExpand={() => toggleExpand(customer.customer_id)}
                />
              ))}

              {loadingMore && (
                <div className="flex items-center justify-center py-4 bg-white rounded-xl border border-gray-200">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2" />
                  <p className="text-sm text-gray-500">
                    Loading more customers... ({totalLoaded} loaded so far)
                  </p>
                </div>
              )}

              {!loading && !loadingMore && customers.length === 0 && (
                <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-medium text-gray-700">No customers found</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {search ? 'Try adjusting your search or filters' : 'No customers with open balances'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
