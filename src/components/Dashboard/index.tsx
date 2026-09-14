import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  DollarSign, FileText, AlertTriangle, Users, CalendarDays, ChevronLeft, ChevronRight,
  Bell, Ticket, ArrowRight, Loader2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Receipt,
} from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, addMonths, subMonths,
} from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import CountUp from '../CountUp';

const money0 = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const money2 = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const short = (n: number) => {
  const v = Number(n) || 0;
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${Math.round(v)}`;
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SEG_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

interface TopCustomer { customer_id: string; customer_name: string; email: string; balance: number; invoices: number; overdue: number; color: string | null; }
interface TrendPoint { month: string; invoiced: number; collected: number; }
interface Segment { name: string; value: number; }
interface TaskItem { date: string; kind: 'reminder' | 'promise'; title: string; sub: string; }

export default function Dashboard() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { profile, user } = useAuth();
  const go = (path: string) => navigate(`/${orgSlug}/${path}`);

  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState({ openAR: 0, openInvoices: 0, overdue30: 0, customers: 0 });
  const [collected, setCollected] = useState({ month: 0, momPct: null as number | null });
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [today, setToday] = useState({ invCount: 0, invAmount: 0, payCount: 0, payAmount: 0 });
  const [upcoming, setUpcoming] = useState<TaskItem[]>([]);

  // Calendar (task counts per day for the visible month)
  const [cursor, setCursor] = useState(() => new Date());
  const [calMap, setCalMap] = useState<Map<string, number>>(new Map());

  // ---- core load (once) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const tomorrowStr = format(addMonths(new Date(), 0), 'yyyy-MM-dd'); // placeholder; use range below
        const startOfToday = `${todayStr}T00:00:00`;
        const endOfToday = `${todayStr}T23:59:59`;

        const [
          statsRes, summaryRes, topRes, segRes, invMonthRes, payMonthRes, invTodayRes, payTodayRes,
        ] = await Promise.all([
          supabase.from('cached_customer_stats').select('*').eq('id', 1).maybeSingle(),
          supabase.rpc('get_customer_statements_summary', { p_test_mode: false }),
          supabase.from('cached_customer_balances')
            .select('customer_id, customer_name, email_address, calculated_balance, open_invoice_count, max_days_overdue, color_status')
            .eq('is_test_customer', false).order('calculated_balance', { ascending: false }).limit(8),
          supabase.from('cached_customer_balances')
            .select('calculated_balance, max_days_overdue').eq('is_test_customer', false)
            .order('calculated_balance', { ascending: false }).limit(2000),
          supabase.rpc('get_invoice_month_summary'),
          supabase.rpc('get_payment_month_summary'),
          supabase.from('acumatica_invoices').select('amount, type').eq('date', todayStr).neq('status', 'On Hold'),
          supabase.from('acumatica_payments').select('payment_amount, type').gte('application_date', startOfToday).lte('application_date', endOfToday),
        ]);
        if (cancelled) return;

        // KPIs
        const s: any = statsRes.data || {};
        const sum: any = (summaryRes.data && (summaryRes.data as any[])[0]) || {};
        setKpi({
          openAR: Number(s.total_balance_excl_test ?? s.total_balance ?? sum.total_open_balance ?? 0),
          openInvoices: Number(s.total_open_invoices ?? sum.open_invoices ?? 0),
          overdue30: Number(sum.overdue_30_count ?? s.customers_with_overdue ?? 0),
          customers: Number(s.customers_with_debt ?? s.total_customers_excl_test ?? s.total_customers ?? 0),
        });

        // Top customers
        setTopCustomers(((topRes.data as any[]) || []).map(r => ({
          customer_id: r.customer_id, customer_name: r.customer_name || r.customer_id,
          email: r.email_address || '', balance: Number(r.calculated_balance) || 0,
          invoices: Number(r.open_invoice_count) || 0, overdue: Number(r.max_days_overdue) || 0,
          color: r.color_status || null,
        })));

        // Segments (aging by balance)
        const buckets = [
          { name: 'Current', lo: -Infinity, hi: 1 }, { name: '1–30', lo: 1, hi: 31 },
          { name: '31–60', lo: 31, hi: 61 }, { name: '61–90', lo: 61, hi: 91 }, { name: '90+', lo: 91, hi: Infinity },
        ];
        const seg = buckets.map(b => ({ name: b.name, value: 0 }));
        for (const r of (segRes.data as any[]) || []) {
          const d = Number(r.max_days_overdue) || 0;
          const bal = Number(r.calculated_balance) || 0;
          if (bal <= 0) continue;
          const idx = buckets.findIndex(b => d >= b.lo && d < b.hi);
          if (idx >= 0) seg[idx].value += bal;
        }
        setSegments(seg.map(x => ({ name: x.name, value: Math.round(x.value) })));

        // Trend: merge invoice + payment month summaries
        const invRows = (invMonthRes.data as any[]) || [];
        const payRows = (payMonthRes.data as any[]) || [];
        const byMonth = new Map<string, { label: string; invoiced: number; collected: number }>();
        for (const r of invRows) byMonth.set(r.month_key, { label: r.month_label, invoiced: Number(r.total_amount) || 0, collected: 0 });
        for (const r of payRows) {
          const e = byMonth.get(r.month_key) || { label: r.month_label, invoiced: 0, collected: 0 };
          e.collected = Number(r.payment_amount ?? r.total_amount) || 0;
          byMonth.set(r.month_key, e);
        }
        const keys = [...byMonth.keys()].sort();
        const last = keys.slice(-8);
        setTrend(last.map(k => ({ month: byMonth.get(k)!.label, invoiced: byMonth.get(k)!.invoiced, collected: byMonth.get(k)!.collected })));

        // Collected this month + MoM
        const curKey = format(new Date(), 'yyyy-MM');
        const prevKey = format(subMonths(new Date(), 1), 'yyyy-MM');
        const cur = byMonth.get(curKey)?.collected || 0;
        const prev = byMonth.get(prevKey)?.collected || 0;
        setCollected({ month: cur, momPct: prev > 0 ? ((cur - prev) / prev) * 100 : null });

        // Today tiles
        const invT = (invTodayRes.data as any[]) || [];
        const payT = (payTodayRes.data as any[]) || [];
        setToday({
          invCount: invT.length,
          invAmount: invT.reduce((a, i) => a + (Number(i.amount) || 0), 0),
          payCount: payT.filter(p => ['Payment', 'Prepayment'].includes(p.type)).length,
          payAmount: payT.filter(p => ['Payment', 'Prepayment'].includes(p.type)).reduce((a, p) => a + (Number(p.payment_amount) || 0), 0),
        });
      } catch (e) {
        console.error('Dashboard core load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- upcoming tasks (once) ----
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const start = format(new Date(), 'yyyy-MM-dd');
        const end = format(addMonths(new Date(), 2), 'yyyy-MM-dd');
        const { data } = await supabase.rpc('get_collector_calendar_data', { p_user_id: user.id, p_start_date: start, p_end_date: end });
        if (cancelled || !data) return;
        const items: TaskItem[] = [];
        for (const r of (data as any).reminders || []) {
          const d = (r.reminder_date || '').slice(0, 10);
          if (d) items.push({ date: d, kind: 'reminder', title: r.reminder_message || 'Reminder', sub: 'Reminder' });
        }
        for (const p of (data as any).promises || []) {
          const d = (p.promise_date || '').slice(0, 10);
          if (d) items.push({ date: d, kind: 'promise', title: p.customer_name || p.ticket_number || 'Promise to pay', sub: `${p.ticket_number || 'Ticket'} · ${short(Number(p.total_balance) || 0)}` });
        }
        items.sort((a, b) => a.date.localeCompare(b.date));
        setUpcoming(items.slice(0, 6));
      } catch (e) { console.error('Dashboard tasks load failed', e); }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ---- calendar month task counts ----
  const loadCal = useCallback(async (base: Date) => {
    if (!user?.id) return;
    const start = format(startOfWeek(startOfMonth(base)), 'yyyy-MM-dd');
    const end = format(endOfWeek(endOfMonth(base)), 'yyyy-MM-dd');
    try {
      const { data } = await supabase.rpc('get_collector_calendar_data', { p_user_id: user.id, p_start_date: start, p_end_date: end });
      const m = new Map<string, number>();
      if (data) {
        for (const r of (data as any).reminders || []) { const d = (r.reminder_date || '').slice(0, 10); if (d) m.set(d, (m.get(d) || 0) + 1); }
        for (const p of (data as any).promises || []) { const d = (p.promise_date || '').slice(0, 10); if (d) m.set(d, (m.get(d) || 0) + 1); }
      }
      setCalMap(m);
    } catch (e) { console.error(e); }
  }, [user?.id]);
  useEffect(() => { loadCal(cursor); }, [cursor, loadCal]);

  const calDays = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) }),
    [cursor],
  );

  const firstName = (profile?.full_name || (profile as any)?.email || 'there').split(' ')[0];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}!</h1>
          <p className="text-sm text-gray-500 mt-0.5">Here's your accounts-receivable snapshot for today.</p>
        </div>
        <p className="text-sm text-gray-500">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<DollarSign className="w-5 h-5 text-red-600" />} bg="bg-red-50" label="Total open AR" value={loading ? null : kpi.openAR} fmt={money0} />
        <Kpi icon={<FileText className="w-5 h-5 text-blue-600" />} bg="bg-blue-50" label="Open invoices" value={loading ? null : kpi.openInvoices} fmt={(n) => Math.round(n).toLocaleString()} />
        <Kpi icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} bg="bg-amber-50" label="Overdue 30+ days" value={loading ? null : kpi.overdue30} fmt={(n) => Math.round(n).toLocaleString()} suffix=" customers" />
        <Kpi icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" label="Collected this month" value={loading ? null : collected.month} fmt={money0}
          change={collected.momPct} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT / MAIN */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customers table */}
          <Card title="Top customers by balance" action={<button onClick={() => go('customers')} className="text-sm font-medium text-blue-600 hover:text-blue-700">View all</button>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 px-3 font-medium hidden md:table-cell">Email</th>
                    <th className="py-2 px-3 font-medium text-right">Invoices</th>
                    <th className="py-2 px-3 font-medium text-right">Overdue</th>
                    <th className="py-2 pl-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    [...Array(6)].map((_, i) => <tr key={i}><td colSpan={5} className="py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>)
                  ) : topCustomers.map(c => (
                    <tr key={c.customer_id} onClick={() => go(`customers?customer=${c.customer_id}`)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">{c.customer_name}</div>
                        <div className="text-xs text-gray-400">{c.customer_id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 hidden md:table-cell truncate max-w-[220px]">{c.email || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-gray-600">{c.invoices}</td>
                      <td className={`py-2.5 px-3 text-right font-medium ${c.overdue > 60 ? 'text-red-600' : c.overdue > 30 ? 'text-amber-600' : 'text-gray-500'}`}>{c.overdue}d</td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-gray-900">{money0(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Trend + Segments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Invoiced vs collected" subtitle="Last 8 months">
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={trend} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => short(Number(v))} width={44} />
                  <Tooltip formatter={(v: any, n: any) => [money2(Number(v)), n === 'invoiced' ? 'Invoiced' : 'Collected']} />
                  <Line type="monotone" dataKey="invoiced" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500 mt-1">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Invoiced</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Collected</span>
              </div>
            </Card>

            <Card title="AR by aging" subtitle="Open balance by days overdue">
              <div className="flex items-center gap-3">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={segments} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={78} paddingAngle={2}>
                      {segments.map((_, i) => <Cell key={i} fill={SEG_COLORS[i % SEG_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [money2(Number(v)), n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {segments.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-gray-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />{s.name}</span>
                      <span className="font-semibold text-gray-800 tabular-nums">{short(s.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-6">
          {/* Calendar */}
          <Card title="Task calendar" action={
            <div className="flex items-center gap-1">
              <button onClick={() => setCursor(subMonths(cursor, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-medium text-gray-600 w-24 text-center">{format(cursor, 'MMMM yyyy')}</span>
              <button onClick={() => setCursor(addMonths(cursor, 1))} className="p-1 rounded hover:bg-gray-100 text-gray-500"><ChevronRight className="w-4 h-4" /></button>
            </div>
          }>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d[0]}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const count = calMap.get(key) || 0;
                const inMonth = isSameMonth(day, cursor);
                return (
                  <div key={key} className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] ${!inMonth ? 'opacity-30' : ''} ${isToday(day) ? 'bg-blue-600 text-white font-bold' : count ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}>
                    {format(day, 'd')}
                    {count > 0 && !isToday(day) && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    {count > 0 && isToday(day) && <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Upcoming tasks */}
          <Card title="Upcoming tasks" action={<button onClick={() => go('my-assignments')} className="text-sm font-medium text-blue-600 hover:text-blue-700">View all</button>}>
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No upcoming tasks or reminders.</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((t, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${t.kind === 'reminder' ? 'bg-purple-50 text-purple-600' : 'bg-amber-50 text-amber-600'}`}>
                      {t.kind === 'reminder' ? <Bell className="w-3.5 h-3.5" /> : <Ticket className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                      <p className="text-xs text-gray-400">{format(new Date(t.date + 'T00:00:00'), 'MMM d')} · {t.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Scroll-down: today / period analytics */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Today at a glance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MiniStat icon={<Receipt className="w-5 h-5 text-blue-600" />} bg="bg-blue-50" label="Invoices added today" value={loading ? null : today.invCount} fmt={(n) => Math.round(n).toLocaleString()} />
          <MiniStat icon={<DollarSign className="w-5 h-5 text-blue-600" />} bg="bg-blue-50" label="Invoiced today" value={loading ? null : today.invAmount} fmt={money0} />
          <MiniStat icon={<ArrowDownRight className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" label="Payments received today" value={loading ? null : today.payCount} fmt={(n) => Math.round(n).toLocaleString()} />
          <MiniStat icon={<DollarSign className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" label="Collected today" value={loading ? null : today.payAmount} fmt={money0} />
        </div>
      </div>

      {/* Top overdue */}
      <Card title="Highest overdue customers" action={<button onClick={() => go('customers')} className="text-sm font-medium text-blue-600 hover:text-blue-700">View all</button>}>
        {loading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {[...topCustomers].sort((a, b) => b.overdue - a.overdue).slice(0, 6).map(c => (
              <div key={c.customer_id} onClick={() => go(`customers?customer=${c.customer_id}`)} className="flex items-center justify-between py-1.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 rounded px-1">
                <span className="text-sm text-gray-700 truncate max-w-[220px]">{c.customer_name}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium ${c.overdue > 60 ? 'text-red-600' : 'text-amber-600'}`}>{c.overdue}d</span>
                  <span className="text-sm font-semibold text-gray-900">{money0(c.balance)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Kpi({ icon, bg, label, value, fmt, suffix, change }: { icon: React.ReactNode; bg: string; label: string; value: number | null; fmt: (n: number) => string; suffix?: string; change?: number | null }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
        {typeof change === 'number' && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {change >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(change).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mt-3">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">
        {value === null ? <span className="inline-block h-7 w-24 bg-gray-100 rounded animate-pulse align-middle" /> : <><CountUp value={value} format={fmt} />{suffix && <span className="text-sm font-medium text-gray-400">{suffix}</span>}</>}
      </p>
    </div>
  );
}

function MiniStat({ icon, bg, label, value, fmt }: { icon: React.ReactNode; bg: string; label: string; value: number | null; fmt: (n: number) => string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 tabular-nums">{value === null ? <span className="inline-block h-5 w-16 bg-gray-100 rounded animate-pulse" /> : <CountUp value={value} format={fmt} />}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
    </div>
  );
}
