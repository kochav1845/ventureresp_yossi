import { FileText, FileMinus, FilePlus, FileX, AlertTriangle, DollarSign } from 'lucide-react';
import { InvoiceMonthSummary, formatCurrency, formatNumber } from './types';

interface InvoiceSummaryCardsProps {
  months: InvoiceMonthSummary[];
}

export default function InvoiceSummaryCards({ months }: InvoiceSummaryCardsProps) {
  const totals = months.reduce((acc, m) => ({
    totalCount: acc.totalCount + m.total_invoices,
    totalAmount: acc.totalAmount + m.total_amount,
    totalBalance: acc.totalBalance + m.total_balance,
    invoices: acc.invoices + m.invoice_amount,
    invoiceCount: acc.invoiceCount + m.invoice_count,
    invoiceBalance: acc.invoiceBalance + m.invoice_balance,
    creditMemos: acc.creditMemos + m.credit_memo_amount,
    creditMemoCount: acc.creditMemoCount + m.credit_memo_count,
    creditMemoBalance: acc.creditMemoBalance + m.credit_memo_balance,
    debitMemos: acc.debitMemos + m.debit_memo_amount,
    debitMemoCount: acc.debitMemoCount + m.debit_memo_count,
    debitMemoBalance: acc.debitMemoBalance + m.debit_memo_balance,
    creditWo: acc.creditWo + m.credit_wo_amount,
    creditWoCount: acc.creditWoCount + m.credit_wo_count,
    overdueCharges: acc.overdueCharges + m.overdue_charge_amount,
    overdueChargeCount: acc.overdueChargeCount + m.overdue_charge_count,
  }), {
    totalCount: 0, totalAmount: 0, totalBalance: 0,
    invoices: 0, invoiceCount: 0, invoiceBalance: 0,
    creditMemos: 0, creditMemoCount: 0, creditMemoBalance: 0,
    debitMemos: 0, debitMemoCount: 0, debitMemoBalance: 0,
    creditWo: 0, creditWoCount: 0,
    overdueCharges: 0, overdueChargeCount: 0,
  });

  const netOutstanding = totals.invoiceBalance + totals.debitMemoBalance - totals.creditMemoBalance;

  const cards = [
    { label: 'Net Outstanding', amount: netOutstanding, subtitle: `${formatNumber(totals.totalCount)} total docs`, icon: DollarSign, gradient: 'from-emerald-500 to-teal-600', description: 'Invoices + Debit Memos - Credit Memos' },
    { label: 'Invoices', amount: totals.invoices, subtitle: `${formatNumber(totals.invoiceCount)} docs | ${formatCurrency(totals.invoiceBalance)} open`, icon: FileText, gradient: 'from-blue-500 to-blue-600' },
    { label: 'Credit Memos', amount: totals.creditMemos, subtitle: `${formatNumber(totals.creditMemoCount)} docs | ${formatCurrency(totals.creditMemoBalance)} open`, icon: FileMinus, gradient: 'from-emerald-500 to-emerald-600' },
    { label: 'Debit Memos', amount: totals.debitMemos, subtitle: `${formatNumber(totals.debitMemoCount)} docs | ${formatCurrency(totals.debitMemoBalance)} open`, icon: FilePlus, gradient: 'from-amber-500 to-amber-600' },
    { label: 'Credit W/O', amount: totals.creditWo, subtitle: `${formatNumber(totals.creditWoCount)} docs`, icon: FileX, gradient: 'from-gray-500 to-gray-600' },
    { label: 'Overdue Charges', amount: totals.overdueCharges, subtitle: `${formatNumber(totals.overdueChargeCount)} docs`, icon: AlertTriangle, gradient: 'from-red-500 to-red-600' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg bg-gradient-to-br ${card.gradient} shadow-sm`}>
                <Icon size={18} className="text-white" />
              </div>
            </div>
            <div className="text-xl font-bold text-gray-900 mb-0.5">{formatCurrency(card.amount)}</div>
            <div className="text-xs text-gray-500">{card.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{card.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
}
