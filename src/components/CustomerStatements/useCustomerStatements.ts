import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { StatementCustomer, StatementInvoice, ReportTemplate, StatementExcelTemplate, SortField, SortOrder, StatementPeriod } from './types';
import { normalizeExcelLayout } from '../../lib/statementExport';

const BATCH_SIZE = 200;

function mapRow(row: any): StatementCustomer {
  return {
    customer_id: row.customer_id,
    customer_name: row.customer_name || row.customer_id,
    email: row.email || '',
    terms: row.terms || '',
    total_balance: Number(row.total_balance) || 0,
    credit_memo_balance: Number(row.credit_memo_balance) || 0,
    open_invoice_count: Number(row.open_invoice_count) || 0,
    max_days_overdue: Number(row.max_days_overdue) || 0,
    invoices: [],
  };
}

export function useCustomerStatements() {
  const [customers, setCustomers] = useState<StatementCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [excelTemplates, setExcelTemplates] = useState<StatementExcelTemplate[]>([]);
  const [selectedExcelTemplateId, setSelectedExcelTemplateId] = useState<string | null>(null);
  const [emailOverrides, setEmailOverrides] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [minBalance, setMinBalance] = useState(0);
  // Period-based invoice-activity segmentation.
  const [period, setPeriod] = useState<StatementPeriod>('last_month');
  const [onlyInvoiced, setOnlyInvoiced] = useState(false);
  const [minInvoicedAmount, setMinInvoicedAmount] = useState(0);
  const [activityMap, setActivityMap] = useState<Record<string, { count: number; amount: number; last: string | null }>>({});
  const [activityLoading, setActivityLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('balance');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTestCustomers, setShowTestCustomers] = useState(false);
  const [invoiceCache, setInvoiceCache] = useState<Record<string, StatementInvoice[]>>({});
  const [loadingInvoices, setLoadingInvoices] = useState<string | null>(null);
  const abortRef = useRef(0);

  const loadData = useCallback(async (testMode: boolean) => {
    const loadId = ++abortRef.current;
    setLoading(true);
    setLoadingMore(false);
    setCustomers([]);
    setTotalLoaded(0);

    try {
      let from = 0;
      let firstBatch = true;
      while (true) {
        if (abortRef.current !== loadId) return;

        const { data, error } = await supabase.rpc('get_customer_statements', {
          p_test_mode: testMode,
        }).range(from, from + BATCH_SIZE - 1);

        if (abortRef.current !== loadId) return;
        if (error) throw error;
        if (!data || data.length === 0) break;

        const mapped = data.map(mapRow);

        setCustomers(prev => [...prev, ...mapped]);
        setTotalLoaded(prev => prev + mapped.length);

        if (firstBatch) {
          setLoading(false);
          firstBatch = false;
          if (data.length === BATCH_SIZE) {
            setLoadingMore(true);
          }
        }

        if (data.length < BATCH_SIZE) break;
        from += BATCH_SIZE;
      }
    } catch (err) {
      console.error('Error loading customer statements data:', err);
    } finally {
      if (abortRef.current === loadId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const mapInvoices = (data: any[]): StatementInvoice[] => {
    const today = new Date();
    return data.map((inv: any) => {
      const dueDate = inv.due_date ? new Date(inv.due_date) : today;
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));
      const isCredit = inv.type === 'Credit Memo' || inv.type === 'Credit WO';
      const rawAmount = Number(inv.amount) || Number(inv.dac_total) || 0;
      const rawBalance = Number(inv.balance) || 0;
      return {
        reference_number: inv.reference_number,
        date: inv.date,
        due_date: inv.due_date,
        amount: isCredit ? -Math.abs(rawAmount) : rawAmount,
        balance: isCredit ? -Math.abs(rawBalance) : rawBalance,
        status: inv.status,
        description: inv.description || '',
        days_overdue: isCredit ? 0 : daysOverdue,
        type: inv.type || 'Invoice',
      };
    });
  };

  const loadInvoicesForCustomer = useCallback(async (customerId: string) => {
    if (invoiceCache[customerId]) return;
    setLoadingInvoices(customerId);

    try {
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, date, due_date, amount, dac_total, balance, status, description, type')
        .neq('status', 'On Hold')
        .eq('customer', customerId)
        .gt('balance', 0)
        .neq('status', 'Voided')
        .neq('status', 'Draft')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const invoices = mapInvoices(data || []);
      setInvoiceCache(prev => ({ ...prev, [customerId]: invoices }));
      setCustomers(prev => prev.map(c =>
        c.customer_id === customerId ? { ...c, invoices } : c
      ));
    } catch (err) {
      console.error('Error loading invoices for customer:', err);
    } finally {
      setLoadingInvoices(null);
    }
  }, [invoiceCache]);

  const ensureInvoicesLoaded = useCallback(async (customerIds: string[]): Promise<Record<string, StatementInvoice[]>> => {
    const missing = customerIds.filter(id => !invoiceCache[id]);
    if (missing.length === 0) {
      const result: Record<string, StatementInvoice[]> = {};
      customerIds.forEach(id => { result[id] = invoiceCache[id] || []; });
      return result;
    }

    const batchSize = 20;
    const newCache: Record<string, StatementInvoice[]> = {};

    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('customer, reference_number, date, due_date, amount, dac_total, balance, status, description, type')
        .neq('status', 'On Hold')
        .in('customer', batch)
        .gt('balance', 0)
        .neq('status', 'Voided')
        .neq('status', 'Draft')
        .order('due_date', { ascending: true });

      if (error) throw error;

      const grouped: Record<string, any[]> = {};
      (data || []).forEach((inv: any) => {
        if (!grouped[inv.customer]) grouped[inv.customer] = [];
        grouped[inv.customer].push(inv);
      });

      batch.forEach(cid => {
        newCache[cid] = mapInvoices(grouped[cid] || []);
      });
    }

    setInvoiceCache(prev => ({ ...prev, ...newCache }));
    setCustomers(prev => prev.map(c =>
      newCache[c.customer_id] ? { ...c, invoices: newCache[c.customer_id] } : c
    ));

    const result: Record<string, StatementInvoice[]> = {};
    customerIds.forEach(id => {
      result[id] = newCache[id] || invoiceCache[id] || [];
    });
    return result;
  }, [invoiceCache]);

  const loadTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customer_report_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
      const def = data?.find((t: any) => t.is_default);
      setSelectedTemplateId(def?.id || data?.[0]?.id || null);
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  }, []);

  // Excel layout templates. If the table doesn't exist yet the query fails
  // quietly and the built-in default layout is used.
  const loadExcelTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('statement_excel_templates')
        .select('id, name, layout, is_default')
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      const mapped: StatementExcelTemplate[] = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        layout: normalizeExcelLayout(t.layout),
        is_default: !!t.is_default,
      }));
      setExcelTemplates(mapped);
      setSelectedExcelTemplateId(prev => {
        if (prev && mapped.some(t => t.id === prev)) return prev;
        const def = mapped.find(t => t.is_default);
        return def?.id || mapped[0]?.id || null;
      });
    } catch (err) {
      console.error('Error loading excel statement templates:', err);
    }
  }, []);

  // Manual per-customer email overrides for statement sends.
  const loadEmailOverrides = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('statement_email_overrides')
        .select('customer_id, email');
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.customer_id] = r.email; });
      setEmailOverrides(map);
    } catch (err) {
      console.error('Error loading statement email overrides:', err);
    }
  }, []);

  const saveEmailOverride = useCallback(async (customerId: string, email: string) => {
    const { error } = await supabase
      .from('statement_email_overrides')
      .upsert({ customer_id: customerId, email }, { onConflict: 'customer_id' });
    if (error) throw error;
    setEmailOverrides(prev => ({ ...prev, [customerId]: email }));
  }, []);

  const clearEmailOverride = useCallback(async (customerId: string) => {
    const { error } = await supabase
      .from('statement_email_overrides')
      .delete()
      .eq('customer_id', customerId);
    if (error) throw error;
    setEmailOverrides(prev => {
      const next = { ...prev };
      delete next[customerId];
      return next;
    });
  }, []);

  useEffect(() => {
    loadData(showTestCustomers);
    loadTemplates();
    loadExcelTemplates();
    loadEmailOverrides();
  }, [loadData, loadTemplates, loadExcelTemplates, loadEmailOverrides, showTestCustomers]);

  // ── Invoice-activity for the selected period ────────────────────────────
  const periodRange = (p: StatementPeriod): { from: string; to: string } | null => {
    const now = new Date();
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (p === 'all') return null;
    if (p === 'last_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) };
    if (p === 'this_month') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
    if (p === 'last_30') { const f = new Date(now); f.setDate(f.getDate() - 30); return { from: fmt(f), to: fmt(now) }; }
    if (p === 'last_90') { const f = new Date(now); f.setDate(f.getDate() - 90); return { from: fmt(f), to: fmt(now) }; }
    return null;
  };

  const loadActivity = useCallback(async (p: StatementPeriod) => {
    const range = periodRange(p);
    if (!range) { setActivityMap({}); return; }
    setActivityLoading(true);
    try {
      const map: Record<string, { count: number; amount: number; last: string | null }> = {};
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .rpc('get_customer_invoice_activity', { p_from: range.from, p_to: range.to })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = data || [];
        batch.forEach((r: any) => { map[r.customer_id] = { count: Number(r.inv_count) || 0, amount: Number(r.inv_amount) || 0, last: r.last_invoice_date }; });
        if (batch.length < PAGE) break;
      }
      setActivityMap(map);
    } catch (e) {
      console.error('Error loading invoice activity:', e);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => { loadActivity(period); }, [period, loadActivity]);

  const filtered = (() => {
    // Attach the period's invoice activity and any manual email override to
    // each customer, then filter. Everything downstream (cards, previews,
    // sends) sees the override as the customer's email.
    let list = customers.map(c => {
      const a = activityMap[c.customer_id];
      const override = emailOverrides[c.customer_id];
      return {
        ...c,
        email: override || c.email,
        email_overridden: !!override,
        original_email: c.email,
        invoiced_count: a?.count ?? 0, invoiced_amount: a?.amount ?? 0, last_invoice_date: a?.last ?? null,
      };
    }).filter(c => c.total_balance >= minBalance);

    if (onlyInvoiced) list = list.filter(c => (c.invoiced_count ?? 0) > 0);
    if (minInvoicedAmount > 0) list = list.filter(c => (c.invoiced_amount ?? 0) >= minInvoicedAmount);

    if (search.trim()) {
      const s = search.toLowerCase().trim();
      list = list.filter(c =>
        c.customer_name.toLowerCase().includes(s) ||
        c.customer_id.toLowerCase().includes(s) ||
        c.email.toLowerCase().includes(s)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.customer_name.localeCompare(b.customer_name);
      else if (sortField === 'balance') cmp = a.total_balance - b.total_balance;
      else if (sortField === 'invoices') cmp = a.open_invoice_count - b.open_invoice_count;
      else if (sortField === 'overdue') cmp = a.max_days_overdue - b.max_days_overdue;
      else if (sortField === 'invoiced') cmp = (a.invoiced_amount ?? 0) - (b.invoiced_amount ?? 0);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return list;
  })();

  const toggleCustomer = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(c => c.customer_id)));
  const deselectAll = () => setSelectedIds(new Set());

  const toggleExpand = (id: string) => {
    const newId = expandedId === id ? null : id;
    setExpandedId(newId);
    if (newId) {
      loadInvoicesForCustomer(newId);
    }
  };

  const handleToggleTestCustomers = (value: boolean) => {
    abortRef.current++;
    setSelectedIds(new Set());
    setSearch('');
    setInvoiceCache({});
    setShowTestCustomers(value);
  };

  return {
    customers: filtered,
    loading,
    loadingMore,
    totalLoaded,
    loadingInvoices,
    templates,
    selectedTemplateId,
    setSelectedTemplateId,
    excelTemplates,
    selectedExcelTemplateId,
    setSelectedExcelTemplateId,
    refreshExcelTemplates: loadExcelTemplates,
    saveEmailOverride,
    clearEmailOverride,
    selectedIds,
    toggleCustomer,
    selectAll,
    deselectAll,
    search,
    setSearch,
    minBalance,
    setMinBalance,
    period,
    setPeriod,
    onlyInvoiced,
    setOnlyInvoiced,
    minInvoicedAmount,
    setMinInvoicedAmount,
    activityLoading,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    expandedId,
    toggleExpand,
    showTestCustomers,
    toggleTestCustomers: handleToggleTestCustomers,
    ensureInvoicesLoaded,
  };
}
