import { useEffect, useLayoutEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import CustomerDetailView from './CustomerDetailView';
import { ArrowLeft, CreditCard as Edit2, Trash2, Users, RefreshCw, Mail, CheckSquare, Square, FileText, Clock, Calendar, PauseCircle, Play, ChevronLeft, ChevronRight, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, TrendingUp, Filter, X, Eye, EyeOff, Ticket, ChevronDown, Zap, SlidersHorizontal, BarChart3, Plus, Settings, Check } from 'lucide-react';
import { usePageCache } from '../contexts/PageCacheContext';
import CustomerFiles from './CustomerFiles';
import PageHelp, { HelpSection } from './PageHelp';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Cell, PieChart, Pie } from 'recharts';

type Customer = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  responded_this_month: boolean;
  postpone_until: string | null;
  postpone_reason: string | null;
  created_at: string;
  updated_at: string;
  customer_id?: string;
  balance?: number;
  invoice_count?: number;
  oldest_invoice_date?: string | null;
  newest_invoice_date?: string | null;
  max_days_overdue?: number;
  red_threshold_days?: number;
  red_count?: number;
  yellow_count?: number;
  green_count?: number;
  exclude_from_payment_analytics?: boolean;
  exclude_from_customer_analytics?: boolean;
  avg_days_to_collect?: number | null;
  filtered_gross_balance?: number;
  filtered_net_balance?: number;
  filtered_invoice_count?: number;
  gross_balance?: number;
};

type ScheduledEmail = {
  id: string;
  scheduled_time: string;
  template_name: string;
  formula_name: string;
  timezone: string;
};

type FilterConfig = {
  minBalance: number;
  maxBalance: number;
  minInvoiceCount: number;
  maxInvoiceCount: number;
  minInvoiceAmount: number;
  maxInvoiceAmount: number;
  minDaysOverdue: number;
  maxDaysOverdue: number;
  // Whether "days overdue" counts from the invoice's due date (true days past
  // due) or from the invoice date (legacy). Drives the Overdue column, sorting
  // and the min/max filter together so they always agree.
  overdueBasis: 'due_date' | 'invoice_date';
  dateFrom: string;
  dateTo: string;
  logicOperator: 'AND' | 'OR';
  sortBy: 'name' | 'email' | 'balance' | 'invoice_count' | 'max_days_overdue' | 'avg_days_to_collect' | 'created_at';
  sortOrder: 'asc' | 'desc';
};

const BATCH_SIZE = 50;
const PAGE_SIZE = 50;

const DEFAULT_FILTERS: FilterConfig = {
  minBalance: 0,
  maxBalance: Infinity,
  minInvoiceCount: 0,
  maxInvoiceCount: Infinity,
  minInvoiceAmount: 0,
  maxInvoiceAmount: Infinity,
  minDaysOverdue: 0,
  maxDaysOverdue: Infinity,
  // Overdue is counted from the INVOICE date by default (so "Overdue 90+" = 90
  // days since the invoice). The drawer toggle can still switch it to due date.
  overdueBasis: 'invoice_date',
  dateFrom: '',
  dateTo: '',
  logicOperator: 'AND',
  sortBy: 'balance',
  sortOrder: 'desc'
};

type QuickFilter = {
  label: string;
  desc?: string;
  filter: Partial<FilterConfig>;
  logic?: 'AND' | 'OR';
  // A quick filter is a comprehensive, named preset: it can also pin the list to
  // a specific set of customers, or always hide a set (e.g. "No Ditmus / Pinnacle").
  // The two are mutually exclusive — customerMode picks which one is in effect.
  customerMode?: 'include' | 'exclude';
  includedCustomers?: string[];
  excludedCustomers?: string[];
};

// Labels state the actual (inclusive) thresholds, e.g. "$10k+" = balance >= 10000.
const DEFAULT_QUICK_FILTERS: QuickFilter[] = [
  { label: 'High Balance', desc: '$10k+', filter: { minBalance: 10000 } },
  { label: 'Medium Balance', desc: '$5k–$10k', filter: { minBalance: 5000, maxBalance: 10000 } },
  { label: 'Many Invoices', desc: '20+ open', filter: { minInvoiceCount: 20 } },
  { label: 'Overdue 90+', desc: 'days since invoice', filter: { minDaysOverdue: 90 } },
  { label: 'Critical', desc: '$20k+', filter: { minBalance: 20000 } },
];

// A calendar button next to a "days overdue" field: pick a date and it fills in the
// day count = today − that date (so you can say "overdue since May 28" instead of
// counting the days yourself).
function OverdueDatePicker({ onPick, title }: { onPick: (days: number) => void; title: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split('T')[0];
  return (
    <>
      <button type="button" title={title}
        onClick={() => { const el = ref.current as any; try { el?.showPicker?.(); } catch { el?.focus(); } }}
        className="px-2.5 border border-teal-200 rounded-lg hover:bg-teal-50 text-teal-600 flex-shrink-0 flex items-center">
        <Calendar size={15} />
      </button>
      <input ref={ref} type="date" max={today} tabIndex={-1}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const picked = new Date(v + 'T00:00:00');
          onPick(Math.max(0, Math.floor((Date.now() - picked.getTime()) / 86400000)));
        }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
    </>
  );
}

const CUSTOMERS_HELP: HelpSection[] = [
  {
    heading: 'The colored dot next to each customer',
    items: [
      { swatch: '#ef4444', label: 'Red dot', body: 'The customer has at least one “red” invoice — overdue past its red threshold (severely late). Work these first.' },
      { swatch: '#f59e0b', label: 'Yellow dot', body: 'Their worst invoice is “yellow” — moderately overdue, not yet red.' },
      { swatch: '#10b981', label: 'Green dot', body: 'All open invoices are “green” — current or only slightly aged.' },
      { swatch: '#d1d5db', label: 'Gray dot', body: 'No open invoices with a balance.' },
      { swatch: '#fca5a5', label: 'Whole row shaded red', body: 'The customer’s worst invoice is at/past their red-threshold days — a flag for the most overdue accounts.' },
    ],
  },
  {
    heading: 'Columns',
    items: [
      { label: 'Customer (name + ID)', body: 'Name and account ID. Click the name to open the customer’s full detail in a new tab.' },
      { label: 'Invoices', body: 'Number of open invoices. Under an invoice-level filter it shows “matched / total”.' },
      { label: 'Balance', body: 'What they owe. Credit Memos ON = net (credit memos subtracted); OFF = gross. Under a filter it shows “X of Y”.' },
      { label: 'Overdue', body: 'Most days any open invoice is overdue — counted from the invoice date by default (change in Filters). Red >90, orange >60, amber >30.' },
      { label: 'Last Payment', body: 'Date + amount of their most recent payment. Turns amber/red after 60/90+ days with no payment.' },
      { label: 'Resp.', body: '“Responded this month.” Tick it to mark whether the customer answered collection outreach this month.' },
      { label: 'Pay', body: 'Eye toggle: include/exclude this customer from Payment Analytics. Green eye = included; red crossed-eye = excluded.' },
    ],
  },
  {
    heading: 'Buttons & actions on a row',
    items: [
      { label: '+ Ticket / N Tickets', body: 'Open the customer’s collection tickets or create one (opens in a new tab). A red badge means open tickets.' },
      { label: 'Expand arrow (›)', body: 'Drops down the customer’s open invoices inline.' },
      { label: 'Postpone chip / ▶', body: 'Shown when the customer is postponed until a date; click to remove the postponement.' },
      { label: 'Clock / Files / Edit / Delete', body: 'View upcoming scheduled emails, view attached files, edit name & email, or delete the customer.' },
    ],
  },
  {
    heading: 'Top-of-page controls',
    items: [
      { label: 'Quick filters (⚡ bar)', body: 'One-click saved presets. Click to apply (highlighted when active), click again to clear. Use ⚙ to build your own — balances, invoices, days overdue, and specific customers to include/exclude.' },
      { label: 'Credit Memos toggle', body: 'ON = balances are net (each customer’s credit memos subtracted = the real amount owed). OFF = gross, ignoring credit memos.' },
      { label: 'Filters', body: 'Full filter drawer: min/max balance, invoice count/amount, days overdue (with a 📅 date picker), overdue basis, sort, and include/exclude customers.' },
      { label: 'Statistics', body: 'A drawer of charts — balance distribution, aging, top customers, and the invoice color mix.' },
      { label: 'Export / Refresh', body: 'Download the current (filtered) list to Excel, or reload the data.' },
    ],
  },
];

type CustomersProps = {
  onBack?: () => void;
};

export default function Customers({ onBack }: CustomersProps) {
  const rawNavigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = (path: string, options?: any) => {
    if (path.startsWith('/') && orgSlug && !path.startsWith(`/${orgSlug}`)) {
      rawNavigate(`/${orgSlug}${path}`, options);
    } else {
      rawNavigate(path, options);
    }
  };
  const [searchParams] = useSearchParams();
  const customerIdParam = searchParams.get('customer');
  const invoiceParam = searchParams.get('invoice');
  const handleBack = onBack || (() => navigate(-1));
  const { getCachedState, setCachedState } = usePageCache('customers-list');
  const cachedListState = useRef(getCachedState());
  const cl = cachedListState.current;

  useEffect(() => {
    if (invoiceParam && !customerIdParam) {
      const lookupInvoiceCustomer = async () => {
        const { data, error } = await supabase
          .from('acumatica_invoices')
          .select('customer')
          .eq('reference_number', invoiceParam)
          .neq('status', 'On Hold')
          .maybeSingle();
        if (data && !error) {
          navigate(`/customers?customer=${data.customer}`, { replace: true });
        }
      };
      lookupInvoiceCustomer();
    }
  }, [invoiceParam, customerIdParam, navigate]);

  const [customers, setCustomers] = useState<Customer[]>(() => cl?.customers ?? []);
  const [allCustomers, setAllCustomers] = useState<Customer[]>(() => cl?.allCustomers ?? []);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>(() => cl?.filteredCustomers ?? []);
  const [loading, setLoading] = useState(() => !cl);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(() => cl?.loadedCount ?? 0);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewingFiles, setViewingFiles] = useState<{ id: string; name: string } | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<{ id: string; name: string } | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => cl?.currentPage ?? 0);
  const [totalCount, setTotalCount] = useState(() => cl?.totalCount ?? 0);
  const [grandTotalCustomers, setGrandTotalCustomers] = useState(() => cl?.grandTotalCustomers ?? 0);
  const [searchQuery, setSearchQuery] = useState(() => cl?.searchQuery ?? '');
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(() => cl?.showFilters ?? false);
  const [excludeCreditMemos, setExcludeCreditMemos] = useState(() => cl?.excludeCreditMemos ?? false);
  const [customersWithOpenTickets, setCustomersWithOpenTickets] = useState<Map<string, number>>(new Map());
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(() => cl?.expandedCustomerId ?? null);
  const [expandedInvoices, setExpandedInvoices] = useState<Map<string, any[]>>(() => cl?.expandedInvoices ?? new Map());
  // Inline invoice dropdown: show open-only vs all, and cap the visible rows at 7.
  const [invView, setInvView] = useState<'open' | 'all'>('open');
  const [showAllInvRows, setShowAllInvRows] = useState(false);

  // Scroll position of the list — preserved across going into a customer and back.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef<number>(cl?.scrollPos ?? 0);
  const [loadingExpanded, setLoadingExpanded] = useState<string | null>(null);
  const [cachedStatsLoaded, setCachedStatsLoaded] = useState(() => cl?.cachedStatsLoaded ?? false);
  const [cachedStatsTime, setCachedStatsTime] = useState<string | null>(() => cl?.cachedStatsTime ?? null);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  // Persisted so the active quick-filter chip stays highlighted after navigating
  // into a customer and back (the applied filters are restored from cache too).
  const [activeQuickFilter, setActiveQuickFilter] = useState<number | null>(() => cl?.activeQuickFilter ?? null);
  // customer_id -> most recent payment (date + amount), loaded in bulk.
  const [lastPayments, setLastPayments] = useState<Map<string, { date: string; amount: number }>>(() => cl?.lastPayments ?? new Map());
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  const [stats, setStats] = useState(() => cl?.stats ?? {
    total_customers: 0,
    active_customers: 0,
    total_balance: 0,
    avg_balance: 0,
    customers_with_debt: 0,
    total_open_invoices: 0,
    customers_with_overdue: 0
  });

  const [filters, setFilters] = useState<FilterConfig>(() => ({
    ...DEFAULT_FILTERS,
    ...(cl?.filters ?? {}),
    // The invoice-date pickers were removed from the panel, so never restore a
    // stale range that would filter invisibly.
    dateFrom: '',
    dateTo: '',
  }));
  const hasInvoiceLevelFilters = filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity ||
    filters.minDaysOverdue > 0 || filters.maxDaysOverdue !== Infinity ||
    !!filters.dateFrom || !!filters.dateTo;

  // ── Drawers ────────────────────────────────────────────────────────────
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [showStatsDrawer, setShowStatsDrawer] = useState(false);

  // ── Include-only / always-exclude customer lists (persisted) ────────────
  const [excludedCustomers, setExcludedCustomers] = useState<string[]>(() => cl?.excludedCustomers ?? []);
  const excludedSet = new Set(excludedCustomers);
  const [excludeSearch, setExcludeSearch] = useState('');
  const [includedCustomers, setIncludedCustomers] = useState<string[]>(() => cl?.includedCustomers ?? []);
  const includedSet = new Set(includedCustomers);
  const [includeSearch, setIncludeSearch] = useState('');

  // ── Editable quick filters (per user) — comprehensive, named saved presets.
  // Clicking one applies it immediately; nothing is auto-applied on page load.
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>(() => cl?.quickFilters ?? DEFAULT_QUICK_FILTERS);
  const [showQuickEditor, setShowQuickEditor] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);
  // Per-card customer search inside the quick-filter editor (key = `${idx}:${kind}`).
  const [qfSearch, setQfSearch] = useState<Record<string, string>>({});
  const quickFiltersLoaded = useRef(false);

  // Load this user's saved quick filters. This does NOT apply any filter — it just
  // populates the preset bar with what the user previously built.
  const loadQuickFilters = useCallback(async () => {
    if (quickFiltersLoaded.current) return;
    quickFiltersLoaded.current = true;
    // On navigate-back the page cache already holds the live quick filters.
    if (cachedListState.current) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_analytics_default_filters')
      .select('filters')
      .eq('user_id', user.id)
      .eq('page', 'customers')
      .maybeSingle();
    const qf = (data?.filters as any)?.quickFilters;
    if (Array.isArray(qf) && qf.length) setQuickFilters(qf);
  }, []);
  useEffect(() => { loadQuickFilters(); }, [loadQuickFilters]);

  // Persist this user's quick filters. The user_analytics_default_filters row is
  // reused purely as storage — each quick filter carries its own include/exclude
  // lists, so nothing stored here is auto-applied when the page opens.
  // Returns null on success, or an error message. The caller surfaces failures so
  // a blocked write (RLS / constraint) can never silently look "saved".
  const saveQuickFilters = async (qf: QuickFilter[]): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'You are not signed in.';
    const { data: existing } = await supabase.from('user_analytics_default_filters')
      .select('filters, excluded_customers').eq('user_id', user.id).eq('page', 'customers').maybeSingle();
    const { error } = await supabase.from('user_analytics_default_filters').upsert({
      user_id: user.id, page: 'customers',
      filters: { ...((existing?.filters as any) || {}), quickFilters: qf },
      excluded_customers: (existing?.excluded_customers as any) ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,page' });
    return error ? (error.message || 'Save failed') : null;
  };
  const updateQuickFilter = (idx: number, patch: Partial<QuickFilter>) =>
    setQuickFilters(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  const updateQuickFilterCond = (idx: number, patch: Partial<FilterConfig>) =>
    setQuickFilters(prev => prev.map((q, i) => i === idx ? { ...q, filter: { ...q.filter, ...patch } } : q));
  // Add/remove a customer id in a quick filter's include or exclude list.
  const toggleQuickFilterCustomer = (idx: number, kind: 'includedCustomers' | 'excludedCustomers', id: string, add: boolean) =>
    setQuickFilters(prev => prev.map((q, i) => {
      if (i !== idx) return q;
      const cur = q[kind] ?? [];
      return { ...q, [kind]: add ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter(x => x !== id) };
    }));
  // Include-only and Exclude are mutually exclusive (including a set already hides
  // everyone else), so switching modes clears the opposite list.
  const setQuickFilterMode = (idx: number, mode: 'include' | 'exclude') =>
    setQuickFilters(prev => prev.map((q, i) => i === idx
      ? (mode === 'include' ? { ...q, customerMode: 'include', excludedCustomers: [] } : { ...q, customerMode: 'exclude', includedCustomers: [] })
      : q));

  const addExcludedCustomer = (id: string) => {
    if (!id) return;
    setExcludedCustomers(prev => prev.includes(id) ? prev : [...prev, id]);
  };
  const removeExcludedCustomer = (id: string) => setExcludedCustomers(prev => prev.filter(x => x !== id));
  const addIncludedCustomer = (id: string) => {
    if (!id) return;
    setIncludedCustomers(prev => prev.includes(id) ? prev : [...prev, id]);
  };
  const removeIncludedCustomer = (id: string) => setIncludedCustomers(prev => prev.filter(x => x !== id));

  const loadCachedStats = async () => {
    try {
      const { data, error } = await supabase
        .from('cached_customer_stats')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (data && !error) {
        setStats({
          total_customers: data.total_customers_excl_test,
          active_customers: data.active_customers_excl_test,
          total_balance: data.total_balance_excl_test,
          avg_balance: data.avg_balance_excl_test,
          customers_with_debt: data.customers_with_debt_excl_test,
          total_open_invoices: data.total_open_invoices_excl_test,
          customers_with_overdue: data.customers_with_overdue_excl_test
        });
        setCachedStatsLoaded(true);
        if (data.calculated_at) {
          setCachedStatsTime(data.calculated_at);
        }
      }
    } catch (err) {
      console.error('Error loading cached stats:', err);
    }
  };

  const fetchKeyRef = useRef(cl ? `${cl.excludeCreditMemos ?? false}|${cl.filters?.overdueBasis ?? DEFAULT_FILTERS.overdueBasis}` : '');
  const restoredFromCache = useRef(!!cl);
  const mountTime = useRef(Date.now());

  const stateRef = useRef<Record<string, any>>({});
  useEffect(() => {
    stateRef.current = {
      customers, allCustomers, filteredCustomers, loadedCount,
      currentPage, totalCount, grandTotalCustomers, searchQuery, showFilters,
      excludeCreditMemos, cachedStatsLoaded, cachedStatsTime, stats, filters,
      excludedCustomers, includedCustomers, quickFilters, activeQuickFilter, lastPayments,
      expandedCustomerId, expandedInvoices, scrollPos: scrollPosRef.current,
    };
  });

  useEffect(() => {
    return () => { setCachedState(stateRef.current); };
  }, []);

  // Restore the list's scroll position after coming back from a customer (the
  // detail is an inline early-return, so the scroll container is remounted).
  useLayoutEffect(() => {
    if (!customerIdParam && scrollContainerRef.current && scrollPosRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPosRef.current;
    }
  }, [customerIdParam]);

  useEffect(() => {
    // overdueBasis is part of the key: the cached rows are mapped to a single
    // basis at load time, so flipping the toggle has to re-map them.
    const key = `${excludeCreditMemos}|${filters.overdueBasis}`;
    if (fetchKeyRef.current === key) {
      if (restoredFromCache.current && Date.now() - mountTime.current < 500) {
        loadCustomersWithOpenTickets();
        return;
      }
      restoredFromCache.current = false;
      return;
    }
    fetchKeyRef.current = key;

    loadCachedStats();
    loadCustomersBatched();
    loadCustomersWithOpenTickets();

    const ticketSubscription = supabase
      .channel('ticket_status_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'collection_tickets' },
        () => { loadCustomersWithOpenTickets(); }
      )
      .subscribe();

    return () => { ticketSubscription.unsubscribe(); };
  }, [excludeCreditMemos, filters.overdueBasis]);

  const toggleExpandCustomer = async (customer: Customer) => {
    const cid = customer.customer_id || customer.id;
    if (expandedCustomerId === cid) { setExpandedCustomerId(null); return; }
    setExpandedCustomerId(cid);
    setShowAllInvRows(false); // each newly-opened customer starts collapsed at 7 rows
    if (!expandedInvoices.has(cid)) {
      setLoadingExpanded(cid);
      try {
        const { data, error } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, type, status, date, due_date, amount, balance, color_status')
          .eq('customer', cid)
          .order('date', { ascending: false })
          .limit(1000);
        if (error) throw error;
        setExpandedInvoices(prev => new Map(prev).set(cid, data || []));
      } catch (e) {
        console.error('Error loading customer invoices:', e);
        setExpandedInvoices(prev => new Map(prev).set(cid, []));
      } finally {
        setLoadingExpanded(null);
      }
    }
  };

  const loadCustomersWithOpenTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('collection_tickets')
        .select('customer_id')
        .in('status', ['open', 'in_progress']);
      if (error) throw error;
      const counts = new Map<string, number>();
      (data || []).forEach(t => counts.set(t.customer_id, (counts.get(t.customer_id) || 0) + 1));
      setCustomersWithOpenTickets(counts);
    } catch (error) {
      console.error('Error loading customers with open tickets:', error);
    }
  };

  // Bulk-load each customer's most recent payment (Payment/Prepayment). One
  // paginated RPC for the whole org — RLS scopes it. Powers the Last Payment column.
  const loadLastPayments = async () => {
    try {
      const PAGE = 1000;
      const map = new Map<string, { date: string; amount: number }>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .rpc('get_last_payments_by_customer')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        batch.forEach((r: any) => {
          if (r.customer_id) map.set(String(r.customer_id), { date: r.last_payment_date, amount: Number(r.last_payment_amount) || 0 });
        });
        if (batch.length < PAGE) break;
      }
      setLastPayments(map);
    } catch (e) {
      console.error('Error loading last payments:', e);
    }
  };
  // Load once on mount (skip if the page cache already carried the map back).
  useEffect(() => {
    if (lastPayments.size === 0) loadLastPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapCustomerRow = (item: any) => ({
    id: item.customer_id || item.id,
    name: item.customer_name || '',
    email: item.email_address || '',
    is_active: item.is_active ?? true,
    responded_this_month: item.responded_this_month ?? false,
    postpone_until: item.postpone_until ?? null,
    postpone_reason: item.postpone_reason ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    customer_id: item.customer_id,
    balance: excludeCreditMemos ? (item.calculated_balance_excl_cm || item.gross_balance || 0) : (item.calculated_balance || 0),
    gross_balance: item.gross_balance || 0,
    filtered_gross_balance: item.filtered_gross_balance ?? item.gross_balance ?? 0,
    filtered_net_balance: item.filtered_net_balance ?? (excludeCreditMemos ? (item.calculated_balance_excl_cm || item.gross_balance || 0) : (item.calculated_balance || 0)),
    invoice_count: item.open_invoice_count || 0,
    filtered_invoice_count: item.filtered_invoice_count ?? item.open_invoice_count ?? 0,
    // Cached rows carry both bases (max_days_overdue = from invoice date,
    // max_days_overdue_due = from due date); the RPC already returns the value
    // for the requested basis in max_days_overdue.
    max_days_overdue: (filters.overdueBasis === 'due_date' && item.max_days_overdue_due != null)
      ? (item.max_days_overdue_due || 0)
      : (item.max_days_overdue || 0),
    red_threshold_days: item.red_threshold_days || 30,
    red_count: item.red_count || 0,
    yellow_count: item.yellow_count || 0,
    green_count: item.green_count || 0,
    exclude_from_payment_analytics: item.exclude_from_payment_analytics || false,
    exclude_from_customer_analytics: item.exclude_from_customer_analytics || false
  });

  const loadCustomersBatched = async () => {
    setLoading(true);
    setIsSearching(false);
    setLoadedCount(0);
    try {
      const balanceCol = excludeCreditMemos ? 'calculated_balance_excl_cm' : 'calculated_balance';
      // Paginate past PostgREST's ~1000-row response cap so ALL customers load.
      const PAGE = 1000;
      let merged: Customer[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('cached_customer_balances')
          .select('*')
          .eq('is_test_customer', false)
          .order(balanceCol, { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        merged = merged.concat(batch.map(item => mapCustomerRow(item)));
        if (batch.length < PAGE) break;
      }
      setLoadedCount(merged.length);
      setGrandTotalCustomers(merged.length);
      setAllCustomers(merged);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Recompute stats from filtered list when filters are active
  useEffect(() => {
    if (filteredCustomers.length === 0 && cachedStatsLoaded && !hasActiveFilters) return;
    if (!hasActiveFilters && !loadingMore && cachedStatsLoaded && filteredCustomers.length > 0) {
      // Use cached stats
    } else if (hasActiveFilters || !cachedStatsLoaded) {
      // Compute from filtered data
    } else {
      return;
    }

    const list = filteredCustomers;
    const totalCustomers = list.length;
    const activeCustomers = list.filter(c => c.is_active).length;
    const totalBalance = list.reduce((sum, c) => sum + (c.filtered_net_balance ?? c.balance ?? 0), 0);
    const customersWithDebt = list.filter(c => (c.filtered_net_balance ?? c.balance ?? 0) > 0).length;
    const totalOpenInvoices = list.reduce((sum, c) => sum + (c.filtered_invoice_count ?? c.invoice_count ?? 0), 0);
    const customersWithOverdue = list.filter(c => (c.max_days_overdue || 0) > 0).length;
    const avgBalance = customersWithDebt > 0 ? totalBalance / customersWithDebt : 0;

    setStats({
      total_customers: totalCustomers,
      active_customers: activeCustomers,
      total_balance: totalBalance,
      avg_balance: avgBalance,
      customers_with_debt: customersWithDebt,
      total_open_invoices: totalOpenInvoices,
      customers_with_overdue: customersWithOverdue
    });
  }, [filteredCustomers, loadingMore, cachedStatsLoaded, hasActiveFilters]);

  const applyFilters = useCallback(async () => {
    // ── OR mode ────────────────────────────────────────────────────────────
    // The get_customers_with_balance RPC only ANDs its conditions, so it can't
    // express an OR quick filter. Combine the customer-level condition groups
    // (balance / open invoices / days overdue) with OR here, over the already-
    // loaded list. Invoice-amount/date conditions are invoice-level and are not
    // part of OR mode.
    if (filters.logicOperator === 'OR') {
      const groups: Array<(c: Customer) => boolean> = [];
      if (filters.minBalance > 0 || filters.maxBalance !== Infinity)
        groups.push(c => (c.balance ?? 0) >= filters.minBalance && (c.balance ?? 0) <= filters.maxBalance);
      if (filters.minInvoiceCount > 0 || filters.maxInvoiceCount !== Infinity)
        groups.push(c => (c.invoice_count ?? 0) >= filters.minInvoiceCount && (c.invoice_count ?? 0) <= filters.maxInvoiceCount);
      if (filters.minDaysOverdue > 0 || filters.maxDaysOverdue !== Infinity)
        groups.push(c => (c.max_days_overdue ?? 0) >= filters.minDaysOverdue && (c.max_days_overdue ?? 0) <= filters.maxDaysOverdue);

      if (groups.length > 0) {
        setHasActiveFilters(true);
        const q = searchQuery.trim().toLowerCase();
        let filtered = allCustomers.filter(c => {
          if (q && !((c.name || '').toLowerCase().includes(q) || String(c.customer_id || c.id || '').toLowerCase().includes(q))) return false;
          return groups.some(g => g(c));
        });
        filtered.sort((a, b) => {
          let cmp = 0; const s = filters.sortBy;
          if (s === 'balance') cmp = (a.balance || 0) - (b.balance || 0);
          else if (s === 'invoice_count') cmp = (a.invoice_count || 0) - (b.invoice_count || 0);
          else if (s === 'max_days_overdue') cmp = (a.max_days_overdue || 0) - (b.max_days_overdue || 0);
          else if (s === 'name') cmp = a.name.localeCompare(b.name);
          else if (s === 'email') cmp = a.email.localeCompare(b.email);
          else if (s === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return filters.sortOrder === 'asc' ? cmp : -cmp;
        });
        if (includedSet.size) filtered = filtered.filter(c => includedSet.has(c.customer_id || c.id));
        if (excludedSet.size) filtered = filtered.filter(c => !excludedSet.has(c.customer_id || c.id));
        setFilteredCustomers(filtered);
        setTotalCount(filtered.length);
        const start = currentPage * PAGE_SIZE;
        setCustomers(filtered.slice(start, start + PAGE_SIZE));
        setLoading(false);
        setLoadingMore(false);
        return;
      }
    }

    const hasServerFilter =
      filters.minInvoiceAmount > 0 || filters.maxInvoiceAmount !== Infinity ||
      !!filters.dateFrom || !!filters.dateTo ||
      !!searchQuery.trim() ||
      filters.minBalance > 0 || filters.maxBalance !== Infinity ||
      filters.minInvoiceCount > 0 || filters.maxInvoiceCount !== Infinity ||
      filters.minDaysOverdue > 0 || filters.maxDaysOverdue !== Infinity;

    setHasActiveFilters(hasServerFilter);

    if (hasServerFilter) {
      setLoading(true);
      setLoadedCount(0);
      try {
        const rpcParams = {
          p_search: searchQuery.trim() || null,
          p_status_filter: 'all',
          p_country_filter: 'all',
          p_sort_by: filters.sortBy === 'name' ? 'customer_name' : filters.sortBy,
          p_sort_order: filters.sortOrder,
          p_date_from: filters.dateFrom || null,
          p_date_to: filters.dateTo || null,
          p_date_context: (filters.dateFrom || filters.dateTo) ? 'invoice_date' : null,
          p_balance_filter: 'all',
          p_min_balance: filters.minBalance > 0 ? filters.minBalance : null,
          p_max_balance: filters.maxBalance !== Infinity ? filters.maxBalance : null,
          p_min_open_invoices: filters.minInvoiceCount > 0 ? filters.minInvoiceCount : null,
          p_max_open_invoices: filters.maxInvoiceCount !== Infinity ? filters.maxInvoiceCount : null,
          p_min_invoice_amount: filters.minInvoiceAmount > 0 ? filters.minInvoiceAmount : null,
          p_max_invoice_amount: filters.maxInvoiceAmount !== Infinity ? filters.maxInvoiceAmount : null,
          p_exclude_credit_memos: excludeCreditMemos,
          p_calculate_avg_days: false,
          p_min_days_overdue: filters.minDaysOverdue > 0 ? filters.minDaysOverdue : null,
          p_max_days_overdue: filters.maxDaysOverdue !== Infinity ? Math.round(filters.maxDaysOverdue) : null,
          p_test_customers: false,
          p_overdue_basis: filters.overdueBasis
        };

        // Paginate the RPC past PostgREST's ~1000-row response cap so search
        // returns ALL matching customers, not just the first 1000.
        const PAGE = 1000;
        let filtered: Customer[] = [];
        for (let offset = 0; ; offset += PAGE) {
          const { data, error } = await supabase
            .rpc('get_customers_with_balance', { ...rpcParams, p_limit: PAGE, p_offset: offset });
          if (error) throw error;
          const batch = data || [];
          filtered = filtered.concat(batch.map(item => mapCustomerRow(item)));
          if (batch.length < PAGE) break;
        }
        if (includedSet.size) filtered = filtered.filter(c => includedSet.has(c.customer_id || c.id));
        if (excludedSet.size) filtered = filtered.filter(c => !excludedSet.has(c.customer_id || c.id));
        setLoadedCount(filtered.length);
        setFilteredCustomers(filtered);
        setTotalCount(filtered.length);
        const start = currentPage * PAGE_SIZE;
        setCustomers(filtered.slice(start, start + PAGE_SIZE));
      } catch (error) {
        console.error('Error applying filters:', error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
      return;
    }

    let filtered = [...allCustomers];
    filtered.sort((a, b) => {
      let comparison = 0;
      const sortBy = filters.sortBy;
      if (sortBy === 'balance') comparison = (a.balance || 0) - (b.balance || 0);
      else if (sortBy === 'invoice_count') comparison = (a.invoice_count || 0) - (b.invoice_count || 0);
      else if (sortBy === 'max_days_overdue') comparison = (a.max_days_overdue || 0) - (b.max_days_overdue || 0);
      else if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
      else if (sortBy === 'email') comparison = a.email.localeCompare(b.email);
      else if (sortBy === 'created_at') comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return filters.sortOrder === 'asc' ? comparison : -comparison;
    });

    if (includedSet.size) filtered = filtered.filter(c => includedSet.has(c.customer_id || c.id));
    if (excludedSet.size) filtered = filtered.filter(c => !excludedSet.has(c.customer_id || c.id));
    setFilteredCustomers(filtered);
    setTotalCount(filtered.length);
    const start = currentPage * PAGE_SIZE;
    setCustomers(filtered.slice(start, start + PAGE_SIZE));
  }, [allCustomers, filters, searchQuery, currentPage, excludeCreditMemos, excludedCustomers, includedCustomers]);

  useEffect(() => { applyFilters(); }, [applyFilters]);

  if (customerIdParam && customerIdParam !== 'null' && customerIdParam !== 'undefined') {
    return <CustomerDetailView customerId={customerIdParam} onBack={() => navigate('/customers')} />;
  }

  const buildCustomerUrl = (customerId: string) => {
    const params = new URLSearchParams({ customer: customerId });
    if (filters.minInvoiceAmount > 0) params.set('amountMin', String(filters.minInvoiceAmount));
    if (filters.maxInvoiceAmount !== Infinity) params.set('amountMax', String(filters.maxInvoiceAmount));
    if (filters.minDaysOverdue > 0) params.set('daysMin', String(filters.minDaysOverdue));
    if (filters.maxDaysOverdue !== Infinity) params.set('daysMax', String(Math.round(filters.maxDaysOverdue)));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    // Include the org slug so the new tab stays in the current organization
    // (window.open bypasses the org-prefixing navigate wrapper).
    const prefix = orgSlug ? `/${orgSlug}` : '';
    return `${prefix}/customers?${params.toString()}`;
  };

  const handleSearch = () => {
    setCurrentPage(0);
    setIsSearching(!!searchQuery.trim());
    applyFilters();
  };

  const goToNextPage = () => {
    if ((currentPage + 1) * PAGE_SIZE < totalCount) setCurrentPage(currentPage + 1);
  };
  const goToPreviousPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const handleSort = (column: string) => {
    if (filters.sortBy === column) {
      setFilters({ ...filters, sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      setFilters({ ...filters, sortBy: column as any, sortOrder: 'asc' });
    }
    setCurrentPage(0);
  };

  const getSortIcon = (column: string) => {
    if (filters.sortBy !== column) return <ArrowUpDown size={14} className="text-gray-400" />;
    return filters.sortOrder === 'asc' ?
      <ArrowUp size={14} className="text-blue-600" /> :
      <ArrowDown size={14} className="text-blue-600" />;
  };

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    setSearchQuery('');
    // Reset All clears everything — including any customer include/exclude and the
    // active quick filter, so no preset stays "assigned" after a reset.
    setIncludedCustomers([]);
    setExcludedCustomers([]);
    setCurrentPage(0);
    setActiveQuickFilter(null);
  };

  const applyQuickFilter = (index: number) => {
    if (activeQuickFilter === index) {
      // Toggle off — clear this preset's field filters AND its customer lists.
      setFilters({ ...DEFAULT_FILTERS });
      setSearchQuery('');
      setIncludedCustomers([]);
      setExcludedCustomers([]);
      setCurrentPage(0);
      setActiveQuickFilter(null);
      return;
    }
    const preset = quickFilters[index];
    setFilters({
      ...DEFAULT_FILTERS,
      ...preset.filter,
      logicOperator: preset.logic || 'AND'
    });
    // A quick filter can also pin the list to / hide a specific set of customers.
    setIncludedCustomers(preset.includedCustomers ?? []);
    setExcludedCustomers(preset.excludedCustomers ?? []);
    setCurrentPage(0);
    setActiveQuickFilter(index);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({ name: customer.name, email: customer.email });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      await loadCustomersBatched();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('Error deleting customer');
    }
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ is_active: !currentValue }).eq('customer_id', id);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, is_active: !currentValue } : c));
    } catch (error) {
      console.error('Error updating customer status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleResponded = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ responded_this_month: !currentValue }).eq('customer_id', id);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, responded_this_month: !currentValue } : c));
    } catch (error) {
      console.error('Error updating response status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleUnpostpone = async (id: string) => {
    if (!confirm('Remove the postponement for this customer?')) return;
    setUpdating(id);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ postpone_until: null, postpone_reason: null }).eq('customer_id', id);
      if (error) throw error;
      setAllCustomers(allCustomers.map(c => c.id === id ? { ...c, postpone_until: null, postpone_reason: null } : c));
    } catch (error) {
      console.error('Error removing postponement:', error);
    } finally {
      setUpdating(null);
    }
  };

  const togglePaymentAnalyticsExclusion = async (customerId: string, currentValue: boolean) => {
    setUpdating(customerId);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ exclude_from_payment_analytics: !currentValue }).eq('customer_id', customerId);
      if (error) throw error;
      const updater = (c: Customer) => c.customer_id === customerId ? { ...c, exclude_from_payment_analytics: !currentValue } : c;
      setAllCustomers(allCustomers.map(updater));
      setCustomers(customers.map(updater));
      setFilteredCustomers(filteredCustomers.map(updater));
    } catch (error) {
      console.error('Error toggling payment analytics exclusion:', error);
    } finally {
      setUpdating(null);
    }
  };

  const toggleCustomerAnalyticsExclusion = async (customerId: string, currentValue: boolean) => {
    setUpdating(customerId);
    try {
      const { error } = await supabase.from('acumatica_customers').update({ exclude_from_customer_analytics: !currentValue }).eq('customer_id', customerId);
      if (error) throw error;
      const updater = (c: Customer) => c.customer_id === customerId ? { ...c, exclude_from_customer_analytics: !currentValue } : c;
      setAllCustomers(allCustomers.map(updater));
      setCustomers(customers.map(updater));
      setFilteredCustomers(filteredCustomers.map(updater));
    } catch (error) {
      console.error('Error toggling customer analytics exclusion:', error);
    } finally {
      setUpdating(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;
    try {
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update({ name: formData.name, email: formData.email }).eq('id', editingCustomer.id);
        if (error) throw error;
      }
      setShowForm(false);
      await loadCustomersBatched();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      alert('Error saving customer');
    }
  };

  const loadScheduledEmails = async (customerId: string) => {
    setLoadingSchedule(true);
    try {
      const { data, error } = await supabase
        .from('customer_assignments')
        .select(`id, start_day_of_month, timezone, email_formulas!inner (name, schedule), email_templates!inner (name)`)
        .eq('customer_id', customerId)
        .eq('is_active', true);
      if (error) throw error;

      const upcomingEmails: ScheduledEmail[] = [];
      const now = new Date();
      data?.forEach((assignment: any) => {
        const startDay = assignment.start_day_of_month;
        const schedule = assignment.email_formulas?.schedule || [];
        for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
          const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, startDay);
          schedule.forEach((scheduleItem: any) => {
            (scheduleItem.times || []).forEach((sendTime: string) => {
              const emailDate = new Date(targetDate);
              emailDate.setDate(emailDate.getDate() + (scheduleItem.day - 1));
              const [hours, minutes] = sendTime.split(':');
              emailDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
              if (emailDate > now) {
                upcomingEmails.push({
                  id: `${assignment.id}-${monthOffset}-${scheduleItem.day}-${sendTime}`,
                  scheduled_time: emailDate.toISOString(),
                  template_name: assignment.email_templates?.name || 'N/A',
                  formula_name: `${assignment.email_formulas?.name || 'N/A'} (Day ${scheduleItem.day})`,
                  timezone: assignment.timezone
                });
              }
            });
          });
        }
      });
      upcomingEmails.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
      setScheduledEmails(upcomingEmails.slice(0, 10));
    } catch (error) {
      console.error('Error loading scheduled emails:', error);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const exportToExcel = () => {
    const totalBalance = filteredCustomers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const totalGross = filteredCustomers.reduce((sum, c) => sum + (c.gross_balance || 0), 0);
    const totalInvoices = filteredCustomers.reduce((sum, c) => sum + (c.invoice_count || 0), 0);
    const filterDesc = hasActiveFilters
      ? `Filtered_${filteredCustomers.length}_of_${grandTotalCustomers}`
      : `All_${filteredCustomers.length}`;

    const exportData = filteredCustomers.map((customer, index) => ({
      '#': index + 1,
      'Customer ID': customer.customer_id || customer.id,
      'Customer Name': customer.name,
      'Email': customer.email,
      'Active': customer.is_active ? 'Yes' : 'No',
      'Open Invoices': customer.invoice_count || 0,
      'Gross Balance': customer.gross_balance || 0,
      'Net Balance': customer.balance || 0,
      'Max Days Overdue': customer.max_days_overdue || 0,
      'Red Invoices': customer.red_count || 0,
      'Yellow Invoices': customer.yellow_count || 0,
      'Green Invoices': customer.green_count || 0,
      'Responded This Month': customer.responded_this_month ? 'Yes' : 'No',
      'Postponed Until': customer.postpone_until ? new Date(customer.postpone_until).toLocaleDateString() : '',
      'Postpone Reason': customer.postpone_reason || ''
    }));

    const summaryRow = {
      '#': '', 'Customer ID': '', 'Customer Name': 'TOTALS', 'Email': '', 'Active': '',
      'Open Invoices': totalInvoices, 'Gross Balance': totalGross, 'Net Balance': totalBalance,
      'Max Days Overdue': '', 'Red Invoices': '', 'Yellow Invoices': '', 'Green Invoices': '',
      'Responded This Month': '', 'Postponed Until': '', 'Postpone Reason': ''
    };

    const worksheet = XLSX.utils.json_to_sheet([...exportData, summaryRow]);
    worksheet['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 30 }, { wch: 28 }, { wch: 8 },
      { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
      { wch: 16 }, { wch: 20 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
    XLSX.writeFile(workbook, `customers_${filterDesc}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const activeFilterCount = [
    filters.minBalance > 0, filters.maxBalance !== Infinity,
    filters.minInvoiceCount > 0, filters.maxInvoiceCount !== Infinity,
    filters.minInvoiceAmount > 0, filters.maxInvoiceAmount !== Infinity,
    filters.minDaysOverdue > 0, filters.maxDaysOverdue !== Infinity,
    filters.dateFrom !== '', filters.dateTo !== '',
    searchQuery.trim() !== ''
  ].filter(Boolean).length;

  // Schedule view
  if (viewingSchedule) {
    return (
      <div className="min-h-screen bg-gray-100 text-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => { setViewingSchedule(null); setScheduledEmails([]); }}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors mb-6">
            <ArrowLeft size={20} /> Back to Customers
          </button>
          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-600 p-2 rounded-lg"><Clock size={24} className="text-white" /></div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Upcoming Emails</h2>
                  <p className="text-gray-600">{viewingSchedule.name}</p>
                </div>
              </div>
              <button onClick={() => loadScheduledEmails(viewingSchedule.id)} disabled={loadingSchedule}
                className="p-2 bg-white hover:bg-gray-50 border border-gray-300 text-gray-900 rounded-lg transition-colors">
                <RefreshCw size={18} className={loadingSchedule ? 'animate-spin' : ''} />
              </button>
            </div>
            {loadingSchedule ? (
              <div className="text-center py-8">
                <RefreshCw className="animate-spin text-orange-600 mx-auto mb-4" size={32} />
                <p className="text-gray-600">Loading schedule...</p>
              </div>
            ) : scheduledEmails.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {scheduledEmails.map((email) => {
                  const scheduledDate = new Date(email.scheduled_time);
                  const isToday = scheduledDate.toDateString() === new Date().toDateString();
                  return (
                    <div key={email.id} className={`p-4 rounded-lg border transition-all ${isToday ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-300'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Mail size={16} className={isToday ? 'text-orange-600' : 'text-blue-600'} />
                          <span className={`text-sm font-medium ${isToday ? 'text-orange-800' : 'text-gray-900'}`}>{email.template_name}</span>
                        </div>
                        {isToday && <span className="px-2 py-0.5 bg-orange-200 border border-orange-400 text-orange-800 text-xs rounded">Today</span>}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar size={12} />
                          <span>{scheduledDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock size={12} />
                          <span>{scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} ({email.timezone?.replace('America/', '').replace('_', ' ') || 'UTC'})</span>
                        </div>
                        <div className="text-gray-500">Formula: {email.formula_name}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="text-gray-400 mx-auto mb-4" size={48} />
                <p className="text-gray-600">No upcoming emails scheduled</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  if (viewingFiles) {
    return <CustomerFiles customerId={viewingFiles.id} customerName={viewingFiles.name} onBack={() => setViewingFiles(null)} />;
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors">
            <ArrowLeft size={20} /> Back to Customers
          </button>
          <div className="bg-white rounded-lg shadow border border-gray-300 p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Customer</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div className="flex gap-4">
                <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">Update Customer</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
        {/* Top bar */}
        <header className="flex-shrink-0 flex items-center gap-2.5 px-5 py-2.5 bg-white/80 backdrop-blur border-b border-gray-200">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-transparent hover:border-gray-200 flex-shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-shrink-0 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-tight">Customers</h1>
            <p className="text-[11px] text-gray-500 leading-tight">
              {grandTotalCustomers > 0 ? `${grandTotalCustomers.toLocaleString()} total` : 'Loading…'}
              {excludedCustomers.length > 0 && <span className="text-amber-600"> · {excludedCustomers.length} excluded</span>}
            </p>
          </div>
          <div className="flex-1 relative max-w-xl mx-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search name or customer ID…"
              className="w-full pl-9 pr-24 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white text-sm transition-all" />
            {(isSearching || searchQuery) && (
              <button onClick={() => { setSearchQuery(''); setIsSearching(false); setCurrentPage(0); }}
                className="absolute right-[70px] top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            )}
            <button onClick={handleSearch} disabled={loading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-xs font-medium">Search</button>
          </div>
          <div className="flex-1" />
          <PageHelp title="Customers" intro="Every customer with their balance and status, so you can prioritise collections, filter/segment them, and act. Here's what each part means:" sections={CUSTOMERS_HELP} />
          {/* Credit-memo toggle. ON (default) = include: each customer's credit memos
              are subtracted so Balance shows the real net amount owed. OFF = gross. */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white flex-shrink-0"
            title={!excludeCreditMemos
              ? 'Credit memos INCLUDED — each customer’s credit memos are subtracted, so Balance is the real (net) amount they owe. Click to exclude them.'
              : 'Credit memos EXCLUDED — Balance shows the gross amount and ignores credit memos. Click to include them.'}>
            <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Credit Memos</span>
            <button role="switch" aria-checked={!excludeCreditMemos} onClick={() => setExcludeCreditMemos(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${!excludeCreditMemos ? 'bg-emerald-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${!excludeCreditMemos ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <button onClick={() => setShowFiltersDrawer(true)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border flex-shrink-0 ${activeFilterCount > 0 ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            <SlidersHorizontal size={15} /> Filters
            {activeFilterCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-white text-blue-600 text-[10px] font-bold rounded-full">{activeFilterCount}</span>}
          </button>
          <button onClick={() => setShowStatsDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex-shrink-0">
            <BarChart3 size={15} /> Statistics
          </button>
          <button onClick={exportToExcel} disabled={loading || filteredCustomers.length === 0} title="Export to Excel"
            className="p-2 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex-shrink-0"><Download size={16} /></button>
          <button onClick={() => loadCustomersBatched()} disabled={loading} title="Refresh"
            className="p-2 bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
        </header>

        {/* Quick filters */}
        <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-white/40 overflow-x-auto">
          <Zap size={13} className="text-amber-500 flex-shrink-0" />
          {quickFilters.map((qf, idx) => (
            <button key={idx} onClick={() => applyQuickFilter(idx)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all border whitespace-nowrap flex-shrink-0 ${activeQuickFilter === idx ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
              {qf.label} {qf.desc && <span className={activeQuickFilter === idx ? 'text-gray-300' : 'text-gray-400'}>{qf.desc}</span>}
            </button>
          ))}
          <button onClick={() => setShowQuickEditor(true)} title="Edit quick filters"
            className="p-1 text-gray-400 hover:text-blue-600 flex-shrink-0"><Settings size={14} /></button>
          <div className="flex-1" />
          <span className="text-[11px] text-gray-500 whitespace-nowrap flex-shrink-0">
            {hasActiveFilters ? <>Showing <span className="font-semibold text-gray-700">{filteredCustomers.length.toLocaleString()}</span> of {grandTotalCustomers.toLocaleString()}</> : `${grandTotalCustomers.toLocaleString()} customers`}
          </span>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap flex-shrink-0"><X size={11} /> Clear</button>
          )}
        </div>

        {/* List */}
        <main className="flex-1 min-h-0 flex flex-col px-4 py-3">
        {/* Customers Table */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
            <p className="text-sm text-gray-500">Loading customers...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
            <Users className="text-gray-300 mx-auto mb-4" size={48} />
            <p className="text-gray-500 mb-4">No customers found</p>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors text-sm font-medium">
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden" data-tour="customer-list">
            {/* Pagination Top */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <button onClick={goToPreviousPage} disabled={currentPage === 0 || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-xs text-gray-500 flex items-center gap-2">
                <span className="font-medium text-gray-700">
                  {Math.min(currentPage * PAGE_SIZE + 1, totalCount)}-{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)}
                </span>
                of {totalCount.toLocaleString()}
                {loadingMore && (
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <RefreshCw size={12} className="animate-spin" /> loading more...
                  </span>
                )}
              </span>
              <button onClick={goToNextPage} disabled={(currentPage + 1) * PAGE_SIZE >= totalCount || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                Next <ChevronRight size={16} />
              </button>
            </div>

            {/* Table */}
            <div ref={scrollContainerRef} onScroll={(e) => { scrollPosRef.current = e.currentTarget.scrollTop; }}
              className="flex-1 min-h-0 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1.5">Customer {getSortIcon('name')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('invoice_count')}>
                      <div className="flex items-center justify-end gap-1.5">Invoices {getSortIcon('invoice_count')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('balance')}>
                      <div className="flex items-center justify-end gap-1.5">Balance {getSortIcon('balance')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('max_days_overdue')}>
                      <div className="flex items-center justify-end gap-1.5">Overdue {getSortIcon('max_days_overdue')}</div>
                    </th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1.5">Last Payment</div>
                    </th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Resp.</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map((customer) => {
                    const exceedsRedThreshold = (customer.max_days_overdue || 0) >= (customer.red_threshold_days || 30);
                    const cidKey = customer.customer_id || customer.id;
                    const isExpanded = expandedCustomerId === cidKey;
                    return (
                      <Fragment key={customer.id}>
                      <tr data-tour="customer-row" className={`transition-colors duration-150 ${exceedsRedThreshold ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-blue-50/40'}`}>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <button onClick={() => toggleExpandCustomer(customer)} title="Show this customer's invoices"
                              className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0">
                              <ChevronRight size={16} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </button>
                            <span
                              title={`Color level -- ${customer.red_count || 0} red / ${customer.yellow_count || 0} yellow / ${customer.green_count || 0} green invoices`}
                              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                (customer.red_count || 0) > 0 ? 'bg-red-500'
                                : (customer.yellow_count || 0) > 0 ? 'bg-amber-400'
                                : (customer.green_count || 0) > 0 ? 'bg-emerald-500'
                                : 'bg-gray-300'
                              }`}
                            />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-gray-900 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                                  title="Open this customer in a new tab"
                                  onClick={() => {
                                    const cid = customer.customer_id || customer.id;
                                    if (cid) window.open(buildCustomerUrl(cid), '_blank', 'noopener,noreferrer');
                                  }}>{customer.name}</span>
                                {(() => {
                                  const tc = customersWithOpenTickets.get(customer.id) || 0;
                                  return (
                                    <button onClick={() => {
                                        const prefix = orgSlug ? `/${orgSlug}` : '';
                                        window.open(`${prefix}/collection-ticketing?customerId=${customer.id}`, '_blank', 'noopener,noreferrer');
                                      }}
                                      title={tc > 0 ? `${tc} open ticket(s) -- click to view / add (opens in a new tab)` : 'Add a ticket for this customer (opens in a new tab)'}
                                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                                        tc > 0
                                          ? 'bg-red-100 border-red-200 hover:bg-red-200 text-red-700'
                                          : 'bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-600'
                                      }`}>
                                      <Ticket size={10} /> {tc > 0 ? `${tc} Ticket${tc > 1 ? 's' : ''}` : '+ Ticket'}
                                    </button>
                                  );
                                })()}
                                {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                                  <button onClick={() => handleUnpostpone(customer.id)} disabled={updating === customer.id}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-100 border border-yellow-200 hover:bg-yellow-200 rounded text-[10px] text-yellow-700 transition-colors">
                                    <PauseCircle size={10} /> {new Date(customer.postpone_until).toLocaleDateString()}
                                  </button>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">{customer.customer_id || customer.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-800 font-medium tabular-nums">
                          {hasInvoiceLevelFilters ? (
                            <span title={`${customer.filtered_invoice_count || 0} of ${customer.invoice_count || 0} invoices match filters`}>
                              <span className="text-teal-700">{customer.filtered_invoice_count || 0}</span>
                              <span className="text-gray-400 text-xs">/{customer.invoice_count || 0}</span>
                            </span>
                          ) : (customer.invoice_count || 0)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm text-gray-900 font-bold tabular-nums">
                          {hasInvoiceLevelFilters ? (() => {
                            // Respect the Credit Memos toggle in the filtered figure too:
                            // included → net (credit memos subtracted); excluded → gross.
                            const fb = excludeCreditMemos
                              ? (customer.filtered_gross_balance || 0)
                              : (customer.filtered_net_balance ?? customer.filtered_gross_balance ?? 0);
                            return (
                              <span title={`$${fb.toLocaleString('en-US', { minimumFractionDigits: 2 })} of $${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} matches filters${excludeCreditMemos ? '' : ' (credit memos applied)'}`}>
                                <span className="text-teal-700">${fb.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-gray-400 text-xs ml-1">of ${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </span>
                            );
                          })() : (
                            <>${(customer.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <span className={`text-sm font-semibold tabular-nums ${
                            (customer.max_days_overdue || 0) > 90 ? 'text-red-600' :
                            (customer.max_days_overdue || 0) > 60 ? 'text-orange-500' :
                            (customer.max_days_overdue || 0) > 30 ? 'text-amber-500' : 'text-gray-500'
                          }`}>{customer.max_days_overdue || 0}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm tabular-nums">
                          {(() => {
                            const lp = lastPayments.get(customer.customer_id || customer.id);
                            if (!lp || !lp.date) return <span className="text-gray-400">--</span>;
                            const d = new Date(lp.date);
                            const days = Math.floor((Date.now() - d.getTime()) / 86400000);
                            return (
                              <div className="leading-tight"
                                title={`$${lp.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} on ${d.toLocaleDateString()}${days >= 0 ? ` — ${days} day${days === 1 ? '' : 's'} ago` : ''}`}>
                                <div className={days > 90 ? 'text-red-600 font-semibold' : days > 60 ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                                  {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                                </div>
                                <div className="text-[11px] text-gray-500 font-medium">${lp.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center">
                            <button onClick={() => handleToggleResponded(customer.id, customer.responded_this_month)} disabled={updating === customer.id}
                              className={`p-0.5 rounded transition-colors ${updating === customer.id ? 'opacity-50' : 'hover:bg-gray-100'}`}>
                              {customer.responded_this_month ? <CheckSquare className="text-emerald-600" size={18} /> : <Square className="text-gray-400" size={18} />}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex justify-center gap-1">
                            {customer.postpone_until && new Date(customer.postpone_until) > new Date() && (
                              <button onClick={() => handleUnpostpone(customer.id)} disabled={updating === customer.id}
                                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors" title="Remove Postponement">
                                <Play size={14} />
                              </button>
                            )}
                            <button onClick={() => setViewingFiles({ id: customer.id, name: customer.name })}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors" title="View Files">
                              <FileText size={14} />
                            </button>
                            <button onClick={() => handleEdit(customer)}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors" title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(customer.id)}
                              className="p-1.5 bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                            {loadingExpanded === cidKey ? (
                              <div className="text-sm text-gray-500 py-2">Loading invoices...</div>
                            ) : (() => {
                              const all = expandedInvoices.get(cidKey) || [];
                              if (all.length === 0) return <div className="text-sm text-gray-500 py-2">No invoices found for this customer.</div>;
                              const openList = all.filter((i: any) => Number(i.balance) !== 0);
                              const list = invView === 'open' ? openList : all;
                              const visible = showAllInvRows ? list : list.slice(0, 7);
                              return (
                                <div className="overflow-x-auto">
                                  <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                                      {list.length} {invView === 'open' ? 'open ' : ''}invoice{list.length === 1 ? '' : 's'}
                                      {invView === 'open' && all.length !== openList.length && <span className="text-gray-400"> · {all.length} total</span>}
                                    </div>
                                    <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px] flex-shrink-0">
                                      {(['open', 'all'] as const).map(v => (
                                        <button key={v} onClick={() => { setInvView(v); setShowAllInvRows(false); }}
                                          className={`px-2.5 py-1 font-medium transition-colors ${invView === v ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}>
                                          {v === 'open' ? 'Open only' : 'All'}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {list.length === 0 ? (
                                    <div className="text-xs text-gray-400 py-2">No open invoices — switch to “All” to see paid/closed ones.</div>
                                  ) : (
                                    <>
                                      <div className={showAllInvRows ? 'max-h-72 overflow-y-auto rounded border border-gray-100' : ''}>
                                        <table className="w-full text-xs">
                                          <thead className="sticky top-0 bg-gray-100">
                                            <tr className="text-gray-500 text-left">
                                              <th className="py-1 px-2">Invoice #</th>
                                              <th className="py-1 px-2">Type</th>
                                              <th className="py-1 px-2">Status</th>
                                              <th className="py-1 px-2">Date</th>
                                              <th className="py-1 px-2">Due</th>
                                              <th className="py-1 px-2 text-right">Amount</th>
                                              <th className="py-1 px-2 text-right">Balance</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {visible.map((inv: any, idx: number) => (
                                              <tr key={`${inv.reference_number}-${inv.type}-${idx}`} className="border-t border-gray-100">
                                                <td className="py-1 px-2 font-medium text-gray-800">{inv.reference_number}</td>
                                                <td className="py-1 px-2 text-gray-600">{inv.type}</td>
                                                <td className="py-1 px-2 text-gray-600">{inv.status}</td>
                                                <td className="py-1 px-2 text-gray-600">{inv.date ? String(inv.date).split('T')[0] : ''}</td>
                                                <td className="py-1 px-2 text-gray-600">{inv.due_date ? String(inv.due_date).split('T')[0] : ''}</td>
                                                <td className="py-1 px-2 text-right tabular-nums">${(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                <td className="py-1 px-2 text-right tabular-nums font-semibold">${(inv.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                      {list.length > 7 && (
                                        <button onClick={() => setShowAllInvRows(v => !v)}
                                          className="mt-1.5 w-full py-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors">
                                          {showAllInvRows ? 'Show fewer' : `View all ${list.length} invoices`}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Bottom */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <button onClick={goToPreviousPage} disabled={currentPage === 0 || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-xs text-gray-500">
                Page {currentPage + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
                {loadingMore && <span className="text-blue-600 ml-1"><RefreshCw size={12} className="animate-spin inline" /></span>}
              </span>
              <button onClick={goToNextPage} disabled={(currentPage + 1) * PAGE_SIZE >= totalCount || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 border border-gray-200 rounded-lg transition-all text-sm">
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
    {/* ── Advanced Filters drawer ─────────────────────────────────── */}
    {showFiltersDrawer && (
      <div className="fixed inset-0 z-[60] flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowFiltersDrawer(false)} />
        <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><SlidersHorizontal size={18} className="text-blue-600" /><h2 className="text-base font-bold text-gray-900">Advanced Filters</h2></div>
            <button onClick={() => setShowFiltersDrawer(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <p className="text-[11px] text-gray-500">
              Filters here apply right away. To save a filter you reuse — including specific customers to keep or hide —
              build a <span className="font-semibold text-amber-600">Quick Filter</span> (the ⚡ bar) instead.
            </p>

            {/* Customer filters */}
            <div>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">Customer</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Balance</label>
                  <input type="number" value={filters.minBalance || ''} onChange={(e) => setFilters({ ...filters, minBalance: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Balance</label>
                  <input type="number" value={filters.maxBalance === Infinity ? '' : filters.maxBalance} onChange={(e) => setFilters({ ...filters, maxBalance: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Invoice Count</label>
                  <input type="number" value={filters.minInvoiceCount || ''} onChange={(e) => setFilters({ ...filters, minInvoiceCount: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Invoice Count</label>
                  <input type="number" value={filters.maxInvoiceCount === Infinity ? '' : filters.maxInvoiceCount} onChange={(e) => setFilters({ ...filters, maxInvoiceCount: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" />
                </div>
              </div>
            </div>

            {/* Invoice filters */}
            <div>
              <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-2">Invoices</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Invoice Amount</label>
                  <input type="number" value={filters.minInvoiceAmount || ''} onChange={(e) => setFilters({ ...filters, minInvoiceAmount: Number(e.target.value) || 0 })}
                    placeholder="0" className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Invoice Amount</label>
                  <input type="number" value={filters.maxInvoiceAmount === Infinity ? '' : filters.maxInvoiceAmount} onChange={(e) => setFilters({ ...filters, maxInvoiceAmount: e.target.value ? Number(e.target.value) : Infinity })}
                    placeholder="Any" className="w-full px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Min Days Overdue</label>
                  <div className="flex gap-1.5">
                    <input type="number" value={filters.minDaysOverdue || ''} onChange={(e) => setFilters({ ...filters, minDaysOverdue: Number(e.target.value) || 0 })}
                      placeholder="0" className="flex-1 min-w-0 px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                    <OverdueDatePicker title="Pick a date — sets Min Days Overdue to today minus that date (overdue since…)" onPick={(days) => setFilters(f => ({ ...f, minDaysOverdue: days }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Max Days Overdue</label>
                  <div className="flex gap-1.5">
                    <input type="number" value={filters.maxDaysOverdue === Infinity ? '' : filters.maxDaysOverdue} onChange={(e) => setFilters({ ...filters, maxDaysOverdue: e.target.value ? Number(e.target.value) : Infinity })}
                      placeholder="Any" className="flex-1 min-w-0 px-3 py-2 border border-teal-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm bg-white" />
                    <OverdueDatePicker title="Pick a date — sets Max Days Overdue to today minus that date" onPick={(days) => setFilters(f => ({ ...f, maxDaysOverdue: days }))} />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Overdue Counted From</label>
                  <div className="flex rounded-lg border border-teal-200 overflow-hidden bg-white">
                    {([{ v: 'due_date', label: 'Due Date' }, { v: 'invoice_date', label: 'Invoice Date' }] as const).map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setFilters({ ...filters, overdueBasis: opt.v })}
                        className={`flex-1 px-3 py-2 text-sm transition-colors ${filters.overdueBasis === opt.v ? 'bg-teal-600 text-white font-semibold' : 'bg-white text-gray-600 hover:bg-teal-50'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sort */}
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Sort</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Sort By</label>
                  <select value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                    <option value="balance">Balance</option>
                    <option value="invoice_count">Invoice Count</option>
                    <option value="max_days_overdue">Days Overdue</option>
                    <option value="name">Customer Name</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Order</label>
                  <select value={filters.sortOrder} onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value as 'asc' | 'desc' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white">
                    <option value="desc">Highest First</option>
                    <option value="asc">Lowest First</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Include-only customers */}
            <div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Include Only</p>
              <p className="text-[11px] text-gray-500 mb-2">When set, the list &amp; statistics show ONLY these customers.</p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input value={includeSearch} onChange={(e) => setIncludeSearch(e.target.value)}
                  placeholder="Search a customer to include…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400" />
                {includeSearch.trim().length >= 2 && (() => {
                  const q = includeSearch.toLowerCase();
                  const matches = allCustomers.filter(c => !includedSet.has(c.customer_id || c.id) && (((c.name || '').toLowerCase().includes(q)) || String(c.customer_id || c.id || '').toLowerCase().includes(q))).slice(0, 10);
                  return (
                    <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {matches.map(c => (
                        <button key={c.id} onClick={() => { addIncludedCustomer(c.customer_id || c.id); setIncludeSearch(''); }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-emerald-50 text-sm border-b border-gray-50 last:border-0">
                          <span className="truncate"><span className="font-medium text-gray-800">{c.name}</span> <span className="text-gray-400 text-xs">{c.customer_id || c.id}</span></span>
                          <Plus size={14} className="text-emerald-600 flex-shrink-0" />
                        </button>
                      ))}
                      {matches.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {includedCustomers.length === 0 && <span className="text-[11px] text-gray-400">All customers (no include filter).</span>}
                {includedCustomers.map(id => {
                  const c = allCustomers.find(x => (x.customer_id || x.id) === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-800">
                      {c?.name || id}
                      <button onClick={() => removeIncludedCustomer(id)} className="hover:text-emerald-950"><X size={11} /></button>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Always-exclude customers */}
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Always Exclude</p>
              <p className="text-[11px] text-gray-500 mb-2">Hidden from the list and statistics everywhere on this page.</p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input value={excludeSearch} onChange={(e) => setExcludeSearch(e.target.value)}
                  placeholder="Search a customer to exclude…"
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400" />
                {excludeSearch.trim().length >= 2 && (() => {
                  const q = excludeSearch.toLowerCase();
                  const matches = allCustomers.filter(c => !excludedSet.has(c.customer_id || c.id) && (((c.name || '').toLowerCase().includes(q)) || String(c.customer_id || c.id || '').toLowerCase().includes(q))).slice(0, 10);
                  return (
                    <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                      {matches.map(c => (
                        <button key={c.id} onClick={() => { addExcludedCustomer(c.customer_id || c.id); setExcludeSearch(''); }}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-amber-50 text-sm border-b border-gray-50 last:border-0">
                          <span className="truncate"><span className="font-medium text-gray-800">{c.name}</span> <span className="text-gray-400 text-xs">{c.customer_id || c.id}</span></span>
                          <Plus size={14} className="text-amber-600 flex-shrink-0" />
                        </button>
                      ))}
                      {matches.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {excludedCustomers.length === 0 && <span className="text-[11px] text-gray-400">No customers excluded.</span>}
                {excludedCustomers.map(id => {
                  const c = allCustomers.find(x => (x.customer_id || x.id) === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
                      {c?.name || id}
                      <button onClick={() => removeExcludedCustomer(id)} className="hover:text-amber-950"><X size={11} /></button>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800"><X size={12} /> Reset all</button>
            <button onClick={() => setShowFiltersDrawer(false)} className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium">Done</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Statistics drawer ────────────────────────────────────────── */}
    {showStatsDrawer && (() => {
      const withBal = allCustomers.filter(c => (c.balance || 0) > 0);
      const money = (n: number) => n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;
      const balBuckets = [
        { name: '<$1k', min: 0, max: 1000 }, { name: '$1–5k', min: 1000, max: 5000 },
        { name: '$5–10k', min: 5000, max: 10000 }, { name: '$10–25k', min: 10000, max: 25000 },
        { name: '$25k+', min: 25000, max: Infinity },
      ].map(b => ({ name: b.name, count: withBal.filter(c => (c.balance || 0) >= b.min && (c.balance || 0) < b.max).length }));
      const aging = [
        { name: 'Current', min: -Infinity, max: 1 }, { name: '1–30', min: 1, max: 31 },
        { name: '31–60', min: 31, max: 61 }, { name: '61–90', min: 61, max: 91 }, { name: '90+', min: 91, max: Infinity },
      ].map(b => ({ name: b.name, count: withBal.filter(c => (c.max_days_overdue || 0) >= b.min && (c.max_days_overdue || 0) < b.max).length }));
      const top = [...withBal].sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 8)
        .map(c => ({ name: (c.name || '').length > 20 ? (c.name || '').slice(0, 20) + '…' : (c.name || ''), balance: Math.round(c.balance || 0) }));
      const colorMix = [
        { name: 'Red', value: allCustomers.reduce((s, c) => s + (c.red_count || 0), 0), fill: '#ef4444' },
        { name: 'Yellow', value: allCustomers.reduce((s, c) => s + (c.yellow_count || 0), 0), fill: '#f59e0b' },
        { name: 'Green', value: allCustomers.reduce((s, c) => s + (c.green_count || 0), 0), fill: '#10b981' },
      ].filter(d => d.value > 0);
      const card = (label: string, value: string, sub: string) => (
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
          <p className="text-[11px] text-gray-400">{sub}</p>
        </div>
      );
      return (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowStatsDrawer(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2"><BarChart3 size={18} className="text-emerald-600" /><h2 className="text-base font-bold text-gray-900">Customer Statistics</h2></div>
              <button onClick={() => setShowStatsDrawer(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {hasActiveFilters && <p className="text-[11px] text-blue-600 -mb-2">Based on the {filteredCustomers.length.toLocaleString()} filtered customers.</p>}
              <div className="grid grid-cols-2 gap-3">
                {card('Customers', stats.total_customers.toLocaleString(), `${stats.active_customers.toLocaleString()} active`)}
                {card('With Debt', stats.customers_with_debt.toLocaleString(), `${stats.total_open_invoices.toLocaleString()} invoices`)}
                {card('Total Owed', money(stats.total_balance), `${stats.customers_with_debt.toLocaleString()} customers`)}
                {card('Avg Balance', money(stats.avg_balance), 'per debtor')}
              </div>

              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Balance distribution</p>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={balBuckets} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RTooltip cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#0a75b8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Aging — customers by days overdue</p>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={aging} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <RTooltip cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {aging.map((_, i) => <Cell key={i} fill={['#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444'][i]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Top customers by balance</p>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={top} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <RTooltip cursor={{ fill: '#f1f5f9' }} formatter={(v: any) => money(Number(v))} />
                    <Bar dataKey="balance" radius={[0, 4, 4, 0]} fill="#0a75b8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {colorMix.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-700 mb-2">Invoice color mix</p>
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie data={colorMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {colorMix.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <RTooltip formatter={(v: any, n: any) => [`${Number(v).toLocaleString()} invoices`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-4 -mt-2">
                    {colorMix.map(d => <span key={d.name} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />{d.name} · {d.value.toLocaleString()}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Quick-filter editor ──────────────────────────────────────── */}
    {showQuickEditor && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowQuickEditor(false)} />
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[88vh]">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-amber-500" />
              <div>
                <h2 className="text-base font-bold text-gray-900">Quick Filters</h2>
                <p className="text-[11px] text-gray-500">Named presets — balances, invoices, overdue days, and specific customers to include or exclude. Click one to apply it instantly.</p>
              </div>
            </div>
            <button onClick={() => setShowQuickEditor(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {quickFilters.map((qf, idx) => {
              const num = (v: number | undefined) => (v === undefined || v === Infinity ? '' : v);
              const mode: 'include' | 'exclude' = qf.customerMode ?? ((qf.excludedCustomers?.length && !(qf.includedCustomers?.length)) ? 'exclude' : 'include');
              const custPicker = (kind: 'includedCustomers' | 'excludedCustomers') => {
                const inc = kind === 'includedCustomers';
                const key = `${idx}:${inc ? 'inc' : 'exc'}`;
                const term = qfSearch[key] || '';
                const list = qf[kind] ?? [];
                const set = new Set(list);
                return (
                  <div>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                      <input value={term} onChange={(e) => setQfSearch(s => ({ ...s, [key]: e.target.value }))}
                        placeholder={inc ? 'Search a customer to include…' : 'Search a customer to exclude…'}
                        className={`w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 ${inc ? 'focus:ring-emerald-400 focus:border-emerald-400' : 'focus:ring-amber-400 focus:border-amber-400'}`} />
                      {term.trim().length >= 2 && (() => {
                        const q = term.toLowerCase();
                        const matches = allCustomers.filter(c => !set.has(c.customer_id || c.id) && (((c.name || '').toLowerCase().includes(q)) || String(c.customer_id || c.id || '').toLowerCase().includes(q))).slice(0, 8);
                        return (
                          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                            {matches.map(c => (
                              <button key={c.id} onClick={() => { toggleQuickFilterCustomer(idx, kind, c.customer_id || c.id, true); setQfSearch(s => ({ ...s, [key]: '' })); }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm border-b border-gray-50 last:border-0 ${inc ? 'hover:bg-emerald-50' : 'hover:bg-amber-50'}`}>
                                <span className="truncate"><span className="font-medium text-gray-800">{c.name}</span> <span className="text-gray-400 text-xs">{c.customer_id || c.id}</span></span>
                                <Plus size={13} className={`flex-shrink-0 ${inc ? 'text-emerald-600' : 'text-amber-600'}`} />
                              </button>
                            ))}
                            {matches.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {list.length === 0 && <span className="text-[11px] text-gray-400">{inc ? 'All customers.' : 'None excluded.'}</span>}
                      {list.map(id => {
                        const c = allCustomers.find(x => (x.customer_id || x.id) === id);
                        return (
                          <span key={id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${inc ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                            {c?.name || id}
                            <button onClick={() => toggleQuickFilterCustomer(idx, kind, id, false)} className={inc ? 'hover:text-emerald-950' : 'hover:text-amber-950'}><X size={11} /></button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              };
              return (
                <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input value={qf.label} onChange={(e) => updateQuickFilter(idx, { label: e.target.value })}
                      placeholder="Filter name (e.g. No Ditmus / No Pinnacle)" className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-medium" />
                    <input value={qf.desc || ''} onChange={(e) => updateQuickFilter(idx, { desc: e.target.value })}
                      placeholder="hint" className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs" />
                    <select value={qf.logic || 'AND'} onChange={(e) => updateQuickFilter(idx, { logic: e.target.value as 'AND' | 'OR' })}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"><option value="AND">AND</option><option value="OR">OR</option></select>
                    <button onClick={() => setQuickFilters(prev => prev.filter((_, i) => i !== idx))}
                      title="Delete" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Min Balance
                      <input type="number" value={num(qf.filter.minBalance)} onChange={(e) => updateQuickFilterCond(idx, { minBalance: Number(e.target.value) || 0 })}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="0" /></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Max Balance
                      <input type="number" value={num(qf.filter.maxBalance)} onChange={(e) => updateQuickFilterCond(idx, { maxBalance: e.target.value ? Number(e.target.value) : Infinity })}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="Any" /></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Min Invoices
                      <input type="number" value={num(qf.filter.minInvoiceCount)} onChange={(e) => updateQuickFilterCond(idx, { minInvoiceCount: Number(e.target.value) || 0 })}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="0" /></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Max Invoices
                      <input type="number" value={num(qf.filter.maxInvoiceCount)} onChange={(e) => updateQuickFilterCond(idx, { maxInvoiceCount: e.target.value ? Number(e.target.value) : Infinity })}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="Any" /></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Min Inv Amount
                      <input type="number" value={num(qf.filter.minInvoiceAmount)} onChange={(e) => updateQuickFilterCond(idx, { minInvoiceAmount: Number(e.target.value) || 0 })}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="0" /></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Max Inv Amount
                      <input type="number" value={num(qf.filter.maxInvoiceAmount)} onChange={(e) => updateQuickFilterCond(idx, { maxInvoiceAmount: e.target.value ? Number(e.target.value) : Infinity })}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="Any" /></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Min Days Overdue
                      <div className="flex gap-1 mt-0.5">
                        <input type="number" value={num(qf.filter.minDaysOverdue)} onChange={(e) => updateQuickFilterCond(idx, { minDaysOverdue: Number(e.target.value) || 0 })}
                          className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="0" />
                        <OverdueDatePicker title="Pick a date — overdue since…" onPick={(days) => updateQuickFilterCond(idx, { minDaysOverdue: days })} />
                      </div></label>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wide">Max Days Overdue
                      <div className="flex gap-1 mt-0.5">
                        <input type="number" value={num(qf.filter.maxDaysOverdue)} onChange={(e) => updateQuickFilterCond(idx, { maxDaysOverdue: e.target.value ? Number(e.target.value) : Infinity })}
                          className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="Any" />
                        <OverdueDatePicker title="Pick a date" onPick={(days) => updateQuickFilterCond(idx, { maxDaysOverdue: days })} />
                      </div></label>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Customers</span>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button type="button" onClick={() => setQuickFilterMode(idx, 'include')}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors ${mode === 'include' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Include only</button>
                        <button type="button" onClick={() => setQuickFilterMode(idx, 'exclude')}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-200 ${mode === 'exclude' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Exclude</button>
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {mode === 'include' ? 'show ONLY the customers you pick' : 'show everyone EXCEPT the customers you pick'}
                      </span>
                    </div>
                    {custPicker(mode === 'include' ? 'includedCustomers' : 'excludedCustomers')}
                  </div>
                </div>
              );
            })}
            <button onClick={() => setQuickFilters(prev => [...prev, { label: 'New filter', desc: '', filter: {}, customerMode: 'include', includedCustomers: [], excludedCustomers: [] }])}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              <Plus size={15} /> Add quick filter
            </button>
          </div>
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <button onClick={() => setQuickFilters(DEFAULT_QUICK_FILTERS)} className="text-xs text-gray-600 hover:text-gray-800">Reset to defaults</button>
            <button disabled={savingQuick} onClick={async () => {
                setSavingQuick(true);
                const err = await saveQuickFilters(quickFilters);
                setSavingQuick(false);
                if (err) { alert('Could not save quick filters to the database:\n\n' + err); return; }
                setShowQuickEditor(false);
              }}
              className="flex items-center gap-1.5 px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium disabled:opacity-60"><Check size={15} /> {savingQuick ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
