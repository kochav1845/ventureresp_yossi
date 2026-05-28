import { useState } from 'react';
import { Search, X, ArrowUpDown, DollarSign, FileText, Users, Clock, CheckSquare, Square, Loader2, Send, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
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
  const avgDaysOverdue = customers.length > 0
    ? Math.round(customers.reduce((s, c) => s + c.max_days_overdue, 0) / customers.length)
    : 0;

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
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Statements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and send customer balance statements
          </p>
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

      {activeTab === 'auto-rules' ? (
        <StatementAutoSendRules templates={templates} />
      ) : (
        <>
          {/* Stats Dashboard */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-tour="statement-stats">
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-5 text-white shadow-lg">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 opacity-80" />
                  <span className="text-xs font-medium uppercase tracking-wider opacity-80">Customers</span>
                </div>
                <p className="text-3xl font-bold">{customers.length.toLocaleString()}</p>
                <p className="text-xs opacity-70 mt-1">with open balance</p>
              </div>
              <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-white/10" />
            </div>

            <div className="relative overflow-hidden bg-gradient-to-br from-red-500 to-rose-600 rounded-xl p-5 text-white shadow-lg">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 opacity-80" />
                  <span className="text-xs font-medium uppercase tracking-wider opacity-80">Open Balance</span>
                </div>
                <p className="text-3xl font-bold">{fmtCurrency(totalBalance)}</p>
                <p className="text-xs opacity-70 mt-1">total outstanding</p>
              </div>
              <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-white/10" />
            </div>

            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white shadow-lg">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 opacity-80" />
                  <span className="text-xs font-medium uppercase tracking-wider opacity-80">Invoices</span>
                </div>
                <p className="text-3xl font-bold">{totalInvoices.toLocaleString()}</p>
                <p className="text-xs opacity-70 mt-1">open invoices</p>
              </div>
              <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-white/10" />
            </div>

            <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white shadow-lg">
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 opacity-80" />
                  <span className="text-xs font-medium uppercase tracking-wider opacity-80">Overdue</span>
                </div>
                <p className="text-3xl font-bold">{overdueCount}</p>
                <p className="text-xs opacity-70 mt-1">30+ days past due</p>
              </div>
              <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-white/10" />
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by customer name, ID, or email..."
                  className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 whitespace-nowrap">Min Balance:</label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    value={minBalance || ''}
                    onChange={e => setMinBalance(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-28 pl-8 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-gray-400" />
                <select
                  value={sortField}
                  onChange={e => setSortField(e.target.value as SortField)}
                  className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-400"
                >
                  <option value="name">Name</option>
                  <option value="balance">Balance</option>
                  <option value="invoices">Invoices</option>
                  <option value="overdue">Days Overdue</option>
                </select>
                <button
                  onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => selectedIds.size === customers.length ? deselectAll() : selectAll()}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {selectedIds.size === customers.length && customers.length > 0
                    ? <><CheckSquare className="w-4 h-4" /> Deselect All</>
                    : <><Square className="w-4 h-4" /> Select All ({customers.length})</>
                  }
                </button>
                {selectedIds.size > 0 && selectedIds.size < customers.length && (
                  <button onClick={deselectAll} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                    Clear Selection
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {search ? `${customers.length} results` : `${customers.length} customers`}
                {selectedIds.size > 0 && <span className="ml-2 font-medium text-blue-600">({selectedIds.size} selected)</span>}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div data-tour="statement-actions">
            <StatementActions
              selectedCustomers={selectedCustomers}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onTemplateChange={setSelectedTemplateId}
              ensureInvoicesLoaded={ensureInvoicesLoaded}
            />
          </div>

          {/* Customer List */}
          <div className="space-y-3" data-tour="statement-list">
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
        </>
      )}
    </div>
  );
}
