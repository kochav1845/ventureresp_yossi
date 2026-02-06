import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export interface SearchResult {
  category: string;
  item_id: string;
  title: string;
  subtitle: string;
  meta_line: string;
  route: string;
  relevance: number;
}

const RECENT_SEARCHES_KEY = 'global_search_recent';
const MAX_RECENT = 5;
const MAX_PER_CATEGORY = 6;

async function searchInvoices(pattern: string): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('acumatica_invoices')
    .select('id, reference_number, customer_name, type, amount, balance, status')
    .or(`reference_number.ilike.%${pattern}%,customer_name.ilike.%${pattern}%,customer.ilike.%${pattern}%`)
    .limit(MAX_PER_CATEGORY);

  if (!data) return [];
  return data.map(i => ({
    category: 'invoice',
    item_id: i.id,
    title: i.reference_number || '',
    subtitle: i.customer_name || '',
    meta_line: `${i.type || ''} | $${i.amount ?? 0} | Bal: $${i.balance ?? 0} | ${i.status || ''}`,
    route: '/invoices',
    relevance: (i.reference_number || '').toLowerCase().startsWith(pattern.toLowerCase()) ? 0.95 : 0.7,
  }));
}

async function searchCustomers(pattern: string): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('acumatica_customers')
    .select('id, customer_name, customer_id, customer_class, general_email, balance')
    .or(`customer_name.ilike.%${pattern}%,customer_id.ilike.%${pattern}%,general_email.ilike.%${pattern}%`)
    .limit(MAX_PER_CATEGORY);

  if (!data) return [];
  return data.map(c => ({
    category: 'customer',
    item_id: c.id,
    title: c.customer_name || '',
    subtitle: c.customer_id || '',
    meta_line: `${c.customer_class || ''} | ${c.general_email || ''} | Bal: $${c.balance ?? 0}`,
    route: '/customers',
    relevance: (c.customer_name || '').toLowerCase().startsWith(pattern.toLowerCase()) ? 0.95 : 0.7,
  }));
}

async function searchPayments(pattern: string): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('acumatica_payments')
    .select('id, reference_number, customer_name, customer_id, type, payment_amount, payment_method, status')
    .or(`reference_number.ilike.%${pattern}%,customer_name.ilike.%${pattern}%,payment_ref.ilike.%${pattern}%`)
    .limit(MAX_PER_CATEGORY);

  if (!data) return [];
  return data.map(p => ({
    category: 'payment',
    item_id: p.id,
    title: p.reference_number || '',
    subtitle: p.customer_name || p.customer_id || '',
    meta_line: `${p.type || ''} | $${p.payment_amount ?? 0} | ${p.payment_method || ''} | ${p.status || ''}`,
    route: '/payments',
    relevance: (p.reference_number || '').toLowerCase().startsWith(pattern.toLowerCase()) ? 0.95 : 0.7,
  }));
}

async function searchTickets(pattern: string): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('collection_tickets')
    .select('id, ticket_number, customer_name, ticket_type, priority, status')
    .or(`ticket_number.ilike.%${pattern}%,customer_name.ilike.%${pattern}%`)
    .limit(MAX_PER_CATEGORY);

  if (!data) return [];
  return data.map(t => ({
    category: 'ticket',
    item_id: t.id,
    title: t.ticket_number || '',
    subtitle: t.customer_name || '',
    meta_line: `${t.ticket_type || ''} | ${t.priority || ''} | ${t.status || ''}`,
    route: '/tickets',
    relevance: (t.ticket_number || '').toLowerCase().startsWith(pattern.toLowerCase()) ? 0.95 : 0.7,
  }));
}

async function searchUsers(pattern: string): Promise<SearchResult[]> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, role, account_status')
    .or(`full_name.ilike.%${pattern}%,email.ilike.%${pattern}%`)
    .limit(MAX_PER_CATEGORY);

  if (!data) return [];
  return data.map(u => ({
    category: 'collector',
    item_id: u.id,
    title: u.full_name || '',
    subtitle: u.email || '',
    meta_line: `${u.role || ''} | ${u.account_status || ''}`,
    route: '/admin',
    relevance: (u.full_name || '').toLowerCase().startsWith(pattern.toLowerCase()) ? 0.95 : 0.7,
  }));
}

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchIdRef = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    setRecentSearches(prev => {
      const updated = [trimmed, ...prev.filter(s => s !== trimmed)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const currentId = ++searchIdRef.current;
    setLoading(true);

    try {
      const [invoices, customers, payments, tickets, users] = await Promise.all([
        searchInvoices(trimmed).catch(() => [] as SearchResult[]),
        searchCustomers(trimmed).catch(() => [] as SearchResult[]),
        searchPayments(trimmed).catch(() => [] as SearchResult[]),
        searchTickets(trimmed).catch(() => [] as SearchResult[]),
        searchUsers(trimmed).catch(() => [] as SearchResult[]),
      ]);

      if (currentId !== searchIdRef.current) return;

      const combined = [...invoices, ...customers, ...payments, ...tickets, ...users];
      combined.sort((a, b) => b.relevance - a.relevance);
      setResults(combined);
      setSelectedIndex(-1);
    } catch (err: any) {
      if (currentId === searchIdRef.current) {
        console.error('Search error:', err);
        setResults([]);
      }
    } finally {
      if (currentId === searchIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 400);
  }, [performSearch]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(-1);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.category]) acc[result.category] = [];
    acc[result.category].push(result);
    return acc;
  }, {});

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    results,
    groupedResults,
    loading,
    isOpen,
    setIsOpen,
    selectedIndex,
    setSelectedIndex,
    close,
    open,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
    totalResults: results.length,
  };
}
