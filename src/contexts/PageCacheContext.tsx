import { createContext, useContext, useRef, useCallback } from 'react';

interface PageCacheStore {
  [pageKey: string]: {
    data: Record<string, any>;
    timestamp: number;
  };
}

interface PageCacheContextValue {
  getCache: (pageKey: string) => Record<string, any> | null;
  setCache: (pageKey: string, data: Record<string, any>) => void;
  clearCache: (pageKey: string) => void;
}

const PageCacheContext = createContext<PageCacheContextValue>({
  getCache: () => null,
  setCache: () => {},
  clearCache: () => {},
});

const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function PageCacheProvider({ children }: { children: React.ReactNode }) {
  const store = useRef<PageCacheStore>({});

  const getCache = useCallback((pageKey: string) => {
    const entry = store.current[pageKey];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MAX_AGE_MS) {
      delete store.current[pageKey];
      return null;
    }
    return entry.data;
  }, []);

  const setCache = useCallback((pageKey: string, data: Record<string, any>) => {
    store.current[pageKey] = { data, timestamp: Date.now() };
  }, []);

  const clearCache = useCallback((pageKey: string) => {
    delete store.current[pageKey];
  }, []);

  return (
    <PageCacheContext.Provider value={{ getCache, setCache, clearCache }}>
      {children}
    </PageCacheContext.Provider>
  );
}

export function usePageCache(pageKey: string) {
  const { getCache, setCache, clearCache } = useContext(PageCacheContext);

  const getCachedState = useCallback(() => {
    return getCache(pageKey);
  }, [getCache, pageKey]);

  const setCachedState = useCallback((data: Record<string, any>) => {
    setCache(pageKey, data);
  }, [setCache, pageKey]);

  const clearCachedState = useCallback(() => {
    clearCache(pageKey);
  }, [clearCache, pageKey]);

  return { getCachedState, setCachedState, clearCachedState };
}
