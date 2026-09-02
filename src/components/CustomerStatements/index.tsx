import { useState } from 'react';
import { Search, X, ArrowUpDown, DollarSign, FileText, Users, Clock, CheckSquare, Square, FlaskConical, Loader2, Zap, Calendar, Settings } from 'lucide-react';
import { useCustomerStatements } from './useCustomerStatements';
import CustomerStatementCard from './CustomerStatementCard';
import StatementActions from './StatementActions';
import AutoStatementsSidebar from './AutoStatementsSidebar';
import ExcelTemplateSettings from './ExcelTemplateSettings';
import PageHelp, { HelpSection } from '../PageHelp';
import type { SortField, StatementPeriod } from './types';

const STATEMENTS_HELP: HelpSection[] = [
  {
    heading: 'What this page does',
    items: [
      { label: 'Customer Statements', body: 'Pick customers and email (or download) their open-balance statement. Emails go out through your email system and appear in Sent.' },
    ],
  },
  {
    heading: 'Choosing who to send to',
    items: [
      { label: 'Search / Min Balance / Sort', body: 'Narrow by name, ID or email, a minimum balance, and sort order.' },
      { label: 'Invoiced in (period)', body: 'Attach each customer’s invoice activity for a window (last month, this month, last 30/90 days). Each shows an “Invoiced $X · N” chip.' },
      { label: 'Only customers invoiced in period', body: 'Hide anyone who wasn’t billed in that window.' },
      { label: 'Min invoiced', body: 'Keep only customers invoiced at least this much in the period.' },
      { label: 'Select all / checkboxes', body: 'Tick the customers to send to; the selected count shows on the right.' },
    ],
  },
  {
    heading: 'A customer card (expanded)',
    items: [
      { label: 'Aging buckets', body: 'Current / 1–30 / 31–60 / 61–90 / 90+ totals of their open balance.' },
      { label: 'First 5 invoices + “View all”', body: 'Shows the first 5 invoices; “View all” reveals the rest.' },
      { label: '“No email” flag', body: 'Amber warning that the customer has no email on file and can’t be emailed.' },
    ],
  },
  {
    heading: 'Sending',
    items: [
      { label: 'Email Statements', body: 'Emails the selected customers their statement.' },
      { label: 'Automatic (⚡)', body: 'Schedule statements to send themselves — everyone on a chosen day, or specific customers on their own day, with exclusions. Off until you switch it on.' },
      { label: 'Test Customers toggle', body: 'Switch to test customers to safely verify the workflow before sending to real ones.' },
    ],
  },
];

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function CustomerStatements() {
  const {
    customers, loading, loadingMore, totalLoaded, loadingInvoices, templates, selectedTemplateId, setSelectedTemplateId,
    excelTemplates, selectedExcelTemplateId, setSelectedExcelTemplateId, refreshExcelTemplates,
    selectedIds, toggleCustomer, selectAll, deselectAll,
    search, setSearch, minBalance, setMinBalance,
    period, setPeriod, onlyInvoiced, setOnlyInvoiced, minInvoicedAmount, setMinInvoicedAmount, activityLoading,
    sortField, setSortField, sortOrder, setSortOrder,
    expandedId, toggleExpand,
    showTestCustomers, toggleTestCustomers,
    ensureInvoicesLoaded,
  } = useCustomerStatements();

  const [showAuto, setShowAuto] = useState(false);
  const [showExcelSettings, setShowExcelSettings] = useState(false);

  const selectedCustomers = customers.filter(c => selectedIds.has(c.customer_id));
  const totalBalance = customers.reduce((s, c) => s + c.total_balance, 0);
  const totalInvoices = customers.reduce((s, c) => s + c.open_invoice_count, 0);
  const overdueCount = customers.filter(c => c.max_days_overdue > 30).length;

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {showTestCustomers ? 'Test Customer Statements' : 'Customer Statements'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {showTestCustomers
              ? 'Test customers for verifying email and statement workflows'
              : 'Select customers to download or email their open balance statements'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PageHelp title="Statements" intro="Select customers and send them their account statement. Here's what each control means:" sections={STATEMENTS_HELP} />
          <button
            onClick={() => setShowExcelSettings(true)}
            title="Excel statement templates"
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Settings className="w-4 h-4" /> Settings
          </button>
          <button
            onClick={() => setShowAuto(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
          >
            <Zap className="w-4 h-4" /> Automatic
          </button>
          <div className="bg-white rounded-xl shadow-sm p-1.5 border border-gray-200 inline-flex" data-tour="statement-view-toggle">
          <button
            onClick={() => toggleTestCustomers(false)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              !showTestCustomers
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            All Customers
          </button>
          <button
            onClick={() => toggleTestCustomers(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
              showTestCustomers
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Test Customers
          </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-tour="statement-stats">
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-600" />}
          iconBg="bg-blue-50"
          value={customers.length.toString()}
          label="Customers with balance"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-red-600" />}
          iconBg="bg-red-50"
          value={fmtCurrency(totalBalance)}
          label="Total open balance"
        />
        <StatCard
          icon={<FileText className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          value={totalInvoices.toLocaleString()}
          label="Open invoices"
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          value={overdueCount.toString()}
          label="Overdue 30+ days"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
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
              <option value="invoiced">Invoiced (period)</option>
            </select>
            <button
              onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {sortOrder === 'asc' ? 'Asc' : 'Desc'}
            </button>
          </div>
        </div>

        {/* Invoice-activity segmentation */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <label className="text-sm text-gray-600 whitespace-nowrap">Invoiced in</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as StatementPeriod)}
              className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-blue-400"
            >
              <option value="last_month">Last month</option>
              <option value="this_month">This month</option>
              <option value="last_30">Last 30 days</option>
              <option value="last_90">Last 90 days</option>
              <option value="all">Off</option>
            </select>
            {activityLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          </div>
          <label className={`flex items-center gap-2 text-sm cursor-pointer ${period === 'all' ? 'text-gray-300' : 'text-gray-600'}`}>
            <input type="checkbox" disabled={period === 'all'} checked={onlyInvoiced} onChange={e => setOnlyInvoiced(e.target.checked)} className="rounded accent-blue-600" />
            Only customers invoiced in period
          </label>
          <div className="flex items-center gap-2">
            <label className={`text-sm whitespace-nowrap ${period === 'all' ? 'text-gray-300' : 'text-gray-600'}`}>Min invoiced</label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                disabled={period === 'all'}
                value={minInvoicedAmount || ''}
                onChange={e => setMinInvoicedAmount(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-28 pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              />
            </div>
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

      <div data-tour="statement-actions">
        <StatementActions
          selectedCustomers={selectedCustomers}
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={setSelectedTemplateId}
          excelTemplates={excelTemplates}
          selectedExcelTemplateId={selectedExcelTemplateId}
          onExcelTemplateChange={setSelectedExcelTemplateId}
          ensureInvoicesLoaded={ensureInvoicesLoaded}
        />
      </div>

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
              {search ? 'Try adjusting your search or filters'
                : showTestCustomers ? 'No test customers found'
                : 'No customers with open balances'}
            </p>
          </div>
        )}
      </div>

      <AutoStatementsSidebar
        open={showAuto}
        onClose={() => setShowAuto(false)}
        customers={customers}
        templates={templates}
        defaultTemplateId={selectedTemplateId}
      />

      <ExcelTemplateSettings
        open={showExcelSettings}
        onClose={() => setShowExcelSettings(false)}
        templates={excelTemplates}
        onTemplatesChanged={refreshExcelTemplates}
      />
    </div>
  );
}

function StatCard({ icon, iconBg, value, label }: { icon: React.ReactNode; iconBg: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
