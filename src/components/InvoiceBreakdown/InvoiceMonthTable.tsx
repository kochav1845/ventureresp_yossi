import { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { InvoiceMonthSummary, ComparisonState, FetchState, VerificationState, INVOICE_TYPE_CONFIG, INVOICE_STATUS_CONFIG, formatCurrency, formatNumber } from './types';
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

interface TypeStatusBreakdown {
  total_count: number;
  total_amount: number;
  total_balance: number;
  statuses: { status: string; count: number; amount: number }[];
}

function getTypeBreakdown(m: InvoiceMonthSummary, type: string, showBalance: boolean): TypeStatusBreakdown {
  switch (type) {
    case 'Invoice': return {
      total_count: m.invoice_count,
      total_amount: showBalance ? m.invoice_balance : m.invoice_amount,
      total_balance: m.invoice_balance,
      statuses: [
        { status: 'Open', count: m.invoice_open_count || 0, amount: showBalance ? 0 : (m.invoice_open_amount || 0) },
        { status: 'Closed', count: m.invoice_closed_count || 0, amount: showBalance ? 0 : (m.invoice_closed_amount || 0) },
        { status: 'Balanced', count: m.invoice_balanced_count || 0, amount: showBalance ? 0 : (m.invoice_balanced_amount || 0) },
        { status: 'Canceled', count: m.invoice_canceled_count || 0, amount: showBalance ? 0 : (m.invoice_canceled_amount || 0) },
        { status: 'Voided', count: m.invoice_voided_count || 0, amount: showBalance ? 0 : (m.invoice_voided_amount || 0) },
        { status: 'Credit Hold', count: m.invoice_credit_hold_count || 0, amount: showBalance ? 0 : (m.invoice_credit_hold_amount || 0) },
      ].filter(s => s.count > 0),
    };
    case 'Credit Memo': return {
      total_count: m.credit_memo_count,
      total_amount: showBalance ? m.credit_memo_balance : m.credit_memo_amount,
      total_balance: m.credit_memo_balance,
      statuses: [
        { status: 'Open', count: m.credit_memo_open_count || 0, amount: showBalance ? 0 : (m.credit_memo_open_amount || 0) },
        { status: 'Closed', count: m.credit_memo_closed_count || 0, amount: showBalance ? 0 : (m.credit_memo_closed_amount || 0) },
        { status: 'Balanced', count: m.credit_memo_balanced_count || 0, amount: showBalance ? 0 : (m.credit_memo_balanced_amount || 0) },
        { status: 'Canceled', count: m.credit_memo_canceled_count || 0, amount: showBalance ? 0 : (m.credit_memo_canceled_amount || 0) },
        { status: 'Voided', count: m.credit_memo_voided_count || 0, amount: showBalance ? 0 : (m.credit_memo_voided_amount || 0) },
      ].filter(s => s.count > 0),
    };
    case 'Debit Memo': return {
      total_count: m.debit_memo_count,
      total_amount: showBalance ? m.debit_memo_balance : m.debit_memo_amount,
      total_balance: m.debit_memo_balance,
      statuses: [
        { status: 'Open', count: m.debit_memo_open_count || 0, amount: showBalance ? 0 : (m.debit_memo_open_amount || 0) },
        { status: 'Closed', count: m.debit_memo_closed_count || 0, amount: showBalance ? 0 : (m.debit_memo_closed_amount || 0) },
        { status: 'Balanced', count: m.debit_memo_balanced_count || 0, amount: showBalance ? 0 : (m.debit_memo_balanced_amount || 0) },
        { status: 'Canceled', count: m.debit_memo_canceled_count || 0, amount: showBalance ? 0 : (m.debit_memo_canceled_amount || 0) },
        { status: 'Voided', count: m.debit_memo_voided_count || 0, amount: showBalance ? 0 : (m.debit_memo_voided_amount || 0) },
      ].filter(s => s.count > 0),
    };
    case 'Credit WO': return {
      total_count: m.credit_wo_count,
      total_amount: showBalance ? m.credit_wo_balance : m.credit_wo_amount,
      total_balance: m.credit_wo_balance,
      statuses: [],
    };
    case 'Overdue Charge': return {
      total_count: m.overdue_charge_count,
      total_amount: showBalance ? m.overdue_charge_balance : m.overdue_charge_amount,
      total_balance: m.overdue_charge_balance,
      statuses: [],
    };
    default: return { total_count: 0, total_amount: 0, total_balance: 0, statuses: [] };
  }
}

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
      case 'overdue_charge': return showBalance ? m.overdue_charge_balance : m.overdue_charge_amount;
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

  const typeColumns: { field: SortField; type: string }[] = [
    { field: 'invoices', type: 'Invoice' },
    { field: 'credit_memo', type: 'Credit Memo' },
    { field: 'debit_memo', type: 'Debit Memo' },
    { field: 'credit_wo', type: 'Credit WO' },
    { field: 'overdue_charge', type: 'Overdue Charge' },
  ];

  return (
    <div className="overflow-x-auto table-scroll-container max-h-[calc(100vh-300px)]">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr className="bg-gray-50 border-b border-gray-200">
            <SortHeader field="month" className="text-left text-gray-600 sticky left-0 bg-gray-50 z-10">Month</SortHeader>
            <SortHeader field="total" className="text-right text-gray-600">Total</SortHeader>
            {typeColumns.map(col => {
              const config = INVOICE_TYPE_CONFIG[col.type];
              return (
                <SortHeader key={col.field} field={col.field} className="text-right">
                  <span style={{ color: config?.color }}>{config?.label || col.type}</span>
                </SortHeader>
              );
            })}
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
                {typeColumns.map(col => {
                  const breakdown = getTypeBreakdown(month, col.type, showBalance);
                  const prevBreakdown = prevMonth ? getTypeBreakdown(prevMonth, col.type, showBalance) : null;
                  const config = INVOICE_TYPE_CONFIG[col.type];
                  return (
                    <td key={col.field} className="px-3 py-3.5 text-right align-top">
                      {breakdown.total_count > 0 ? (
                        <div>
                          <div className="font-medium" style={{ color: config?.color }}>
                            {formatCurrency(breakdown.total_amount)}
                          </div>
                          <div className="text-xs text-gray-500">{formatNumber(breakdown.total_count)} docs</div>
                          <div className="mt-0.5">{getTrend(breakdown.total_amount, prevBreakdown?.total_amount)}</div>
                          {breakdown.statuses.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-0.5 text-left">
                              {breakdown.statuses.map(s => {
                                const sCfg = INVOICE_STATUS_CONFIG[s.status];
                                return (
                                  <div key={s.status} className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="font-medium" style={{ color: sCfg?.color }}>{s.status}</span>
                                    <span className="text-gray-600 tabular-nums">{formatNumber(s.count)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                  );
                })}
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
