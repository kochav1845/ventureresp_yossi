import { useState } from 'react';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { MonthSummary, ComparisonState, FetchState, VerifyState, PAYMENT_TYPE_CONFIG, formatCurrency, formatNumber } from './types';
import SyncCheckCell from './SyncCheckCell';

interface MonthComparisonTableProps {
  months: MonthSummary[];
  onMonthClick: (monthKey: string) => void;
  selectedMonth: string | null;
  comparisons: Record<string, ComparisonState>;
  fetches: Record<string, FetchState>;
  verifications: Record<string, VerifyState>;
  onCompare: (monthKey: string) => void;
  onFetch: (monthKey: string) => void;
  onVerify: (monthKey: string, fix: boolean) => void;
}

type SortField = 'month' | 'total' | 'payments' | 'prepayments' | 'voided' | 'refunds' | 'balance_wo';
type SortDir = 'asc' | 'desc';

export default function MonthComparisonTable({
  months, onMonthClick, selectedMonth,
  comparisons, fetches, verifications, onCompare, onFetch, onVerify,
}: MonthComparisonTableProps) {
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

  const sorted = [...months].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'month': return dir * a.month_key.localeCompare(b.month_key);
      case 'total': return dir * (a.total_amount - b.total_amount);
      case 'payments': return dir * (a.payment_amount - b.payment_amount);
      case 'prepayments': return dir * (a.prepayment_amount - b.prepayment_amount);
      case 'voided': return dir * (a.voided_amount - b.voided_amount);
      case 'refunds': return dir * (a.refund_amount - b.refund_amount);
      case 'balance_wo': return dir * (a.balance_wo_amount - b.balance_wo_amount);
      default: return 0;
    }
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
          <span className="text-blue-600">{sortDir === 'desc' ? '↓' : '↑'}</span>
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
            <SortHeader field="payments" className="text-right text-blue-600">Payments</SortHeader>
            <SortHeader field="prepayments" className="text-right text-cyan-600">Prepayments</SortHeader>
            <SortHeader field="voided" className="text-right text-red-600">Voided</SortHeader>
            <SortHeader field="refunds" className="text-right text-amber-600">Refunds</SortHeader>
            <SortHeader field="balance_wo" className="text-right text-gray-500">Balance W/O</SortHeader>
            <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center text-gray-600">
              Sync Check
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((month, idx) => {
            const prevMonth = sorted[idx + 1];
            const isSelected = selectedMonth === month.month_key;
            return (
              <tr
                key={month.month_key}
                onClick={() => onMonthClick(month.month_key)}
                className={`border-b border-gray-100 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className={`px-3 py-3.5 sticky left-0 z-10 ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                  <div className="flex items-center gap-2">
                    {isSelected ? <ChevronDown size={16} className="text-blue-600" /> : <ChevronRight size={16} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900">{month.month_label}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <div className="font-semibold text-gray-900">{formatCurrency(month.total_amount)}</div>
                  <div className="text-xs text-gray-500">{formatNumber(month.total_payments)} txns</div>
                  <div className="mt-0.5">{getTrend(month.total_amount, prevMonth?.total_amount)}</div>
                </td>
                <TypeCell count={month.payment_count} amount={month.payment_amount} type="Payment" prevAmount={prevMonth?.payment_amount} getTrend={getTrend} />
                <TypeCell count={month.prepayment_count} amount={month.prepayment_amount} type="Prepayment" prevAmount={prevMonth?.prepayment_amount} getTrend={getTrend} />
                <TypeCell count={month.voided_count} amount={month.voided_amount} type="Voided Payment" prevAmount={prevMonth?.voided_amount} getTrend={getTrend} />
                <TypeCell count={month.refund_count} amount={month.refund_amount} type="Refund" prevAmount={prevMonth?.refund_amount} getTrend={getTrend} />
                <TypeCell count={month.balance_wo_count} amount={month.balance_wo_amount} type="Balance WO" prevAmount={prevMonth?.balance_wo_amount} getTrend={getTrend} />
                <SyncCheckCell
                  comparison={comparisons[month.month_key]}
                  fetchState={fetches[month.month_key]}
                  verification={verifications[month.month_key]}
                  onCompare={() => onCompare(month.month_key)}
                  onFetch={() => onFetch(month.month_key)}
                  onVerify={(fix) => onVerify(month.month_key, fix)}
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
  const config = PAYMENT_TYPE_CONFIG[type];
  return (
    <td className="px-3 py-3.5 text-right">
      {count > 0 ? (
        <>
          <div className="font-medium" style={{ color: config?.color }}>{formatCurrency(amount)}</div>
          <div className="text-xs text-gray-500">{formatNumber(count)} txns</div>
          <div className="mt-0.5">{getTrend(amount, prevAmount)}</div>
        </>
      ) : (
        <span className="text-gray-300">--</span>
      )}
    </td>
  );
}
