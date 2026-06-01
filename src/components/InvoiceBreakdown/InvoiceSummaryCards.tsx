import { FileText, FileMinus, FilePlus, FileX, AlertTriangle, DollarSign, CheckCircle, XCircle, Clock, Ban } from 'lucide-react';
import { InvoiceMonthSummary, INVOICE_STATUS_CONFIG, formatCurrency, formatNumber } from './types';

interface InvoiceSummaryCardsProps {
  months: InvoiceMonthSummary[];
}

export default function InvoiceSummaryCards({ months }: InvoiceSummaryCardsProps) {
  const totals = months.reduce((acc, m) => ({
    totalCount: acc.totalCount + m.total_invoices,
    totalAmount: acc.totalAmount + m.total_amount,
    totalBalance: acc.totalBalance + m.total_balance,
    totalOpenBalance: acc.totalOpenBalance + m.total_open_balance,

    openCount: acc.openCount + m.open_count,
    openAmount: acc.openAmount + m.open_amount,
    openBalance: acc.openBalance + m.open_balance,
    closedCount: acc.closedCount + m.closed_count,
    closedAmount: acc.closedAmount + m.closed_amount,
    closedBalance: acc.closedBalance + m.closed_balance,
    balancedCount: acc.balancedCount + m.balanced_count,
    balancedAmount: acc.balancedAmount + m.balanced_amount,
    balancedBalance: acc.balancedBalance + m.balanced_balance,
    canceledCount: acc.canceledCount + m.canceled_count,
    canceledAmount: acc.canceledAmount + m.canceled_amount,
    voidedCount: acc.voidedCount + m.voided_count,
    voidedAmount: acc.voidedAmount + m.voided_amount,
    creditHoldCount: acc.creditHoldCount + m.credit_hold_count,
    creditHoldAmount: acc.creditHoldAmount + m.credit_hold_amount,
    onHoldCount: acc.onHoldCount + m.on_hold_count,
    onHoldAmount: acc.onHoldAmount + m.on_hold_amount,

    invoiceCount: acc.invoiceCount + m.invoice_count,
    invoices: acc.invoices + m.invoice_amount,
    creditMemoCount: acc.creditMemoCount + m.credit_memo_count,
    creditMemos: acc.creditMemos + m.credit_memo_amount,
    debitMemoCount: acc.debitMemoCount + m.debit_memo_count,
    debitMemos: acc.debitMemos + m.debit_memo_amount,
    creditWoCount: acc.creditWoCount + m.credit_wo_count,
    creditWo: acc.creditWo + m.credit_wo_amount,
    overdueChargeCount: acc.overdueChargeCount + m.overdue_charge_count,
    overdueCharges: acc.overdueCharges + m.overdue_charge_amount,
  }), {
    totalCount: 0, totalAmount: 0, totalBalance: 0, totalOpenBalance: 0,
    openCount: 0, openAmount: 0, openBalance: 0,
    closedCount: 0, closedAmount: 0, closedBalance: 0,
    balancedCount: 0, balancedAmount: 0, balancedBalance: 0,
    canceledCount: 0, canceledAmount: 0,
    voidedCount: 0, voidedAmount: 0,
    creditHoldCount: 0, creditHoldAmount: 0,
    onHoldCount: 0, onHoldAmount: 0,
    invoiceCount: 0, invoices: 0,
    creditMemoCount: 0, creditMemos: 0,
    debitMemoCount: 0, debitMemos: 0,
    creditWoCount: 0, creditWo: 0,
    overdueChargeCount: 0, overdueCharges: 0,
  });

  const statusCards = [
    { label: 'Net Open Balance', amount: totals.totalOpenBalance, count: totals.openCount + totals.balancedCount, icon: DollarSign, gradient: 'from-emerald-500 to-teal-600', description: 'Open + Balanced balance' },
    { label: 'Open', amount: totals.openAmount, count: totals.openCount, icon: FileText, gradient: 'from-blue-500 to-blue-600', description: 'Active documents' },
    { label: 'Closed', amount: totals.closedAmount, count: totals.closedCount, icon: CheckCircle, gradient: 'from-gray-500 to-gray-600', description: 'Fully settled' },
    { label: 'Balanced', amount: totals.balancedAmount, count: totals.balancedCount, icon: FilePlus, gradient: 'from-emerald-500 to-emerald-600', description: 'Applied payments balance to zero' },
    { label: 'Canceled/Voided', amount: totals.canceledAmount + totals.voidedAmount, count: totals.canceledCount + totals.voidedCount, icon: XCircle, gradient: 'from-red-500 to-red-600', description: 'Reversed documents' },
    { label: 'Credit Hold', amount: totals.creditHoldAmount, count: totals.creditHoldCount, icon: Ban, gradient: 'from-amber-500 to-amber-600', description: 'Awaiting credit approval' },
    { label: 'On Hold', amount: totals.onHoldAmount, count: totals.onHoldCount, icon: Clock, gradient: 'from-gray-600 to-gray-700', description: 'Pending release' },
  ];

  const typeCards = [
    { label: 'Invoices', amount: totals.invoices, count: totals.invoiceCount, icon: FileText, gradient: 'from-blue-500 to-blue-600' },
    { label: 'Credit Memos', amount: totals.creditMemos, count: totals.creditMemoCount, icon: FileMinus, gradient: 'from-emerald-500 to-emerald-600' },
    { label: 'Debit Memos', amount: totals.debitMemos, count: totals.debitMemoCount, icon: FilePlus, gradient: 'from-amber-500 to-amber-600' },
    { label: 'Credit W/O', amount: totals.creditWo, count: totals.creditWoCount, icon: FileX, gradient: 'from-gray-500 to-gray-600' },
    { label: 'Overdue Charges', amount: totals.overdueCharges, count: totals.overdueChargeCount, icon: AlertTriangle, gradient: 'from-red-500 to-red-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Status breakdown cards */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">By Status</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {statusCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.gradient} shadow-sm`}>
                    <Icon size={14} className="text-white" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">{formatNumber(card.count)} docs</span>
                </div>
                <div className="text-lg font-bold text-gray-900 mb-0.5">{formatCurrency(card.amount)}</div>
                <div className="text-[11px] text-gray-500">{card.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Type breakdown cards */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">By Type</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {typeCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className={`p-1.5 rounded-lg bg-gradient-to-br ${card.gradient} shadow-sm`}>
                    <Icon size={14} className="text-white" />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">{formatNumber(card.count)} docs</span>
                </div>
                <div className="text-lg font-bold text-gray-900 mb-0.5">{formatCurrency(card.amount)}</div>
                <div className="text-[11px] text-gray-500">{card.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
