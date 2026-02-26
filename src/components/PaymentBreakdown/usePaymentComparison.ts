import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ComparisonState, FetchState, ComparisonResult, VerifyState } from './types';

function getMonthRange(monthKey: string): { startDate: string; endDate: string } {
  const [year, month] = monthKey.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

function jobDateToKey(startDate: string, endDate: string): string | null {
  const start = startDate.split('T')[0].split(' ')[0];
  const end = endDate.split('T')[0].split(' ')[0];

  if (start === end) return start;

  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (sy === ey && sd === 1) {
    const lastDay = new Date(ey, em, 0).getDate();
    if (end.endsWith(`-${String(lastDay).padStart(2, '0')}`)) {
      return `${sy}-${sm}`;
    }
  }
  return null;
}

export function usePaymentComparison(onDataRefresh?: () => void) {
  const [comparisons, setComparisons] = useState<Record<string, ComparisonState>>({});
  const [fetches, setFetches] = useState<Record<string, FetchState>>({});
  const [verifications, setVerifications] = useState<Record<string, VerifyState>>({});
  const pollingJobsRef = useRef<Set<string>>(new Set());

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

  const pollJobStatus = useCallback(async (jobId: string, key: string, startDate: string, endDate: string) => {
    if (pollingJobsRef.current.has(jobId)) return;
    pollingJobsRef.current.add(jobId);

    setFetches(prev => ({
      ...prev,
      [key]: { loading: true, error: null, result: prev[key]?.result || null }
    }));

    const maxAttempts = 180;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const { data: job } = await supabase
          .from('async_sync_jobs')
          .select('id, status, progress, error_message')
          .eq('id', jobId)
          .maybeSingle();

        if (!job) continue;

        if (job.status === 'completed') {
          const progress = job.progress || {};
          setFetches(prev => ({
            ...prev,
            [key]: { loading: false, error: null, result: { created: progress.created || 0, updated: progress.updated || 0 } }
          }));
          await runComparison(key, startDate, endDate);
          onDataRefresh?.();
          pollingJobsRef.current.delete(jobId);
          return;
        }

        if (job.status === 'failed') {
          setFetches(prev => ({
            ...prev,
            [key]: { loading: false, error: job.error_message || 'Sync failed', result: null }
          }));
          pollingJobsRef.current.delete(jobId);
          return;
        }
      } catch (err: any) {
        if (err.message && err.message !== 'Failed to fetch') {
          setFetches(prev => ({
            ...prev,
            [key]: { loading: false, error: err.message, result: null }
          }));
          pollingJobsRef.current.delete(jobId);
          return;
        }
      }
    }

    setFetches(prev => ({
      ...prev,
      [key]: { loading: false, error: 'Sync timed out after 9 minutes', result: null }
    }));
    pollingJobsRef.current.delete(jobId);
  }, [runComparison, onDataRefresh]);

  useEffect(() => {
    const checkRunningJobs = async () => {
      try {
        const { data: runningJobs } = await supabase
          .from('async_sync_jobs')
          .select('id, start_date, end_date, started_at')
          .eq('entity_type', 'payment')
          .in('status', ['running', 'pending'])
          .order('created_at', { ascending: false });

        if (!runningJobs || runningJobs.length === 0) return;

        for (const job of runningJobs) {
          const startedAt = new Date(job.started_at || job.created_at);
          const minutesAgo = (Date.now() - startedAt.getTime()) / 60000;

          if (minutesAgo > 10) {
            await supabase.from('async_sync_jobs').update({
              status: 'failed',
              error_message: 'Auto-expired: job ran too long',
              completed_at: new Date().toISOString()
            }).eq('id', job.id);
            continue;
          }

          const key = jobDateToKey(job.start_date, job.end_date);
          if (!key) continue;

          const sd = job.start_date.split('T')[0].split(' ')[0];
          const ed = job.end_date.split('T')[0].split(' ')[0];
          pollJobStatus(job.id, key, sd, ed);
        }
      } catch {
      }
    };

    checkRunningJobs();
  }, [pollJobStatus]);

  const runFetch = useCallback(async (key: string, startDate: string, endDate: string) => {
    if (fetches[key]?.loading) return;

    setFetches(prev => ({
      ...prev,
      [key]: { loading: true, error: null, result: null }
    }));

    try {
      const { data: existingJobs } = await supabase
        .from('async_sync_jobs')
        .select('id, status, created_at')
        .eq('entity_type', 'payment')
        .in('status', ['running', 'pending'])
        .gte('start_date', `${startDate}T00:00:00+00`)
        .lte('end_date', `${endDate}T23:59:59+00`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingJobs && existingJobs.length > 0) {
        const existingJob = existingJobs[0];
        const minutesAgo = (Date.now() - new Date(existingJob.created_at).getTime()) / 60000;

        if (minutesAgo < 10) {
          pollJobStatus(existingJob.id, key, startDate, endDate);
          return;
        }

        await supabase.from('async_sync_jobs').update({
          status: 'failed',
          error_message: 'Auto-expired: job ran too long',
          completed_at: new Date().toISOString()
        }).eq('id', existingJob.id);
      }

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

      if (data.async && data.jobId) {
        pollJobStatus(data.jobId, key, startDate, endDate);
        return;
      }

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
  }, [runComparison, onDataRefresh, pollJobStatus, fetches]);

  const fetchMonth = useCallback((monthKey: string) => {
    const { startDate, endDate } = getMonthRange(monthKey);
    return runFetch(monthKey, startDate, endDate);
  }, [runFetch]);

  const fetchDay = useCallback((dateKey: string) => {
    return runFetch(dateKey, dateKey, dateKey);
  }, [runFetch]);

  const runVerify = useCallback(async (key: string, startDate: string, endDate: string, fix: boolean) => {
    setVerifications(prev => ({
      ...prev,
      [key]: { loading: true, error: null, result: null }
    }));

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment-dates`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ startDate, endDate, fix }),
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Verification failed');

      setVerifications(prev => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          result: {
            acumaticaCount: data.acumaticaCount,
            dbCount: data.dbCount,
            inAcumaticaNotDb: data.inAcumaticaNotDb,
            inDbNotAcumatica: data.inDbNotAcumatica,
            stalePayments: data.stalePayments || [],
            fixedPayments: data.fixedPayments || [],
          }
        }
      }));

      if (fix && data.fixedPayments?.length > 0) {
        await runComparison(key, startDate, endDate);
        onDataRefresh?.();
      }
    } catch (err: any) {
      setVerifications(prev => ({
        ...prev,
        [key]: { loading: false, error: err.message, result: null }
      }));
    }
  }, [runComparison, onDataRefresh]);

  const verifyMonth = useCallback((monthKey: string, fix = false) => {
    const { startDate, endDate } = getMonthRange(monthKey);
    return runVerify(monthKey, startDate, endDate, fix);
  }, [runVerify]);

  const verifyDay = useCallback((dateKey: string, fix = false) => {
    return runVerify(dateKey, dateKey, dateKey, fix);
  }, [runVerify]);

  return {
    comparisons,
    fetches,
    verifications,
    compareMonth,
    compareDay,
    fetchMonth,
    fetchDay,
    verifyMonth,
    verifyDay,
  };
}
