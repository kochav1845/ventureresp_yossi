import { CheckSquare, Square, ChevronDown, ChevronUp, Mail, AlertTriangle } from 'lucide-react';
import type { StatementCustomer } from './types';

interface Props {
  customer: StatementCustomer;
  selected: boolean;
  expanded: boolean;
  loadingInvoices: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const fmtDate = (s: string) => {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

function getAgingColor(days: number): string {
  if (days <= 0) return 'text-emerald-700 bg-emerald-50';
  if (days <= 30) return 'text-blue-700 bg-blue-50';
  if (days <= 60) return 'text-amber-700 bg-amber-50';
  if (days <= 90) return 'text-orange-700 bg-orange-50';
  return 'text-red-700 bg-red-50';
}

function getAgingLabel(days: number): string {
  if (days <= 0) return 'Current';
  if (days <= 30) return '1-30 days';
  if (days <= 60) return '31-60 days';
  if (days <= 90) return '61-90 days';
  return '90+ days';
}

export default function CustomerStatementCard({ customer, selected, expanded, loadingInvoices, onToggleSelect, onToggleExpand }: Props) {
  const openInvoices = customer.invoices.filter(inv => inv.balance > 0);
  const agingBuckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  openInvoices.forEach(inv => {
    const d = inv.days_overdue;
    if (d <= 0) agingBuckets.current += inv.balance;
    else if (d <= 30) agingBuckets.d30 += inv.balance;
    else if (d <= 60) agingBuckets.d60 += inv.balance;
    else if (d <= 90) agingBuckets.d90 += inv.balance;
    else agingBuckets.d90plus += inv.balance;
  });

  return (
    <div className={`bg-white rounded-xl border transition-all duration-200 ${selected ? 'border-blue-400 ring-1 ring-blue-100 shadow-md' : 'border-gray-200 shadow-sm hover:shadow-md'}`}>
      <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={onToggleExpand}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="flex-shrink-0 p-0.5"
        >
          {selected
            ? <CheckSquare className="w-5 h-5 text-blue-600" />
            : <Square className="w-5 h-5 text-gray-300 hover:text-gray-400" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{customer.customer_name}</h3>
            <span className="text-xs text-gray-400 flex-shrink-0">{customer.customer_id}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {customer.email ? (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Mail className="w-3 h-3" />
                {customer.email}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <AlertTriangle className="w-3 h-3" />
                No email
              </span>
            )}
            {customer.terms && (
              <span className="text-xs text-gray-400">Terms: {customer.terms}</span>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-6 text-right flex-shrink-0">
          <div>
            <p className="text-xs text-gray-500">Invoices</p>
            <p className="text-sm font-semibold text-gray-900">{customer.open_invoice_count}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Max Overdue</p>
            <p className={`text-sm font-semibold ${customer.max_days_overdue > 60 ? 'text-red-600' : customer.max_days_overdue > 30 ? 'text-amber-600' : 'text-gray-900'}`}>
              {customer.max_days_overdue} days
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Balance</p>
            <p className="text-lg font-bold text-gray-900">{fmtCurrency(customer.total_balance)}</p>
          </div>
        </div>

        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>

      <div className="sm:hidden px-5 pb-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">{customer.open_invoice_count} invoices</span>
        <span className="text-lg font-bold text-gray-900">{fmtCurrency(customer.total_balance)}</span>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4 bg-gray-50/50">
          {loadingInvoices ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mr-3" />
              <span className="text-sm text-gray-500">Loading invoices...</span>
            </div>
          ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Current', amount: agingBuckets.current, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: '1-30 Days', amount: agingBuckets.d30, color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: '31-60 Days', amount: agingBuckets.d60, color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: '61-90 Days', amount: agingBuckets.d90, color: 'bg-orange-50 text-orange-700 border-orange-200' },
              { label: '90+ Days', amount: agingBuckets.d90plus, color: 'bg-red-50 text-red-700 border-red-200' },
            ].map(bucket => (
              <div key={bucket.label} className={`rounded-lg border px-3 py-2 ${bucket.color}`}>
                <p className="text-xs font-medium opacity-80">{bucket.label}</p>
                <p className="text-sm font-bold">{fmtCurrency(bucket.amount)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600">
                  <th className="text-left px-3 py-2.5 font-medium">Invoice #</th>
                  <th className="text-left px-3 py-2.5 font-medium">Date</th>
                  <th className="text-left px-3 py-2.5 font-medium">Due Date</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Description</th>
                  <th className="text-right px-3 py-2.5 font-medium">Amount</th>
                  <th className="text-right px-3 py-2.5 font-medium">Balance</th>
                  <th className="text-center px-3 py-2.5 font-medium">Aging</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {openInvoices
                  .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                  .map(inv => (
                    <tr key={inv.reference_number} className="bg-white hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-medium text-gray-800">{inv.reference_number}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtDate(inv.date)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmtDate(inv.due_date)}</td>
                      <td className="px-3 py-2 text-gray-500 hidden md:table-cell max-w-[200px] truncate">{inv.description}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmtCurrency(inv.amount)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtCurrency(inv.balance)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${getAgingColor(inv.days_overdue)}`}>
                          {getAgingLabel(inv.days_overdue)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold">
                  <td className="px-3 py-2.5" colSpan={4}>Total</td>
                  <td className="px-3 py-2.5 text-right">{fmtCurrency(openInvoices.reduce((s, i) => s + i.amount, 0))}</td>
                  <td className="px-3 py-2.5 text-right text-gray-900">{fmtCurrency(customer.total_balance)}</td>
                  <td className="px-3 py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}
