import { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { InvoiceDaySummary, INVOICE_TYPE_CONFIG, formatCurrency, formatNumber } from './types';

interface InvoiceDateDrillDownProps {
  days: InvoiceDaySummary[];
  monthLabel: string;
  onBack: () => void;
  showBalance: boolean;
}

type SortField = 'date' | 'total' | 'invoice' | 'credit_memo' | 'debit_memo' | 'credit_wo' | 'overdue_charge';

export default function InvoiceDateDrillDown({ days, monthLabel, onBack, showBalance }: InvoiceDateDrillDownProps) {
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

  const getTypeVal = (day: InvoiceDaySummary, type: string): number => {
    const d = day.types[type];
    if (!d) return 0;
    return showBalance ? d.balance : d.amount;
  };

  const sorted = [...days].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'date': return dir * a.date.localeCompare(b.date);
      case 'total': return dir * ((showBalance ? a.total_balance : a.total_amount) - (showBalance ? b.total_balance : b.total_amount));
      case 'invoice': return dir * (getTypeVal(a, 'Invoice') - getTypeVal(b, 'Invoice'));
      case 'credit_memo': return dir * (getTypeVal(a, 'Credit Memo') - getTypeVal(b, 'Credit Memo'));
      case 'debit_memo': return dir * (getTypeVal(a, 'Debit Memo') - getTypeVal(b, 'Debit Memo'));
      case 'credit_wo': return dir * (getTypeVal(a, 'Credit WO') - getTypeVal(b, 'Credit WO'));
      case 'overdue_charge': return dir * (getTypeVal(a, 'Overdue Charge') - getTypeVal(b, 'Overdue Charge'));
      default: return 0;
    }
  });

  const totals = days.reduce((acc, day) => {
    acc.totalAmount += day.total_amount;
    acc.totalBalance += day.total_balance;
    acc.count += day.total_count;
    Object.entries(day.types).forEach(([type, data]) => {
      if (!acc.types[type]) acc.types[type] = { count: 0, amount: 0, balance: 0 };
      acc.types[type].count += data.count;
      acc.types[type].amount += data.amount;
      acc.types[type].balance += data.balance;
    });
    return acc;
  }, { totalAmount: 0, totalBalance: 0, count: 0, types: {} as Record<string, { count: number; amount: number; balance: number }> });

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

  const allTypes = ['Invoice', 'Credit Memo', 'Debit Memo', 'Credit WO', 'Overdue Charge'];

  const summaryCards = [
    { label: 'Total', val: showBalance ? totals.totalBalance : totals.totalAmount, count: totals.count, color: 'text-gray-900', bg: 'bg-gray-50' },
    ...allTypes.map(type => {
      const config = INVOICE_TYPE_CONFIG[type];
      const t = totals.types[type];
      return {
        label: config?.label || type,
        val: t ? (showBalance ? t.balance : t.amount) : 0,
        count: t?.count || 0,
        color: config?.textColor || 'text-gray-700',
        bg: config?.bgColor || 'bg-gray-50',
      };
    }),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            &larr; All Months
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
        {summaryCards.map(stat => (
          <div key={stat.label} className={`${stat.bg} rounded-lg p-3 border border-gray-100`}>
            <div className="text-xs font-medium text-gray-500 mb-1">{stat.label}</div>
            <div className={`text-sm font-bold ${stat.color}`}>{formatCurrency(stat.val)}</div>
            <div className="text-xs text-gray-400">{formatNumber(stat.count)} docs</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortHeader field="date" className="text-left text-gray-600 sticky left-0 bg-gray-50 z-10">Date</SortHeader>
              <SortHeader field="total" className="text-right text-gray-600">Total</SortHeader>
              <SortHeader field="invoice" className="text-right text-blue-600">Invoices</SortHeader>
              <SortHeader field="credit_memo" className="text-right text-emerald-600">Credit Memos</SortHeader>
              <SortHeader field="debit_memo" className="text-right text-amber-600">Debit Memos</SortHeader>
              <SortHeader field="credit_wo" className="text-right text-gray-500">Credit W/O</SortHeader>
              <SortHeader field="overdue_charge" className="text-right text-red-600">Overdue Charges</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.map(day => {
              const isExpanded = expandedDate === day.date;
              const dayOfWeek = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
              const totalVal = showBalance ? day.total_balance : day.total_amount;
              return (
                <DateRow
                  key={day.date}
                  day={day}
                  dayOfWeek={dayOfWeek}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedDate(isExpanded ? null : day.date)}
                  showBalance={showBalance}
                  totalVal={totalVal}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DateRow({ day, dayOfWeek, isExpanded, onToggle, showBalance, totalVal }: {
  day: InvoiceDaySummary;
  dayOfWeek: string;
  isExpanded: boolean;
  onToggle: () => void;
  showBalance: boolean;
  totalVal: number;
}) {
  const allTypes = ['Invoice', 'Credit Memo', 'Debit Memo', 'Credit WO', 'Overdue Charge'];

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
          <div className="font-semibold text-gray-900">{formatCurrency(totalVal)}</div>
          <div className="text-xs text-gray-500">{formatNumber(day.total_count)} docs</div>
        </td>
        {allTypes.map(type => (
          <TypeCell key={type} types={day.types} typeKey={type} showBalance={showBalance} />
        ))}
      </tr>
      {isExpanded && (
        <tr className="bg-blue-50/50">
          <td colSpan={7} className="px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allTypes.filter(t => day.types[t]).map(type => {
                const data = day.types[type];
                const config = INVOICE_TYPE_CONFIG[type];
                return (
                  <div key={type} className={`${config?.bgColor || 'bg-gray-50'} rounded-lg p-3 border border-gray-100`}>
                    <div className={`text-xs font-semibold ${config?.textColor || 'text-gray-600'} mb-2`}>
                      {config?.label || type}
                    </div>
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(data.amount)}</span>
                        {data.balance !== data.amount && (
                          <span className="text-xs text-gray-500 ml-2">({formatCurrency(data.balance)} open)</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">{formatNumber(data.count)} docs</span>
                    </div>
                    {Object.keys(data.statuses).length > 1 && (
                      <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                        {Object.entries(data.statuses).map(([status, sData]) => (
                          <div key={status} className="flex justify-between text-xs">
                            <span className="text-gray-500">{status}</span>
                            <span className="font-medium text-gray-700">
                              {formatNumber(sData.count)} @ {formatCurrency(sData.amount)}
                              {sData.balance !== sData.amount && (
                                <span className="text-gray-400 ml-1">({formatCurrency(sData.balance)} open)</span>
                              )}
                            </span>
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

function TypeCell({ types, typeKey, showBalance }: { types: InvoiceDaySummary['types']; typeKey: string; showBalance: boolean }) {
  const data = types[typeKey];
  const config = INVOICE_TYPE_CONFIG[typeKey];
  return (
    <td className="px-3 py-3 text-right">
      {data ? (
        <>
          <div className="font-medium" style={{ color: config?.color }}>
            {formatCurrency(showBalance ? data.balance : data.amount)}
          </div>
          <div className="text-xs text-gray-500">{formatNumber(data.count)} docs</div>
        </>
      ) : (
        <span className="text-gray-300">--</span>
      )}
    </td>
  );
}
