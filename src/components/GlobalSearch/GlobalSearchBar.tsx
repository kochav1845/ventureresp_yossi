import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FileText,
  Users,
  DollarSign,
  Ticket,
  UserCheck,
  X,
  Clock,
  ArrowRight,
  Command,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useGlobalSearch, SearchResult } from './useGlobalSearch';

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string; bgColor: string }> = {
  invoice: { label: 'Invoices', icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  customer: { label: 'Customers', icon: Users, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  payment: { label: 'Payments', icon: DollarSign, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  ticket: { label: 'Tickets', icon: Ticket, color: 'text-rose-600', bgColor: 'bg-rose-50' },
  collector: { label: 'Team', icon: UserCheck, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
};

export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const {
    query,
    setQuery,
    groupedResults,
    loading,
    isOpen,
    selectedIndex,
    setSelectedIndex,
    close,
    open,
    recentSearches,
    saveRecentSearch,
    clearRecentSearches,
    totalResults,
    results,
  } = useGlobalSearch();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        open();
      }
      if (e.key === 'Escape') {
        close();
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [close]);

  const handleSelect = useCallback((result: SearchResult) => {
    saveRecentSearch(query);
    close();

    const category = result.category;
    if (category === 'invoice') {
      navigate('/acumatica-invoices', { state: { searchQuery: result.title } });
    } else if (category === 'customer') {
      navigate('/acumatica-customers', { state: { searchQuery: result.subtitle || result.title } });
    } else if (category === 'payment') {
      navigate('/acumatica-payments', { state: { searchQuery: result.title } });
    } else if (category === 'ticket') {
      navigate('/collection-ticketing', { state: { searchQuery: result.title } });
    } else if (category === 'collector') {
      navigate('/collector-monitoring', { state: { searchQuery: result.title } });
    } else {
      navigate(result.route);
    }
  }, [navigate, saveRecentSearch, close, query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      }
    }
  }, [isOpen, selectedIndex, results, handleSelect, setSelectedIndex]);

  const handleRecentClick = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const showDropdown = isOpen && (focused || query.length > 0);
  const hasResults = totalResults > 0;
  const showRecent = query.length === 0 && recentSearches.length > 0;

  let globalIdx = -1;

  return (
    <div className="relative flex-1 max-w-2xl">
      <div className={`relative flex items-center transition-all duration-200 ${
        focused
          ? 'ring-2 ring-blue-500 ring-offset-1 shadow-lg'
          : 'shadow-sm hover:shadow-md'
      } rounded-xl bg-slate-50 border border-slate-200`}>
        <div className="pl-4 pr-2 flex items-center">
          {loading ? (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-slate-400" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); open(); }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search invoices, customers, payments, tickets..."
          className="flex-1 bg-transparent py-2.5 pr-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
        />
        <div className="flex items-center gap-1 pr-3">
          {query && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-0.5 text-[10px] text-slate-400 border border-slate-200 rounded-md px-1.5 py-0.5 bg-white">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden z-50 max-h-[480px] overflow-y-auto"
        >
          {showRecent && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Searches</span>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearRecentSearches}
                  className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>
              {recentSearches.map((term, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleRecentClick(term)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left group"
                >
                  <Clock className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                  <span className="text-sm text-slate-600 group-hover:text-slate-800">{term}</span>
                  <ArrowRight className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}

          {query.length > 0 && query.length < 2 && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Type at least 2 characters to search</p>
            </div>
          )}

          {query.length >= 2 && !loading && !hasResults && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No results for "<span className="font-medium text-slate-700">{query}</span>"</p>
              <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
            </div>
          )}

          {query.length >= 2 && loading && !hasResults && (
            <div className="px-4 py-8 text-center">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-500">Searching...</p>
            </div>
          )}

          {hasResults && Object.entries(groupedResults).map(([category, items]) => {
            const config = CATEGORY_CONFIG[category] || { label: category, icon: FileText, color: 'text-slate-600', bgColor: 'bg-slate-50' };
            const CategoryIcon = config.icon;

            return (
              <div key={category} className="border-b border-slate-100 last:border-b-0">
                <div className="px-4 py-2 flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${config.bgColor}`}>
                    <CategoryIcon className={`w-3 h-3 ${config.color}`} />
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">
                    {items.length}
                  </span>
                </div>

                {items.map((result) => {
                  globalIdx++;
                  const idx = globalIdx;
                  const isSelected = idx === selectedIndex;

                  return (
                    <button
                      key={result.item_id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                            {result.title}
                          </span>
                          {result.subtitle && (
                            <span className="text-xs text-slate-500 truncate">{result.subtitle}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{result.meta_line}</p>
                      </div>
                      <ArrowRight className={`w-3.5 h-3.5 mt-1 flex-shrink-0 transition-opacity ${
                        isSelected ? 'text-blue-500 opacity-100' : 'text-slate-300 opacity-0'
                      }`} />
                    </button>
                  );
                })}
              </div>
            );
          })}

          {hasResults && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{totalResults} results found</span>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px]">&uarr;&darr;</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px]">&crarr;</kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px]">Esc</kbd>
                  Close
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
