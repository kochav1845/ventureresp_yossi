import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Zap, ZapOff } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { useStatementCalendar } from './useStatementCalendar';

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `$${Math.round(n)}`;

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function StatementCalendar({ testMode }: { testMode: boolean }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const { enabled, loading, computeMonth, ruleCount } = useStatementCalendar(testMode);

  const year = cursor.getFullYear();
  const month1 = cursor.getMonth() + 1;
  const dayData = useMemo(() => computeMonth(year, month1), [computeMonth, year, month1]);

  const grid = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) }),
    [cursor],
  );

  const totals = useMemo(() => {
    let statements = 0, invoices = 0, amount = 0;
    for (const d of dayData.values()) { statements += d.statements; invoices += d.invoices; amount += d.amount; }
    return { statements, invoices, amount };
  }, [dayData]);

  const sel = selected ? dayData.get(selected) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {/* Header + month nav */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Statements going out</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { setCursor(subMonths(cursor, 1)); setSelected(null); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 w-28 text-center">{format(cursor, 'MMMM yyyy')}</span>
          <button onClick={() => { setCursor(addMonths(cursor, 1)); setSelected(null); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Automation state */}
      <div className={`flex items-center gap-1.5 text-[11px] mb-3 ${enabled ? 'text-emerald-600' : 'text-amber-600'}`}>
        {enabled ? <Zap className="w-3 h-3" /> : <ZapOff className="w-3 h-3" />}
        {enabled ? 'Automatic sending is on' : 'Automatic sending is off — this is the scheduled plan'}
      </div>

      {/* Month totals */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-blue-50 px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-blue-700 tabular-nums">{totals.statements.toLocaleString()}</div>
          <div className="text-[10px] text-blue-600/80">statements</div>
        </div>
        <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-emerald-700 tabular-nums">{totals.invoices.toLocaleString()}</div>
          <div className="text-[10px] text-emerald-600/80">invoices</div>
        </div>
        <div className="rounded-lg bg-red-50 px-2 py-1.5 text-center">
          <div className="text-sm font-bold text-red-700 tabular-nums">{moneyShort(totals.amount)}</div>
          <div className="text-[10px] text-red-600/80">amount</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <>
          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const data = dayData.get(key);
              const inMonth = isSameMonth(day, cursor);
              const isSel = selected === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelected(data ? key : null)}
                  disabled={!data}
                  className={`relative aspect-square rounded-lg p-1 flex flex-col items-center justify-start text-center transition-colors ${
                    !inMonth ? 'opacity-30' : ''
                  } ${
                    isSel ? 'ring-2 ring-blue-500 bg-blue-50'
                      : data ? 'bg-blue-50/60 hover:bg-blue-100 cursor-pointer'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-[11px] leading-none ${isToday(day) ? 'font-bold text-blue-700' : 'text-gray-600'}`}>
                    {format(day, 'd')}
                  </span>
                  {data && (
                    <span className="mt-0.5 flex flex-col items-center leading-tight">
                      <span className="text-[10px] font-bold text-blue-700 tabular-nums">{data.statements}</span>
                      <span className="text-[9px] text-red-600 tabular-nums">{moneyShort(data.amount)}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day detail */}
          {sel && selected && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-700 mb-2">
                {format(new Date(selected + 'T00:00:00'), 'EEEE, MMM d')}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-sm font-bold text-blue-700 tabular-nums">{sel.statements.toLocaleString()}</div><div className="text-[10px] text-gray-500">statements</div></div>
                <div><div className="text-sm font-bold text-emerald-700 tabular-nums">{sel.invoices.toLocaleString()}</div><div className="text-[10px] text-gray-500">invoices</div></div>
                <div><div className="text-sm font-bold text-red-700 tabular-nums">{money(sel.amount)}</div><div className="text-[10px] text-gray-500">amount</div></div>
              </div>
            </div>
          )}

          {ruleCount === 0 && (
            <p className="mt-3 text-[11px] text-gray-400 text-center">
              No automatic statement schedule yet. Set one up with the “Automatic” button.
            </p>
          )}
        </>
      )}
    </div>
  );
}
