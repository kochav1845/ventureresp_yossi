import { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { InvoiceMonthSummary, ComparisonState, FetchState, VerificationState, INVOICE_TYPE_CONFIG, formatCurrency, formatNumber } from './types';
import InvoiceSyncCheckCell from './InvoiceSyncCheckCell';

interface InvoiceMonthTableProps {
  months: InvoiceMonthSummary[];
  onMonthClick: (monthKey: string) => void;
  selectedMonth: string | null;
  showBalance: boolean;
  comparisons: Record<string, ComparisonState>;
  fetches: Record<string, FetchState>;
  verifications: Record<string, VerificationState>;
  onCompare: (monthKey: string) => void;
  onFetch: (monthKey: string) => void;
  onCancel?: (monthKey: string) => void;
  onVerify?: (monthKey: string, deleteExtras: boolean) => void;
  onDeleteInvoice?: (monthKey: string, referenceNumber: string, type: string) => Promise<void>;
  onDeleteAllExtra?: (monthKey: string, invoices: { reference_number: string; type: string }[]) => Promise<void>;
}

type SortField = 'month' | 'total' | 'invoices' | 'credit_memo' | 'debit_memo' | 'credit_wo' | 'overdue_charge';
type SortDir = 'asc' | 'desc';

export default function InvoiceMonthTable({
  months, onMonthClick, selectedMonth, showBalance,
  comparisons, fetches, verifications, onCompare, onFetch, onCancel,
  onVerify, onDeleteInvoice, onDeleteAllExtra,
}: InvoiceMonthTableProps) {
  const [sortField, setSortField] = useState<SortField>('month');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const getVal = (m: InvoiceMonthSummary, field: SortField): number => {
    switch (field) {
      case 'total': return showBalance ? m.total_balance : m.total_amount;
      case 'invoices': return showBalance ? m.invoice_balance : m.invoice_amount;
      case 'credit_memo': return showBalance ? m.credit_memo_balance : m.credit_memo_amount;
      case 'debit_memo': return showBalance ? m.debit_memo_balance : m.debit_memo_amount;
      case 'credit_wo': return showBalance ? m.credit_wo_balance : m.credit_wo_amount;
      case 'overdue_charge': return showBalance ? m.overdue_charge_amount : m.overdue_charge_amount;
      default: return 0;
    }
  };

  const sorted = [...months].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'month') return dir * a.month_key.localeCompare(b.month_key);
    return dir * (getVal(a, sortField) - getVal(b, sortField));
  });

  const getTrend = (current: number, previous: number | undefined) => {
    if (previous === undefined || previous === 0) return null;
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(pct) < 1) return <Minus size={14} className="text-gray-400" />;
    if (pct > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium"><TrendingUp size={12} />+{pct.toFixed(0)}%</span>;
    return <span className="flex items-center gap-0.5 text-red-600 text-xs font-medium"><TrendingDown size={12} />{pct.toFixed(0)}%</span>;
  };

  const SortHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none transition-colors ${className}`}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-blue-600">{sortDir === 'desc' ? '\u2193' : '\u2191'}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <SortHeader field="month" className="text-left text-gray-600 sticky left-0 bg-gray-50 z-10">Month</SortHeader>
            <SortHeader field="total" className="text-right text-gray-600">Total</SortHeader>
            <SortHeader field="invoices" className="text-right text-blue-600">Invoices</SortHeader>
            <SortHeader field="credit_memo" className="text-right text-emerald-600">Credit Memos</SortHeader>
            <SortHeader field="debit_memo" className="text-right text-amber-600">Debit Memos</SortHeader>
            <SortHeader field="credit_wo" className="text-right text-gray-500">Credit W/O</SortHeader>
            <SortHeader field="overdue_charge" className="text-right text-red-600">Overdue Charges</SortHeader>
            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center text-gray-600">
              Sync Check
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((month, idx) => {
            const prevMonth = sorted[idx + 1];
            const isSelected = selectedMonth === month.month_key;
            const totalVal = showBalance ? month.total_balance : month.total_amount;
            const prevTotalVal = prevMonth ? (showBalance ? prevMonth.total_balance : prevMonth.total_amount) : undefined;

            return (
              <tr
                key={month.month_key}
                onClick={() => onMonthClick(month.month_key)}
                className={`border-b border-gray-100 cursor-pointer transition-all ${
                  isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-gray-50'
                }`}
              >
                <td className={`px-3 py-3.5 sticky left-0 z-10 ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                  <div className="flex items-center gap-2">
                    {isSelected ? <ChevronDown size={16} className="text-blue-600" /> : <ChevronRight size={16} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900">{month.month_label}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <div className="font-semibold text-gray-900">{formatCurrency(totalVal)}</div>
                  <div className="text-xs text-gray-500">{formatNumber(month.total_invoices)} docs</div>
                  <div className="mt-0.5">{getTrend(totalVal, prevTotalVal)}</div>
                </td>
                <TypeCell
                  count={month.invoice_count}
                  amount={showBalance ? month.invoice_balance : month.invoice_amount}
                  type="Invoice"
                  prevAmount={prevMonth ? (showBalance ? prevMonth.invoice_balance : prevMonth.invoice_amount) : undefined}
                  getTrend={getTrend}
                />
                <TypeCell
                  count={month.credit_memo_count}
                  amount={showBalance ? month.credit_memo_balance : month.credit_memo_amount}
                  type="Credit Memo"
                  prevAmount={prevMonth ? (showBalance ? prevMonth.credit_memo_balance : prevMonth.credit_memo_amount) : undefined}
                  getTrend={getTrend}
                />
                <TypeCell
                  count={month.debit_memo_count}
                  amount={showBalance ? month.debit_memo_balance : month.debit_memo_amount}
                  type="Debit Memo"
                  prevAmount={prevMonth ? (showBalance ? prevMonth.debit_memo_balance : prevMonth.debit_memo_amount) : undefined}
                  getTrend={getTrend}
                />
                <TypeCell
                  count={month.credit_wo_count}
                  amount={showBalance ? month.credit_wo_balance : month.credit_wo_amount}
                  type="Credit WO"
                  prevAmount={prevMonth ? (showBalance ? prevMonth.credit_wo_balance : prevMonth.credit_wo_amount) : undefined}
                  getTrend={getTrend}
                />
                <TypeCell
                  count={month.overdue_charge_count}
                  amount={showBalance ? month.overdue_charge_balance : month.overdue_charge_amount}
                  type="Overdue Charge"
                  prevAmount={prevMonth ? (showBalance ? prevMonth.overdue_charge_balance : prevMonth.overdue_charge_amount) : undefined}
                  getTrend={getTrend}
                />
                <InvoiceSyncCheckCell
                  cellKey={month.month_key}
                  comparison={comparisons[month.month_key]}
                  fetchState={fetches[month.month_key]}
                  verification={verifications[month.month_key]}
                  onCompare={() => onCompare(month.month_key)}
                  onFetch={() => onFetch(month.month_key)}
                  onCancel={onCancel ? () => onCancel(month.month_key) : undefined}
                  onVerify={onVerify ? (del) => onVerify(month.month_key, del) : undefined}
                  onDeleteInvoice={onDeleteInvoice ? (ref, type) => onDeleteInvoice(month.month_key, ref, type) : undefined}
                  onDeleteAllExtra={onDeleteAllExtra ? (invs) => onDeleteAllExtra(month.month_key, invs) : undefined}
                />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TypeCell({ count, amount, type, prevAmount, getTrend }: {
  count: number;
  amount: number;
  type: string;
  prevAmount: number | undefined;
  getTrend: (c: number, p: number | undefined) => React.ReactNode;
}) {
  const config = INVOICE_TYPE_CONFIG[type];
  return (
    <td className="px-3 py-3.5 text-right">
      {count > 0 ? (
        <>
          <div className="font-medium" style={{ color: config?.color }}>{formatCurrency(amount)}</div>
          <div className="text-xs text-gray-500">{formatNumber(count)} docs</div>
          <div className="mt-0.5">{getTrend(amount, prevAmount)}</div>
        </>
      ) : (
        <span className="text-gray-300">--</span>
      )}
    </td>
  );
}
