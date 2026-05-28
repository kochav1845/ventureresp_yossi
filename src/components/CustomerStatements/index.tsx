import { useState } from 'react';
import {
  Search, X, ArrowUpDown, DollarSign, FileText, Users,
  CheckSquare, Square, Loader2, Send, Filter, RotateCcw, AlertTriangle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { useCustomerStatements } from './useCustomerStatements';
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
    minInvoices, setMinInvoices, maxInvoices, setMaxInvoices,
    showCreditMemos, setShowCreditMemos,
    minOverdue, setMinOverdue, maxOverdue, setMaxOverdue,
    sortField, setSortField, sortOrder, setSortOrder,
    expandedId, toggleExpand,
    ensureInvoicesLoaded,
  } = useCustomerStatements();

  const selectedCustomers = customers.filter(c => selectedIds.has(c.customer_id));
  const totalBalance = customers.reduce((s, c) => s + c.total_balance, 0);
  const totalInvoices = customers.reduce((s, c) => s + c.open_invoice_count, 0);
  const overdueCount = customers.filter(c => c.max_days_overdue > 30).length;

  const hasActiveFilters = search.trim() !== '' || minBalance > 0 || minInvoices > 0 || maxInvoices > 0 || minOverdue > 0 || maxOverdue > 0 || showCreditMemos;

  const clearFilters = () => {
    setSearch('');
    setMinBalance(0);
    setMinInvoices(0);
    setMaxInvoices(0);
    setShowCreditMemos(false);
    setMinOverdue(0);
    setMaxOverdue(0);
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
          {/* Left Sidebar - Fixed/Sticky */}
          <div className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-y-auto">
            {/* Filter Header */}
            <div className="sticky top-0 z-10 p-4 border-b border-gray-200 bg-gray-50">
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
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                Minimum Balance
              </label>
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

            {/* Invoice Count */}
            <div className="p-4 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                Invoice Count
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={minInvoices || ''}
                  onChange={e => setMinInvoices(Number(e.target.value) || 0)}
                  placeholder="Min"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="number"
                  value={maxInvoices || ''}
                  onChange={e => setMaxInvoices(Number(e.target.value) || 0)}
                  placeholder="Max"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Days Overdue */}
            <div className="p-4 border-b border-gray-100">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                Days Overdue
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={minOverdue || ''}
                  onChange={e => setMinOverdue(Number(e.target.value) || 0)}
                  placeholder="Min"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="number"
                  value={maxOverdue || ''}
                  onChange={e => setMaxOverdue(Number(e.target.value) || 0)}
                  placeholder="Max"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Credit Memos Toggle */}
            <div className="p-4 border-b border-gray-100">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCreditMemos}
                  onChange={e => setShowCreditMemos(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Only with Credit Memos
                </span>
              </label>
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

            {/* Summary at Bottom */}
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

          {/* Right Content - Scrollable */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sticky Actions Bar */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
              <StatementActions
                selectedCustomers={selectedCustomers}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                onTemplateChange={setSelectedTemplateId}
                ensureInvoicesLoaded={ensureInvoicesLoaded}
              />
            </div>

            {/* Scrollable Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-10 px-3 py-3 text-left">
                      <button
                        onClick={() => selectedIds.size === customers.length ? deselectAll() : selectAll()}
                        className="text-gray-400 hover:text-blue-600"
                      >
                        {selectedIds.size === customers.length && customers.length > 0
                          ? <CheckSquare className="w-4 h-4 text-blue-600" />
                          : <Square className="w-4 h-4" />
                        }
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Invoices</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Credits</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Overdue</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance</th>
                    <th className="w-10 px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map(customer => (
                    <CustomerRow
                      key={customer.customer_id}
                      customer={customer}
                      selected={selectedIds.has(customer.customer_id)}
                      expanded={expandedId === customer.customer_id}
                      loadingInvoices={loadingInvoices === customer.customer_id}
                      onToggleSelect={() => toggleCustomer(customer.customer_id)}
                      onToggleExpand={() => toggleExpand(customer.customer_id)}
                    />
                  ))}
                </tbody>
              </table>

              {loadingMore && (
                <div className="flex items-center justify-center py-4 border-t border-gray-100">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 mr-2" />
                  <p className="text-sm text-gray-500">
                    Loading more customers... ({totalLoaded} loaded so far)
                  </p>
                </div>
              )}

              {!loading && !loadingMore && customers.length === 0 && (
                <div className="text-center py-16">
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

function CustomerRow({ customer, selected, expanded, loadingInvoices, onToggleSelect, onToggleExpand }: {
  customer: any;
  selected: boolean;
  expanded: boolean;
  loadingInvoices: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  const overdueColor = customer.max_days_overdue > 90 ? 'text-red-600'
    : customer.max_days_overdue > 60 ? 'text-orange-600'
    : customer.max_days_overdue > 30 ? 'text-amber-600'
    : 'text-gray-700';

  const allInvoices = customer.invoices?.filter((inv: any) => inv.balance !== 0) || [];

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${selected ? 'bg-blue-50/50' : ''}`}>
        <td className="px-3 py-3">
          <button onClick={onToggleSelect} className="text-gray-400 hover:text-blue-600">
            {selected
              ? <CheckSquare className="w-4 h-4 text-blue-600" />
              : <Square className="w-4 h-4" />
            }
          </button>
        </td>
        <td className="px-3 py-3 cursor-pointer" onClick={onToggleExpand}>
          <div className="font-medium text-gray-900">{customer.customer_name}</div>
          <div className="text-xs text-gray-400">{customer.customer_id}</div>
        </td>
        <td className="px-3 py-3">
          {customer.email ? (
            <span className="text-gray-600 text-xs">{customer.email}</span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-500">
              <AlertTriangle className="w-3 h-3" />
              No email
            </span>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
            {customer.open_invoice_count}
          </span>
        </td>
        <td className="px-3 py-3 text-center">
          {customer.credit_memo_balance !== 0 ? (
            <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
              {fmtCurrency(customer.credit_memo_balance)}
            </span>
          ) : (
            <span className="text-xs text-gray-300">--</span>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <span className={`text-xs font-semibold ${overdueColor}`}>
            {customer.max_days_overdue > 0 ? `${customer.max_days_overdue}d` : '--'}
          </span>
        </td>
        <td className="px-3 py-3 text-right">
          <span className="font-semibold text-gray-900">{fmtCurrency(customer.total_balance)}</span>
        </td>
        <td className="px-3 py-3">
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50/80 px-4 py-4 border-b border-gray-200">
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mr-2" />
                <span className="text-sm text-gray-500">Loading invoices...</span>
              </div>
            ) : allInvoices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No invoices loaded</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Due Date</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                      <th className="text-right px-3 py-2 font-medium">Balance</th>
                      <th className="text-center px-3 py-2 font-medium">Aging</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {allInvoices.map((inv: any) => {
                      const isCredit = inv.balance < 0;
                      return (
                        <tr key={inv.reference_number} className={isCredit ? 'bg-blue-50/30' : ''}>
                          <td className="px-3 py-2 font-medium text-gray-800">{inv.reference_number}</td>
                          <td className="px-3 py-2 text-gray-500">{inv.type}</td>
                          <td className="px-3 py-2 text-gray-600">{inv.date ? new Date(inv.date).toLocaleDateString() : ''}</td>
                          <td className="px-3 py-2 text-gray-600">{isCredit ? '' : inv.due_date ? new Date(inv.due_date).toLocaleDateString() : ''}</td>
                          <td className={`px-3 py-2 text-right ${isCredit ? 'text-blue-700' : 'text-gray-700'}`}>{fmtCurrency(inv.amount)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${isCredit ? 'text-blue-700' : 'text-gray-900'}`}>{fmtCurrency(inv.balance)}</td>
                          <td className="px-3 py-2 text-center">
                            {isCredit ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-blue-700 bg-blue-50 font-medium">Credit</span>
                            ) : inv.days_overdue > 0 ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${
                                inv.days_overdue > 90 ? 'text-red-700 bg-red-50' :
                                inv.days_overdue > 60 ? 'text-orange-700 bg-orange-50' :
                                inv.days_overdue > 30 ? 'text-amber-700 bg-amber-50' :
                                'text-blue-700 bg-blue-50'
                              }`}>
                                {inv.days_overdue}d
                              </span>
                            ) : (
                              <span className="text-gray-400">Current</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-800 text-white">
                      <td className="px-3 py-2 font-bold" colSpan={4}>Total</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCurrency(allInvoices.reduce((s: number, i: any) => s + i.amount, 0))}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtCurrency(allInvoices.reduce((s: number, i: any) => s + i.balance, 0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
