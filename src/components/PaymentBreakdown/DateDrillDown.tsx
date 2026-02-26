import { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { DaySummary, ComparisonState, FetchState, VerifyState, PAYMENT_TYPE_CONFIG, formatCurrency, formatNumber } from './types';
import SyncCheckCell from './SyncCheckCell';

interface DateDrillDownProps {
  days: DaySummary[];
  monthLabel: string;
  onBack: () => void;
  comparisons: Record<string, ComparisonState>;
  fetches: Record<string, FetchState>;
  verifications: Record<string, VerifyState>;
  onCompare: (dateKey: string) => void;
  onFetch: (dateKey: string) => void;
  onVerify: (dateKey: string, fix: boolean) => void;
  onCancel?: (dateKey: string) => void;
}

type SortField = 'date' | 'total' | 'payment' | 'prepayment' | 'voided' | 'refund' | 'balance_wo';

export default function DateDrillDown({
  days, monthLabel, onBack,
  comparisons, fetches, verifications, onCompare, onFetch, onVerify, onCancel,
}: DateDrillDownProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const getTypeAmount = (day: DaySummary, type: string): number => {
    return day.types[type]?.amount || 0;
  };

  const getTypeCount = (day: DaySummary, type: string): number => {
    return day.types[type]?.count || 0;
  };

  const sorted = [...days].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'date': return dir * a.date.localeCompare(b.date);
      case 'total': return dir * (a.total_amount - b.total_amount);
      case 'payment': return dir * (getTypeAmount(a, 'Payment') - getTypeAmount(b, 'Payment'));
      case 'prepayment': return dir * (getTypeAmount(a, 'Prepayment') - getTypeAmount(b, 'Prepayment'));
      case 'voided': return dir * ((getTypeAmount(a, 'Voided Payment') + getTypeAmount(a, 'Voided Check')) - (getTypeAmount(b, 'Voided Payment') + getTypeAmount(b, 'Voided Check')));
      case 'refund': return dir * (getTypeAmount(a, 'Refund') - getTypeAmount(b, 'Refund'));
      case 'balance_wo': return dir * (getTypeAmount(a, 'Balance WO') - getTypeAmount(b, 'Balance WO'));
      default: return 0;
    }
  });

  const totals = days.reduce((acc, day) => {
    acc.total += day.total_amount;
    acc.count += day.total_count;
    Object.entries(day.types).forEach(([type, data]) => {
      if (!acc.types[type]) acc.types[type] = { count: 0, amount: 0 };
      acc.types[type].count += data.count;
      acc.types[type].amount += data.amount;
    });
    return acc;
  }, { total: 0, count: 0, types: {} as Record<string, { count: number; amount: number }> });

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
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            ← All Months
          </button>
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <h3 className="text-lg font-bold text-gray-900">{monthLabel} - Daily Breakdown</h3>
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {days.length} days with activity
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Total', amount: totals.total, count: totals.count, color: 'text-gray-900', bg: 'bg-gray-50' },
          { label: 'Payments', amount: totals.types['Payment']?.amount || 0, count: totals.types['Payment']?.count || 0, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Prepayments', amount: totals.types['Prepayment']?.amount || 0, count: totals.types['Prepayment']?.count || 0, color: 'text-cyan-700', bg: 'bg-cyan-50' },
          { label: 'Voided', amount: (totals.types['Voided Payment']?.amount || 0) + (totals.types['Voided Check']?.amount || 0), count: (totals.types['Voided Payment']?.count || 0) + (totals.types['Voided Check']?.count || 0), color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Refunds', amount: totals.types['Refund']?.amount || 0, count: totals.types['Refund']?.count || 0, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Balance W/O', amount: totals.types['Balance WO']?.amount || 0, count: totals.types['Balance WO']?.count || 0, color: 'text-gray-600', bg: 'bg-gray-50' },
        ].map(stat => (
          <div key={stat.label} className={`${stat.bg} rounded-lg p-3 border border-gray-100`}>
            <div className="text-xs font-medium text-gray-500 mb-1">{stat.label}</div>
            <div className={`text-sm font-bold ${stat.color}`}>{formatCurrency(stat.amount)}</div>
            <div className="text-xs text-gray-400">{formatNumber(stat.count)} txns</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortHeader field="date" className="text-left text-gray-600 sticky left-0 bg-gray-50 z-10">Date</SortHeader>
              <SortHeader field="total" className="text-right text-gray-600">Total</SortHeader>
              <SortHeader field="payment" className="text-right text-blue-600">Payments</SortHeader>
              <SortHeader field="prepayment" className="text-right text-cyan-600">Prepayments</SortHeader>
              <SortHeader field="voided" className="text-right text-red-600">Voided</SortHeader>
              <SortHeader field="refund" className="text-right text-amber-600">Refunds</SortHeader>
              <SortHeader field="balance_wo" className="text-right text-gray-500">Balance W/O</SortHeader>
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center text-gray-600">
                Sync Check
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(day => {
              const isExpanded = expandedDate === day.date;
              const dayOfWeek = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
              return (
                <DateRow
                  key={day.date}
                  day={day}
                  dayOfWeek={dayOfWeek}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedDate(isExpanded ? null : day.date)}
                  comparison={comparisons[day.date]}
                  fetchState={fetches[day.date]}
                  verification={verifications[day.date]}
                  onCompare={() => onCompare(day.date)}
                  onFetch={() => onFetch(day.date)}
                  onVerify={(fix) => onVerify(day.date, fix)}
                  onCancel={onCancel ? () => onCancel(day.date) : undefined}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DateRow({ day, dayOfWeek, isExpanded, onToggle, comparison, fetchState, verification, onCompare, onFetch, onVerify, onCancel }: {
  day: DaySummary;
  dayOfWeek: string;
  isExpanded: boolean;
  onToggle: () => void;
  comparison: ComparisonState | undefined;
  fetchState: FetchState | undefined;
  verification: VerifyState | undefined;
  onCompare: () => void;
  onFetch: () => void;
  onVerify: (fix: boolean) => void;
  onCancel?: () => void;
}) {
  const allTypes = ['Payment', 'Prepayment', 'Voided Payment', 'Voided Check', 'Refund', 'Balance WO'];

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-gray-100 cursor-pointer transition-all ${
          isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
      >
        <td className={`px-3 py-3 sticky left-0 z-10 ${isExpanded ? 'bg-blue-50' : 'bg-white'}`}>
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown size={14} className="text-blue-600" /> : <ChevronRight size={14} className="text-gray-400" />}
            <div>
              <span className="font-semibold text-gray-900">{day.label}</span>
              <span className="ml-2 text-xs text-gray-400">{dayOfWeek}</span>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-right">
          <div className="font-semibold text-gray-900">{formatCurrency(day.total_amount)}</div>
          <div className="text-xs text-gray-500">{formatNumber(day.total_count)} txns</div>
        </td>
        <TypeCell types={day.types} typeKey="Payment" />
        <TypeCell types={day.types} typeKey="Prepayment" />
        <td className="px-3 py-3 text-right">
          {(day.types['Voided Payment'] || day.types['Voided Check']) ? (
            <>
              <div className="font-medium text-red-600">
                {formatCurrency((day.types['Voided Payment']?.amount || 0) + (day.types['Voided Check']?.amount || 0))}
              </div>
              <div className="text-xs text-gray-500">
                {formatNumber((day.types['Voided Payment']?.count || 0) + (day.types['Voided Check']?.count || 0))} txns
              </div>
            </>
          ) : (
            <span className="text-gray-300">--</span>
          )}
        </td>
        <TypeCell types={day.types} typeKey="Refund" />
        <TypeCell types={day.types} typeKey="Balance WO" />
        <SyncCheckCell
          cellKey={day.date}
          comparison={comparison}
          fetchState={fetchState}
          verification={verification}
          onCompare={onCompare}
          onFetch={onFetch}
          onVerify={onVerify}
          onCancel={onCancel}
        />
      </tr>
      {isExpanded && (
        <tr className="bg-blue-50/50">
          <td colSpan={8} className="px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allTypes.filter(t => day.types[t]).map(type => {
                const data = day.types[type];
                const config = PAYMENT_TYPE_CONFIG[type];
                return (
                  <div key={type} className={`${config?.bgColor || 'bg-gray-50'} rounded-lg p-3 border border-gray-100`}>
                    <div className={`text-xs font-semibold ${config?.textColor || 'text-gray-600'} mb-2`}>
                      {config?.label || type}
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-bold text-gray-900">{formatCurrency(data.amount)}</span>
                      <span className="text-xs text-gray-500">{formatNumber(data.count)} transactions</span>
                    </div>
                    {Object.keys(data.statuses).length > 1 && (
                      <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                        {Object.entries(data.statuses).map(([status, sData]) => (
                          <div key={status} className="flex justify-between text-xs">
                            <span className="text-gray-500">{status}</span>
                            <span className="font-medium text-gray-700">{formatNumber(sData.count)} @ {formatCurrency(sData.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TypeCell({ types, typeKey }: { types: DaySummary['types']; typeKey: string }) {
  const data = types[typeKey];
  const config = PAYMENT_TYPE_CONFIG[typeKey];
  return (
    <td className="px-3 py-3 text-right">
      {data ? (
        <>
          <div className="font-medium" style={{ color: config?.color }}>{formatCurrency(data.amount)}</div>
          <div className="text-xs text-gray-500">{formatNumber(data.count)} txns</div>
        </>
      ) : (
        <span className="text-gray-300">--</span>
      )}
    </td>
  );
}
