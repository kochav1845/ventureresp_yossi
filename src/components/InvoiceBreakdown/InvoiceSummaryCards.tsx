import { FileText, FileMinus, FilePlus, FileX, AlertTriangle, DollarSign } from 'lucide-react';
import { InvoiceMonthSummary, formatCurrency, formatNumber } from './types';

interface InvoiceSummaryCardsProps {
  months: InvoiceMonthSummary[];
}

export default function InvoiceSummaryCards({ months }: InvoiceSummaryCardsProps) {
  const totals = months.reduce((acc, m) => ({
    totalCount: acc.totalCount + m.total_invoices,
    totalAmount: acc.totalAmount + m.total_amount,

    invoiceCount: acc.invoiceCount + m.invoice_count,
    invoices: acc.invoices + m.invoice_amount,
    invoiceOpenBalance: acc.invoiceOpenBalance + (m.invoice_open_balance || 0),
    invoiceOpenCount: acc.invoiceOpenCount + (m.invoice_open_count || 0),
    invoiceOpenAmount: acc.invoiceOpenAmount + (m.invoice_open_amount || 0),
    invoiceClosedCount: acc.invoiceClosedCount + (m.invoice_closed_count || 0),
    invoiceClosedAmount: acc.invoiceClosedAmount + (m.invoice_closed_amount || 0),
    invoiceBalancedCount: acc.invoiceBalancedCount + (m.invoice_balanced_count || 0),
    invoiceBalancedAmount: acc.invoiceBalancedAmount + (m.invoice_balanced_amount || 0),

    creditMemoCount: acc.creditMemoCount + m.credit_memo_count,
    creditMemos: acc.creditMemos + m.credit_memo_amount,
    creditMemoOpenBalance: acc.creditMemoOpenBalance + (m.credit_memo_open_balance || 0),
    creditMemoOpenCount: acc.creditMemoOpenCount + (m.credit_memo_open_count || 0),
    creditMemoOpenAmount: acc.creditMemoOpenAmount + (m.credit_memo_open_amount || 0),
    creditMemoClosedCount: acc.creditMemoClosedCount + (m.credit_memo_closed_count || 0),
    creditMemoClosedAmount: acc.creditMemoClosedAmount + (m.credit_memo_closed_amount || 0),
    creditMemoBalancedCount: acc.creditMemoBalancedCount + (m.credit_memo_balanced_count || 0),
    creditMemoBalancedAmount: acc.creditMemoBalancedAmount + (m.credit_memo_balanced_amount || 0),

    debitMemoCount: acc.debitMemoCount + m.debit_memo_count,
    debitMemos: acc.debitMemos + m.debit_memo_amount,
    debitMemoOpenBalance: acc.debitMemoOpenBalance + (m.debit_memo_open_balance || 0),
    debitMemoOpenCount: acc.debitMemoOpenCount + (m.debit_memo_open_count || 0),
    debitMemoOpenAmount: acc.debitMemoOpenAmount + (m.debit_memo_open_amount || 0),
    debitMemoClosedCount: acc.debitMemoClosedCount + (m.debit_memo_closed_count || 0),
    debitMemoClosedAmount: acc.debitMemoClosedAmount + (m.debit_memo_closed_amount || 0),

    creditWoCount: acc.creditWoCount + m.credit_wo_count,
    creditWo: acc.creditWo + m.credit_wo_amount,
    overdueChargeCount: acc.overdueChargeCount + m.overdue_charge_count,
    overdueCharges: acc.overdueCharges + m.overdue_charge_amount,
  }), {
    totalCount: 0, totalAmount: 0,
    invoiceCount: 0, invoices: 0, invoiceOpenBalance: 0,
    invoiceOpenCount: 0, invoiceOpenAmount: 0,
    invoiceClosedCount: 0, invoiceClosedAmount: 0,
    invoiceBalancedCount: 0, invoiceBalancedAmount: 0,
    creditMemoCount: 0, creditMemos: 0, creditMemoOpenBalance: 0,
    creditMemoOpenCount: 0, creditMemoOpenAmount: 0,
    creditMemoClosedCount: 0, creditMemoClosedAmount: 0,
    creditMemoBalancedCount: 0, creditMemoBalancedAmount: 0,
    debitMemoCount: 0, debitMemos: 0, debitMemoOpenBalance: 0,
    debitMemoOpenCount: 0, debitMemoOpenAmount: 0,
    debitMemoClosedCount: 0, debitMemoClosedAmount: 0,
    creditWoCount: 0, creditWo: 0,
    overdueChargeCount: 0, overdueCharges: 0,
  });

  const netOutstanding = totals.invoiceOpenBalance + totals.debitMemoOpenBalance - totals.creditMemoOpenBalance;
  const otherInvoiceCount = totals.invoiceCount - totals.invoiceOpenCount - totals.invoiceClosedCount - totals.invoiceBalancedCount;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* Net Outstanding */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
            <DollarSign size={18} className="text-white" />
          </div>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(netOutstanding)}</div>
        <div className="text-xs font-medium text-gray-700 mb-2">Net Outstanding</div>
        <div className="space-y-1 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
          <div className="flex justify-between">
            <span>Open+Balanced Invoice balance</span>
            <span className="font-medium text-gray-700">{formatCurrency(totals.invoiceOpenBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span>+ Open Debit Memo balance</span>
            <span className="font-medium text-gray-700">+ {formatCurrency(totals.debitMemoOpenBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span>- Open Credit Memo balance</span>
            <span className="font-medium text-red-600">- {formatCurrency(totals.creditMemoOpenBalance)}</span>
          </div>
          <div className="border-t border-dashed border-gray-200 pt-1 mt-1 text-[10px] text-gray-400">
            Includes only Open & Balanced statuses. Credit Memos are subtracted.
          </div>
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
            <FileText size={18} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-400">{formatNumber(totals.invoiceCount)} total docs</span>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(totals.invoices)}</div>
        <div className="text-xs font-medium text-gray-700 mb-2">Invoices (All Statuses)</div>
        <div className="space-y-1 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
              Closed ({formatNumber(totals.invoiceClosedCount)})
            </span>
            <span className="font-medium text-gray-600">{formatCurrency(totals.invoiceClosedAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Open ({formatNumber(totals.invoiceOpenCount)})
            </span>
            <span className="font-medium text-blue-700">{formatCurrency(totals.invoiceOpenAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Balanced ({formatNumber(totals.invoiceBalancedCount)})
            </span>
            <span className="font-medium text-amber-700">{formatCurrency(totals.invoiceBalancedAmount)}</span>
          </div>
          {otherInvoiceCount > 0 && (
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                Other ({formatNumber(otherInvoiceCount)})
              </span>
              <span className="font-medium text-gray-500">
                {formatCurrency(totals.invoices - totals.invoiceClosedAmount - totals.invoiceOpenAmount - totals.invoiceBalancedAmount)}
              </span>
            </div>
          )}
          <div className="border-t border-dashed border-gray-200 pt-1 mt-1">
            <div className="flex justify-between font-medium text-gray-700">
              <span>Outstanding balance (Open+Balanced)</span>
              <span>{formatCurrency(totals.invoiceOpenBalance)}</span>
            </div>
          </div>
          <div className="text-[10px] text-gray-400">
            Balanced invoices are included in outstanding. Credit Memos NOT subtracted here.
          </div>
        </div>
      </div>

      {/* Credit Memos */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-sm">
            <FileMinus size={18} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-400">{formatNumber(totals.creditMemoCount)} total docs</span>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(totals.creditMemos)}</div>
        <div className="text-xs font-medium text-gray-700 mb-2">Credit Memos (All Statuses)</div>
        <div className="space-y-1 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
              Closed ({formatNumber(totals.creditMemoClosedCount)})
            </span>
            <span className="font-medium text-gray-600">{formatCurrency(totals.creditMemoClosedAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Open ({formatNumber(totals.creditMemoOpenCount)})
            </span>
            <span className="font-medium text-emerald-700">{formatCurrency(totals.creditMemoOpenAmount)}</span>
          </div>
          {totals.creditMemoBalancedCount > 0 && (
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Balanced ({formatNumber(totals.creditMemoBalancedCount)})
              </span>
              <span className="font-medium text-amber-700">{formatCurrency(totals.creditMemoBalancedAmount)}</span>
            </div>
          )}
          <div className="border-t border-dashed border-gray-200 pt-1 mt-1">
            <div className="flex justify-between font-medium text-gray-700">
              <span>Outstanding balance (Open+Balanced)</span>
              <span>{formatCurrency(totals.creditMemoOpenBalance)}</span>
            </div>
          </div>
          <div className="text-[10px] text-gray-400">
            Open Credit Memos are subtracted in the Net Outstanding card.
          </div>
        </div>
      </div>

      {/* Debit Memos */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm">
            <FilePlus size={18} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-400">{formatNumber(totals.debitMemoCount)} total docs</span>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(totals.debitMemos)}</div>
        <div className="text-xs font-medium text-gray-700 mb-2">Debit Memos (All Statuses)</div>
        <div className="space-y-1 text-[11px] text-gray-500 border-t border-gray-100 pt-2">
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
              Closed ({formatNumber(totals.debitMemoClosedCount)})
            </span>
            <span className="font-medium text-gray-600">{formatCurrency(totals.debitMemoClosedAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Open ({formatNumber(totals.debitMemoOpenCount)})
            </span>
            <span className="font-medium text-amber-700">{formatCurrency(totals.debitMemoOpenAmount)}</span>
          </div>
          <div className="border-t border-dashed border-gray-200 pt-1 mt-1">
            <div className="flex justify-between font-medium text-gray-700">
              <span>Outstanding balance (Open+Balanced)</span>
              <span>{formatCurrency(totals.debitMemoOpenBalance)}</span>
            </div>
          </div>
          <div className="text-[10px] text-gray-400">
            Open Debit Memos are added in the Net Outstanding card.
          </div>
        </div>
      </div>

      {/* Credit W/O */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 shadow-sm">
            <FileX size={18} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-400">{formatNumber(totals.creditWoCount)} docs</span>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(totals.creditWo)}</div>
        <div className="text-xs font-medium text-gray-700 mb-2">Credit Write-Offs</div>
        <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
          All statuses. Not included in Net Outstanding calculation.
        </div>
      </div>

      {/* Overdue Charges */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-red-600 shadow-sm">
            <AlertTriangle size={18} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-400">{formatNumber(totals.overdueChargeCount)} docs</span>
        </div>
        <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(totals.overdueCharges)}</div>
        <div className="text-xs font-medium text-gray-700 mb-2">Overdue Charges</div>
        <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
          All statuses. Not included in Net Outstanding calculation.
        </div>
      </div>
    </div>
  );
}
