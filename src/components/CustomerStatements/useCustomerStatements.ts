import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { StatementCustomer, ReportTemplate, SortField, SortOrder } from './types';

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
  const loadedRef = useRef(false);
  const testLoadedRef = useRef(false);

  const buildCustomerMap = (allInvoices: any[], allCustomers: any[]) => {
    const custInfoMap = new Map(
      allCustomers.map((c: any) => [c.customer_id, {
        name: c.customer_name,
        email: c.billing_email || c.general_email || '',
        terms: c.terms || '',
      }])
    );

    const today = new Date();
    const custMap = new Map<string, StatementCustomer>();

    allCustomers.forEach((c: any) => {
      custMap.set(c.customer_id, {
        customer_id: c.customer_id,
        customer_name: c.customer_name || c.customer_id,
        email: c.billing_email || c.general_email || '',
        terms: c.terms || '',
        total_balance: 0,
        credit_memo_balance: 0,
        open_invoice_count: 0,
        max_days_overdue: 0,
        invoices: [],
      });
    });

    allInvoices.forEach((inv: any) => {
      const custId = inv.customer;
      const info = custInfoMap.get(custId);

      if (!custMap.has(custId)) {
        custMap.set(custId, {
          customer_id: custId,
          customer_name: info?.name || custId,
          email: info?.email || '',
          terms: info?.terms || '',
          total_balance: 0,
          credit_memo_balance: 0,
          open_invoice_count: 0,
          max_days_overdue: 0,
          invoices: [],
        });
      }

      const customer = custMap.get(custId)!;
      const balance = Number(inv.balance) || 0;
      const dueDate = inv.due_date ? new Date(inv.due_date) : today;
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));
      const invType = inv.type || 'Invoice';
      const isCreditType = invType === 'Credit Memo' || invType === 'Credit WO';

      if (isCreditType && balance > 0) {
        customer.credit_memo_balance += balance;
      }

      if (balance > 0 && !isCreditType && inv.status !== 'Voided') {
        customer.total_balance += balance;
        customer.open_invoice_count++;
        if (daysOverdue > customer.max_days_overdue) {
          customer.max_days_overdue = daysOverdue;
        }
      }

      if (balance > 0 && inv.status !== 'Voided') {
        customer.invoices.push({
          reference_number: inv.reference_number,
          date: inv.date,
          due_date: inv.due_date,
          amount: Number(inv.dac_total) || 0,
          balance,
          status: inv.status,
          description: inv.description || '',
          days_overdue: daysOverdue,
        });
      }
    });

    return custMap;
  };

  const fetchPaginated = async (table: string, select: string, filters?: Record<string, any>) => {
    let all: any[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      from += pageSize;
      if (data.length < pageSize) break;
    }
    return all;
  };

  const fetchInvoicesForCustomers = async (customerIds: string[]) => {
    const all: any[] = [];
    const batchSize = 50;
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('acumatica_invoices')
          .select('id, customer, reference_number, date, due_date, dac_total, balance, status, description, type')
          .in('customer', batch)
          .gt('balance', 0)
          .neq('status', 'Voided')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        from += pageSize;
        if (data.length < pageSize) break;
      }
    }
    return all;
  };

  const loadData = useCallback(async (testMode: boolean) => {
    if (testMode && testLoadedRef.current) return;
    if (!testMode && loadedRef.current) return;
    if (testMode) testLoadedRef.current = true;
    else loadedRef.current = true;
    setLoading(true);

    try {
      const customerFilter = testMode
        ? { is_test_customer: true }
        : { is_test_customer: false };

      const allCustomers = await fetchPaginated(
        'acumatica_customers',
        'customer_id, customer_name, billing_email, general_email, terms',
        customerFilter
      );

      const customerIds = allCustomers.map((c: any) => c.customer_id);
      const filteredInvoices = await fetchInvoicesForCustomers(customerIds);
      const custMap = buildCustomerMap(filteredInvoices, allCustomers);

      if (testMode) {
        setCustomers(Array.from(custMap.values()));
      } else {
        setCustomers(Array.from(custMap.values()).filter(c => c.total_balance > 0));
      }
    } catch (err) {
      console.error('Error loading customer statements data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const handleToggleTestCustomers = (value: boolean) => {
    if (value) testLoadedRef.current = false;
    else loadedRef.current = false;
    setSelectedIds(new Set());
    setSearch('');
    setShowTestCustomers(value);
  };

  return {
    customers: filtered,
    loading,
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
  };
}
