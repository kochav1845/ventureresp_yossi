import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { StatementCustomer, StatementInvoice, ReportTemplate, SortField, SortOrder } from './types';

export function useCustomerStatements() {
  const [customers, setCustomers] = useState<StatementCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [minBalance, setMinBalance] = useState(0);
  const [sortField, setSortField] = useState<SortField>('balance');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTestCustomers, setShowTestCustomers] = useState(false);
  const [invoiceCache, setInvoiceCache] = useState<Record<string, StatementInvoice[]>>({});
  const [loadingInvoices, setLoadingInvoices] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const testLoadedRef = useRef(false);

  const loadData = useCallback(async (testMode: boolean) => {
    if (testMode && testLoadedRef.current) return;
    if (!testMode && loadedRef.current) return;
    if (testMode) testLoadedRef.current = true;
    else loadedRef.current = true;
    setLoading(true);

    try {
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase.rpc('get_customer_statements', {
          p_test_mode: testMode,
        }).range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const mapped: StatementCustomer[] = allData.map((row: any) => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name || row.customer_id,
        email: row.email || '',
        terms: row.terms || '',
        total_balance: Number(row.total_balance) || 0,
        credit_memo_balance: Number(row.credit_memo_balance) || 0,
        open_invoice_count: Number(row.open_invoice_count) || 0,
        max_days_overdue: Number(row.max_days_overdue) || 0,
        invoices: [],
      }));

      setCustomers(mapped);
    } catch (err) {
      console.error('Error loading customer statements data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const mapInvoices = (data: any[]): StatementInvoice[] => {
    const today = new Date();
    return data.map((inv: any) => {
      const dueDate = inv.due_date ? new Date(inv.due_date) : today;
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));
      return {
        reference_number: inv.reference_number,
        date: inv.date,
        due_date: inv.due_date,
        amount: Number(inv.dac_total) || 0,
        balance: Number(inv.balance) || 0,
        status: inv.status,
        description: inv.description || '',
        days_overdue: daysOverdue,
      };
    });
  };

  const loadInvoicesForCustomer = useCallback(async (customerId: string) => {
    if (invoiceCache[customerId]) return;
    setLoadingInvoices(customerId);

    try {
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, date, due_date, dac_total, balance, status, description, type')
        .eq('customer', customerId)
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

  const ensureInvoicesLoaded = useCallback(async (customerIds: string[]): Promise<void> => {
    const missing = customerIds.filter(id => !invoiceCache[id]);
    if (missing.length === 0) return;

    const batchSize = 20;
    const newCache: Record<string, StatementInvoice[]> = {};

    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('customer, reference_number, date, due_date, dac_total, balance, status, description, type')
        .in('customer', batch)
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

  useEffect(() => {
    loadData(showTestCustomers);
    loadTemplates();
  }, [loadData, loadTemplates, showTestCustomers]);

  const filtered = (() => {
    let list = customers.filter(c => c.total_balance >= minBalance);

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
    if (value) testLoadedRef.current = false;
    else loadedRef.current = false;
    setSelectedIds(new Set());
    setSearch('');
    setInvoiceCache({});
    setShowTestCustomers(value);
  };

  return {
    customers: filtered,
    loading,
    loadingInvoices,
    templates,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedIds,
    toggleCustomer,
    selectAll,
    deselectAll,
    search,
    setSearch,
    minBalance,
    setMinBalance,
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
