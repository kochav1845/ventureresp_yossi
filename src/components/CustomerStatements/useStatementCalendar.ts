import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// Per-day rollup shown on the statement calendar.
export interface DayStat {
  statements: number; // # of customers who get a statement that day
  invoices: number;   // total open invoices those statements cover
  amount: number;     // total $ going out that day
}

interface Rule {
  id: string;
  scope: 'all' | 'specific';
  customer_ids: string[] | null;
  excluded_customer_ids: string[] | null;
  day_of_month: number;
  min_balance: number | null;
  is_active: boolean;
}

interface UniCust { balance: number; invoices: number }

/**
 * Loads the statement auto-send schedule + the customer balance universe and
 * computes, for any visible month, how many statements go out each day (with the
 * invoices they cover and the $ total) -- mirroring process-statement-auto-send:
 *   - a rule fires on effectiveDay(day_of_month) (31 => last day of month)
 *   - scope 'specific' => its customer_ids
 *   - scope 'all'      => customers with balance >= min_balance, minus
 *                          excluded_customer_ids and any customer that has its
 *                          own 'specific' rule (a per-customer rule overrides all)
 */
export function useStatementCalendar(testMode: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [universe, setUniverse] = useState<Map<string, UniCust>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: cfg }, { data: rl }] = await Promise.all([
          supabase.from('statement_auto_send_config').select('enabled').maybeSingle(),
          supabase
            .from('statement_auto_send_rules')
            .select('id, scope, customer_ids, excluded_customer_ids, day_of_month, min_balance, is_active')
            .eq('is_active', true),
        ]);

        // Build the customer universe (balance + open-invoice count) from the same
        // RPC the list uses, paging until exhausted.
        const uni = new Map<string, UniCust>();
        const PAGE = 1000;
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .rpc('get_customer_statements', { p_test_mode: testMode })
            .range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          for (const r of data as any[]) {
            uni.set(r.customer_id, {
              balance: Number(r.total_balance) || 0,
              invoices: Number(r.open_invoice_count) || 0,
            });
          }
          if (data.length < PAGE) break;
        }

        if (cancelled) return;
        setEnabled(!!(cfg as any)?.enabled);
        setRules((rl || []) as Rule[]);
        setUniverse(uni);
      } catch (e) {
        console.error('useStatementCalendar load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [testMode]);

  // Customers that have their own 'specific' rule (excluded from the 'all' rule).
  const specificSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of rules) if (r.scope === 'specific') (r.customer_ids || []).forEach(c => s.add(c));
    return s;
  }, [rules]);

  const computeMonth = useCallback((year: number, month1: number): Map<string, DayStat> => {
    const lastDay = new Date(year, month1, 0).getDate();
    const byDay = new Map<string, Set<string>>();

    for (const r of rules) {
      const eff = Math.min(r.day_of_month || 1, lastDay);
      const key = `${year}-${String(month1).padStart(2, '0')}-${String(eff).padStart(2, '0')}`;

      let targets: string[];
      if (r.scope === 'specific') {
        targets = r.customer_ids || [];
      } else {
        const excl = new Set<string>([...(r.excluded_customer_ids || []), ...specificSet]);
        const minBal = Number(r.min_balance) || 0;
        targets = [];
        for (const [cid, u] of universe) {
          if (u.balance > 0 && u.balance >= minBal && !excl.has(cid)) targets.push(cid);
        }
      }

      if (!byDay.has(key)) byDay.set(key, new Set());
      const bucket = byDay.get(key)!;
      targets.forEach(c => bucket.add(c));
    }

    const out = new Map<string, DayStat>();
    for (const [key, custs] of byDay) {
      let invoices = 0, amount = 0;
      custs.forEach(c => {
        const u = universe.get(c);
        if (u) { invoices += u.invoices; amount += u.balance; }
      });
      out.set(key, { statements: custs.size, invoices, amount });
    }
    return out;
  }, [rules, universe, specificSet]);

  return { enabled, loading, computeMonth, ruleCount: rules.length };
}
