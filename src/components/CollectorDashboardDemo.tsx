import { useState, useMemo } from 'react';
import { ArrowLeft, Users, DollarSign, TrendingUp, FileText, Clock, Search, ArrowUpDown, ChevronRight, BarChart3, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import CollectorDetailDemo from './CollectorDetailDemo';

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

const DEMO_COLLECTORS: DemoCollector[] = [
  {
    id: 'demo-1',
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@company.com',
    role: 'Senior Collector',
    assigned_customers: 87,
    total_collected: 2847500,
    invoices_collected: 342,
    avg_days_to_collect: 24,
    open_tickets: 12,
    closed_tickets: 156,
    total_actions: 1847,
    last_active: '2026-05-28T14:30:00',
    collection_rate: 94.2,
    monthly_collections: [245000, 312000, 287000, 356000, 298000, 325000, 278000, 341000, 367000, 289000, 312000, 337500],
    top_customers: ['Acme Corp', 'Global Industries', 'TechFlow Solutions', 'Metropolitan Services', 'Pacific Trading']
  },
  {
    id: 'demo-2',
    name: 'James Rodriguez',
    email: 'james.rodriguez@company.com',
    role: 'Collector',
    assigned_customers: 64,
    total_collected: 1923400,
    invoices_collected: 278,
    avg_days_to_collect: 31,
    open_tickets: 18,
    closed_tickets: 112,
    total_actions: 1423,
    last_active: '2026-05-28T11:15:00',
    collection_rate: 87.5,
    monthly_collections: [178000, 195000, 162000, 214000, 187000, 203000, 176000, 198000, 221000, 165000, 179000, 195400],
    top_customers: ['Riverside Logistics', 'Northwind Traders', 'Summit Healthcare', 'Cascade Energy', 'Delta Manufacturing']
  },
  {
    id: 'demo-3',
    name: 'Maria Chen',
    email: 'maria.chen@company.com',
    role: 'Senior Collector',
    assigned_customers: 92,
    total_collected: 3156800,
    invoices_collected: 398,
    avg_days_to_collect: 19,
    open_tickets: 8,
    closed_tickets: 201,
    total_actions: 2156,
    last_active: '2026-05-28T16:45:00',
    collection_rate: 96.8,
    monthly_collections: [289000, 345000, 302000, 378000, 312000, 356000, 298000, 367000, 389000, 301000, 342000, 377800],
    top_customers: ['Atlas Construction', 'Pinnacle Financial', 'Emerald Distributors', 'Crown Hospitality', 'Sterling Metals']
  },
  {
    id: 'demo-4',
    name: 'David Park',
    email: 'david.park@company.com',
    role: 'Collector',
    assigned_customers: 53,
    total_collected: 1456200,
    invoices_collected: 195,
    avg_days_to_collect: 35,
    open_tickets: 22,
    closed_tickets: 87,
    total_actions: 1089,
    last_active: '2026-05-27T09:30:00',
    collection_rate: 78.3,
    monthly_collections: [134000, 142000, 118000, 156000, 129000, 138000, 112000, 145000, 158000, 121000, 135000, 168200],
    top_customers: ['Harbor Shipping', 'Valley Medical', 'Oakwood Properties', 'Coastal Engineering', 'Pioneer Foods']
  },
  {
    id: 'demo-5',
    name: 'Emily Watson',
    email: 'emily.watson@company.com',
    role: 'Senior Collector',
    assigned_customers: 78,
    total_collected: 2534600,
    invoices_collected: 312,
    avg_days_to_collect: 22,
    open_tickets: 10,
    closed_tickets: 178,
    total_actions: 1934,
    last_active: '2026-05-28T15:20:00',
    collection_rate: 92.1,
    monthly_collections: [234000, 267000, 245000, 289000, 256000, 278000, 241000, 265000, 298000, 248000, 271000, 242600],
    top_customers: ['Blue Ridge Transport', 'Central Warehousing', 'Horizon Aerospace', 'Bayview Hotels', 'Silverline Tech']
  },
  {
    id: 'demo-6',
    name: 'Michael Torres',
    email: 'michael.torres@company.com',
    role: 'Collector',
    assigned_customers: 45,
    total_collected: 987300,
    invoices_collected: 156,
    avg_days_to_collect: 42,
    open_tickets: 28,
    closed_tickets: 64,
    total_actions: 823,
    last_active: '2026-05-26T17:00:00',
    collection_rate: 71.4,
    monthly_collections: [89000, 95000, 78000, 102000, 84000, 91000, 73000, 96000, 105000, 82000, 94000, 98300],
    top_customers: ['Mountain View Supply', 'Lakeshore Properties', 'Eagle Electronics', 'Frontier Logistics', 'Granite Corp']
  },
  {
    id: 'demo-7',
    name: 'Rachel Kim',
    email: 'rachel.kim@company.com',
    role: 'Lead Collector',
    assigned_customers: 105,
    total_collected: 3689400,
    invoices_collected: 445,
    avg_days_to_collect: 17,
    open_tickets: 6,
    closed_tickets: 234,
    total_actions: 2567,
    last_active: '2026-05-28T16:55:00',
    collection_rate: 97.6,
    monthly_collections: [312000, 378000, 334000, 402000, 356000, 389000, 321000, 398000, 415000, 329000, 367000, 388400],
    top_customers: ['Continental Airlines', 'Imperial Brands', 'Quantum Dynamics', 'Royal Packaging', 'Zenith Motors']
  },
  {
    id: 'demo-8',
    name: 'Alex Nguyen',
    email: 'alex.nguyen@company.com',
    role: 'Collector',
    assigned_customers: 58,
    total_collected: 1678900,
    invoices_collected: 234,
    avg_days_to_collect: 28,
    open_tickets: 15,
    closed_tickets: 98,
    total_actions: 1312,
    last_active: '2026-05-28T13:10:00',
    collection_rate: 85.7,
    monthly_collections: [156000, 167000, 142000, 178000, 159000, 172000, 148000, 168000, 182000, 151000, 164000, 191900],
    top_customers: ['Pacific Rim Trading', 'Westfield Group', 'Cornerstone Building', 'Redwood Capital', 'Summit Digital']
  },
];

type SortKey = 'name' | 'total_collected' | 'invoices_collected' | 'avg_days_to_collect' | 'collection_rate' | 'assigned_customers' | 'open_tickets';

interface CollectorDashboardDemoProps {
  onBack?: () => void;
}

export default function CollectorDashboardDemo({ onBack }: CollectorDashboardDemoProps) {
  const rawNavigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = (path: string) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      rawNavigate(`/${orgSlug}${path}`);
    } else {
      rawNavigate(path);
    }
  };

  const [selectedCollector, setSelectedCollector] = useState<DemoCollector | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total_collected');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleBack = onBack || (() => rawNavigate(-1));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const filteredCollectors = useMemo(() => {
    let list = [...DEMO_COLLECTORS];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term));
    }
    list.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return list;
  }, [searchTerm, sortKey, sortOrder]);

  const totals = useMemo(() => ({
    total_collected: DEMO_COLLECTORS.reduce((s, c) => s + c.total_collected, 0),
    invoices_collected: DEMO_COLLECTORS.reduce((s, c) => s + c.invoices_collected, 0),
    avg_days: Math.round(DEMO_COLLECTORS.reduce((s, c) => s + c.avg_days_to_collect, 0) / DEMO_COLLECTORS.length),
    avg_rate: (DEMO_COLLECTORS.reduce((s, c) => s + c.collection_rate, 0) / DEMO_COLLECTORS.length).toFixed(1),
    total_customers: DEMO_COLLECTORS.reduce((s, c) => s + c.assigned_customers, 0),
  }), []);

  if (selectedCollector) {
    return <CollectorDetailDemo collector={selectedCollector} onBack={() => setSelectedCollector(null)} />;
  }

  const SortHeader = ({ label, field, align = 'left' }: { label: string; field: SortKey; align?: string }) => (
    <th
      className={`py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortKey === field ? 'text-blue-600' : 'text-gray-400'}`} />
      </div>
    </th>
  );

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Collector Dashboard</h1>
              <p className="text-xs text-gray-500 mt-0.5">Performance analytics, monitoring, and activity oversight</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search collectors..."
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-5 gap-4 mt-4">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3.5 border border-blue-100">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Collectors</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{DEMO_COLLECTORS.length}</p>
            <p className="text-xs text-gray-500">{totals.total_customers} customers assigned</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-3.5 border border-emerald-100">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Total Collected</span>
            </div>
            <p className="text-xl font-bold text-gray-900">${(totals.total_collected / 1000000).toFixed(2)}M</p>
            <p className="text-xs text-gray-500">Last 12 months</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3.5 border border-amber-100">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-amber-600" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Invoices Collected</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{totals.invoices_collected.toLocaleString()}</p>
            <p className="text-xs text-gray-500">across all collectors</p>
          </div>
          <div className="bg-gradient-to-br from-cyan-50 to-sky-50 rounded-xl p-3.5 border border-cyan-100">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-cyan-600" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Avg Days</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{totals.avg_days}</p>
            <p className="text-xs text-gray-500">average collection time</p>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-3.5 border border-rose-100">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-rose-600" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Avg Rate</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{totals.avg_rate}%</p>
            <p className="text-xs text-gray-500">collection success rate</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <SortHeader label="Collector" field="name" />
              <th className="py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-left">Role</th>
              <SortHeader label="Customers" field="assigned_customers" align="right" />
              <SortHeader label="Total Collected" field="total_collected" align="right" />
              <SortHeader label="Invoices" field="invoices_collected" align="right" />
              <SortHeader label="Avg Days" field="avg_days_to_collect" align="right" />
              <SortHeader label="Rate" field="collection_rate" align="right" />
              <SortHeader label="Open Tickets" field="open_tickets" align="right" />
              <th className="py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Last Active</th>
              <th className="py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredCollectors.map((collector) => {
              const rateColor = collector.collection_rate >= 90 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : collector.collection_rate >= 80 ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-red-700 bg-red-50 border-red-200';
              const daysColor = collector.avg_days_to_collect <= 25 ? 'text-emerald-600'
                : collector.avg_days_to_collect <= 35 ? 'text-amber-600'
                : 'text-red-600';

              return (
                <tr
                  key={collector.id}
                  className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedCollector(collector)}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {collector.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{collector.name}</p>
                        <p className="text-xs text-gray-500">{collector.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {collector.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-900 tabular-nums">{collector.assigned_customers}</td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900 tabular-nums">
                    ${(collector.total_collected / 1000).toFixed(0)}k
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-700 tabular-nums">{collector.invoices_collected}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold tabular-nums ${daysColor}`}>
                      {collector.avg_days_to_collect}d
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${rateColor}`}>
                      {collector.collection_rate}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-gray-700 tabular-nums">
                    {collector.open_tickets}
                    <span className="text-gray-400 text-xs ml-1">/ {collector.closed_tickets}</span>
                  </td>
                  <td className="py-3 px-4 text-center text-xs text-gray-500">
                    {new Date(collector.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(collector.last_active).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedCollector(collector); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      View
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr className="font-semibold text-gray-900">
              <td className="py-3 px-4" colSpan={2}>
                <span className="text-xs uppercase tracking-wider text-gray-500">Totals ({DEMO_COLLECTORS.length} collectors)</span>
              </td>
              <td className="py-3 px-4 text-right tabular-nums">{totals.total_customers}</td>
              <td className="py-3 px-4 text-right tabular-nums">${(totals.total_collected / 1000000).toFixed(2)}M</td>
              <td className="py-3 px-4 text-right tabular-nums">{totals.invoices_collected.toLocaleString()}</td>
              <td className="py-3 px-4 text-right tabular-nums">{totals.avg_days}d</td>
              <td className="py-3 px-4 text-right tabular-nums">{totals.avg_rate}%</td>
              <td className="py-3 px-4 text-right tabular-nums">
                {DEMO_COLLECTORS.reduce((s, c) => s + c.open_tickets, 0)}
                <span className="text-gray-400 text-xs ml-1">/ {DEMO_COLLECTORS.reduce((s, c) => s + c.closed_tickets, 0)}</span>
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
