import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ComparisonState, FetchState, ComparisonResult } from './types';

function getMonthRange(monthKey: string): { startDate: string; endDate: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

export function usePaymentComparison(onDataRefresh?: () => void) {
  const [comparisons, setComparisons] = useState<Record<string, ComparisonState>>({});
  const [fetches, setFetches] = useState<Record<string, FetchState>>({});

  const runComparison = useCallback(async (key: string, startDate: string, endDate: string) => {
    setComparisons(prev => ({
      ...prev,
      [key]: { loading: true, error: null, result: null }
    }));

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-get-payment-count`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          dateFrom: `${startDate}T00:00:00`,
          dateTo: `${endDate}T23:59:59`,
        }),
      });

      const acumaticaData = await response.json();
      if (!acumaticaData.success) throw new Error(acumaticaData.error || 'Failed to get Acumatica count');

      const { count: dbCount, error: dbError } = await supabase
        .from('acumatica_payments')
        .select('*', { count: 'exact', head: true })
        .gte('application_date', `${startDate}T00:00:00`)
        .lte('application_date', `${endDate}T23:59:59`)
        .neq('type', 'Credit Memo');

      if (dbError) throw new Error(dbError.message);

      const result: ComparisonResult = {
        acumaticaCount: acumaticaData.count,
        dbCount: dbCount || 0,
        difference: acumaticaData.count - (dbCount || 0),
      };

      setComparisons(prev => ({
        ...prev,
        [key]: { loading: false, error: null, result }
      }));
    } catch (err: any) {
      setComparisons(prev => ({
        ...prev,
        [key]: { loading: false, error: err.message, result: null }
      }));
    }
  }, []);

  const compareMonth = useCallback((monthKey: string) => {
    const { startDate, endDate } = getMonthRange(monthKey);
    return runComparison(monthKey, startDate, endDate);
  }, [runComparison]);

  const compareDay = useCallback((dateKey: string) => {
    return runComparison(dateKey, dateKey, dateKey);
  }, [runComparison]);

  const runFetch = useCallback(async (key: string, startDate: string, endDate: string) => {
    setFetches(prev => ({
      ...prev,
      [key]: { loading: true, error: null, result: null }
    }));

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-payment-date-range-sync`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ startDate, endDate }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Sync failed');

      setFetches(prev => ({
        ...prev,
        [key]: { loading: false, error: null, result: { created: data.created || 0, updated: data.updated || 0 } }
      }));

      await runComparison(key, startDate, endDate);
      onDataRefresh?.();
    } catch (err: any) {
      setFetches(prev => ({
        ...prev,
        [key]: { loading: false, error: err.message, result: null }
      }));
    }
  }, [runComparison, onDataRefresh]);

  const fetchMonth = useCallback((monthKey: string) => {
    const { startDate, endDate } = getMonthRange(monthKey);
    return runFetch(monthKey, startDate, endDate);
  }, [runFetch]);

  const fetchDay = useCallback((dateKey: string) => {
    return runFetch(dateKey, dateKey, dateKey);
  }, [runFetch]);

  return {
    comparisons,
    fetches,
    compareMonth,
    compareDay,
    fetchMonth,
    fetchDay,
  };
}
