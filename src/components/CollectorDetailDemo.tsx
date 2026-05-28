import { useState, useMemo } from 'react';
import { ArrowLeft, DollarSign, Clock, Filter, X, Target, Award } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface DemoCollector {
  id: string;
  name: string;
  email: string;
  role: string;
  assigned_customers: number;
  total_collected: number;
  invoices_collected: number;
  avg_days_to_collect: number;
  open_tickets: number;
  closed_tickets: number;
  total_actions: number;
  last_active: string;
  collection_rate: number;
  monthly_collections: number[];
  top_customers: string[];
}

interface Props {
  collector: DemoCollector;
  onBack: () => void;
}

type TimeRange = '3m' | '6m' | '12m';
type ChartView = 'collections' | 'invoices' | 'performance';

const MONTHS = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];

function generateInvoiceData(collector: DemoCollector) {
  const invoices = [];
  const customers = [
    ...collector.top_customers,
    'Apex Solutions', 'Diamond Corp', 'Evergreen LLC', 'Falcon Industries', 'Gateway Services',
    'Highland Resources', 'Ironworks Inc', 'Jupiter Tech', 'Keystone Group', 'Liberty Holdings'
  ];
  const statuses = ['Collected', 'Collected', 'Collected', 'Collected', 'Pending', 'Overdue'];

  for (let i = 0; i < 50; i++) {
    const amount = Math.round((Math.random() * 45000 + 5000) * 100) / 100;
    const daysAgo = Math.floor(Math.random() * 365);
    const collectedDaysAfter = Math.floor(Math.random() * 60) + 5;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const invoiceDate = new Date();
    invoiceDate.setDate(invoiceDate.getDate() - daysAgo);

    invoices.push({
      id: `INV-${String(10000 + i).slice(1)}`,
      customer,
      amount,
      invoice_date: invoiceDate.toISOString().split('T')[0],
      days_to_collect: status === 'Collected' ? collectedDaysAfter : null,
      status,
    });
  }
  return invoices;
}

function generateCustomerBreakdown(collector: DemoCollector) {
  return collector.top_customers.map((name, i) => ({
    name,
    collected: Math.round((collector.total_collected / collector.top_customers.length) * (1.3 - i * 0.1)),
    invoices: Math.round(collector.invoices_collected / collector.top_customers.length * (1.2 - i * 0.08)),
    avg_days: Math.round(collector.avg_days_to_collect + (i - 2) * 3),
    outstanding: Math.round(Math.random() * 50000 + 10000),
  }));
}

export default function CollectorDetailDemo({ collector, onBack }: Props) {
  const [timeRange, setTimeRange] = useState<TimeRange>('12m');
  const [chartView, setChartView] = useState<ChartView>('collections');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterMinDays, setFilterMinDays] = useState('');
  const [filterMaxDays, setFilterMaxDays] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(true);

  const monthlyData = useMemo(() => {
    const sliceCount = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
    const startIdx = 12 - sliceCount;
    return collector.monthly_collections.slice(startIdx).map((amount, idx) => ({
      month: MONTHS.slice(startIdx)[idx],
      collected: amount,
      invoices: Math.round(amount / (collector.total_collected / collector.invoices_collected)),
      target: Math.round(amount * (1 + (Math.random() * 0.2 - 0.05))),
    }));
  }, [collector, timeRange]);

  const invoiceData = useMemo(() => generateInvoiceData(collector), [collector]);
  const customerBreakdown = useMemo(() => generateCustomerBreakdown(collector), [collector]);

  const filteredInvoices = useMemo(() => {
    let list = [...invoiceData];
    if (filterMinAmount) list = list.filter(i => i.amount >= Number(filterMinAmount));
    if (filterMaxAmount) list = list.filter(i => i.amount <= Number(filterMaxAmount));
    if (filterCustomer) list = list.filter(i => i.customer.toLowerCase().includes(filterCustomer.toLowerCase()));
    if (filterMinDays) list = list.filter(i => i.days_to_collect !== null && i.days_to_collect >= Number(filterMinDays));
    if (filterMaxDays) list = list.filter(i => i.days_to_collect !== null && i.days_to_collect <= Number(filterMaxDays));
    if (filterStatus !== 'all') list = list.filter(i => i.status === filterStatus);
    return list;
  }, [invoiceData, filterMinAmount, filterMaxAmount, filterCustomer, filterMinDays, filterMaxDays, filterStatus]);

  const activeFilterCount = [filterMinAmount, filterMaxAmount, filterCustomer, filterMinDays, filterMaxDays, filterStatus !== 'all'].filter(Boolean).length;

  const clearFilters = () => {
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setFilterCustomer('');
    setFilterMinDays('');
    setFilterMaxDays('');
    setFilterStatus('all');
  };

  const pieData = [
    { name: 'Collected', value: collector.closed_tickets, color: '#10b981' },
    { name: 'In Progress', value: collector.open_tickets, color: '#f59e0b' },
    { name: 'Overdue', value: Math.round(collector.open_tickets * 0.3), color: '#ef4444' },
  ];

  const performanceMetrics = [
    { label: 'Collection Efficiency', value: `${collector.collection_rate}%`, subtext: 'success rate', icon: Target, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { label: 'Avg Days to Collect', value: `${collector.avg_days_to_collect}`, subtext: 'days average', icon: Clock, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    { label: 'Monthly Average', value: `$${Math.round(collector.total_collected / 12 / 1000)}k`, subtext: 'per month', icon: DollarSign, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { label: 'Tickets Closed', value: `${collector.closed_tickets}`, subtext: `${collector.open_tickets} still open`, icon: Award, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                {collector.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{collector.name}</h1>
                <p className="text-xs text-gray-500">{collector.role} -- {collector.email}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              {(['3m', '6m', '12m'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    timeRange === range ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {range === '3m' ? '3 Months' : range === '6m' ? '6 Months' : '12 Months'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {performanceMetrics.map((metric, i) => (
            <div key={i} className={`rounded-xl p-3 border ${metric.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <metric.icon className="w-4 h-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{metric.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
              <p className="text-xs opacity-70">{metric.subtext}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Chart Section */}
          <div className="grid grid-cols-3 gap-6">
            {/* Main Chart */}
            <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900">Collection Trends</h3>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  {([
                    { key: 'collections', label: 'Amount' },
                    { key: 'invoices', label: 'Invoices' },
                    { key: 'performance', label: 'vs Target' },
                  ] as { key: ChartView; label: string }[]).map(v => (
                    <button
                      key={v.key}
                      onClick={() => setChartView(v.key)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        chartView === v.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  {chartView === 'collections' ? (
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Collected']} />
                      <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2.5} fill="url(#colorCollected)" />
                    </AreaChart>
                  ) : chartView === 'invoices' ? (
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip />
                      <Bar dataKey="invoices" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Invoices Collected" />
                    </BarChart>
                  ) : (
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`]} />
                      <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} name="Collected" />
                      <Line type="monotone" dataKey="target" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
                      <Legend />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ticket Status Pie */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Ticket Status</h3>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={(value) => <span className="text-xs text-gray-700">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-gray-600">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Customer Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Top Customers</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Customer</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Collected</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Invoices</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Avg Days</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customerBreakdown.map((cust, i) => (
                    <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{cust.name}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-emerald-700 tabular-nums">${(cust.collected / 1000).toFixed(0)}k</td>
                      <td className="py-2.5 px-4 text-right text-gray-700 tabular-nums">{cust.invoices}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        <span className={cust.avg_days <= 25 ? 'text-emerald-600' : cust.avg_days <= 35 ? 'text-amber-600' : 'text-red-600'}>
                          {cust.avg_days}d
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-red-600 font-medium tabular-nums">${(cust.outstanding / 1000).toFixed(1)}k</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoice Detail Table with Filters */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-gray-900">Invoice Details</h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {filteredInvoices.length} of {invoiceData.length}
                </span>
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-600 text-white text-[9px] font-bold rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <div className="grid grid-cols-6 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Min Amount</label>
                    <input type="number" value={filterMinAmount} onChange={(e) => setFilterMinAmount(e.target.value)}
                      placeholder="$0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Amount</label>
                    <input type="number" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(e.target.value)}
                      placeholder="Any" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Customer</label>
                    <input type="text" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}
                      placeholder="Search..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Min Days</label>
                    <input type="number" value={filterMinDays} onChange={(e) => setFilterMinDays(e.target.value)}
                      placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Days</label>
                    <input type="number" value={filterMaxDays} onChange={(e) => setFilterMaxDays(e.target.value)}
                      placeholder="Any" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Status</label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="all">All</option>
                      <option value="Collected">Collected</option>
                      <option value="Pending">Pending</option>
                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="mt-3 flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium">
                    <X className="w-3 h-3" /> Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* Invoice Table */}
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Invoice</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Customer</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Amount</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Days to Collect</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-2 px-4 font-medium text-blue-600">{inv.id}</td>
                      <td className="py-2 px-4 text-gray-700">{inv.customer}</td>
                      <td className="py-2 px-4 text-right font-semibold text-gray-900 tabular-nums">
                        ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-4 text-gray-500 text-xs">{inv.invoice_date}</td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        {inv.days_to_collect !== null ? (
                          <span className={inv.days_to_collect <= 25 ? 'text-emerald-600' : inv.days_to_collect <= 40 ? 'text-amber-600' : 'text-red-600'}>
                            {inv.days_to_collect}d
                          </span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          inv.status === 'Collected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          inv.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer stats */}
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
              <span>Showing {filteredInvoices.length} invoices</span>
              <span>
                Total filtered: <span className="font-semibold text-gray-900">
                  ${filteredInvoices.reduce((s, i) => s + i.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
