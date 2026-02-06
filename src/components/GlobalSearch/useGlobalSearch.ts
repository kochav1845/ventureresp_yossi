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

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('global_search', {
        search_query: trimmed,
        max_per_category: 6
      });

      if (error) throw error;
      setResults(data || []);
      setSelectedIndex(-1);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Search error:', err);
        setResults([]);
      }
    } finally {
      setLoading(false);
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

  const flatResults = results;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    results: flatResults,
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
