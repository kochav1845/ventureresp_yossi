import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../contexts/OrgContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  Zap, X, Plus, Trash2, Search, Save, Users, UserMinus, CalendarClock, Loader2, Check, AlertTriangle,
} from 'lucide-react';
import type { StatementCustomer, ReportTemplate } from './types';

// A "day of month" select — 1..28 plus "Last" (stored as 31; the sender clamps to
// the real month length).
const DAY_OPTIONS: { value: number; label: string }[] = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) })),
  { value: 31, label: 'Last day' },
];

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type AllRule = {
  id?: string;
  is_active: boolean;
  day_of_month: number;
  time_of_day: string;
  template_id: string | null;
  excluded_customer_ids: string[];
  min_balance: number;
};

type CustomerRule = {
  id?: string;
  customer_id: string;
  day_of_month: number;
  time_of_day: string;
  template_id: string | null;
  is_active: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
  customers: StatementCustomer[];
  templates: ReportTemplate[];
  defaultTemplateId: string | null;
}

export default function AutoStatementsSidebar({ open, onClose, customers, templates, defaultTemplateId }: Props) {
  const { org } = useOrg();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [allRule, setAllRule] = useState<AllRule>({
    is_active: false, day_of_month: 1, time_of_day: '09:00',
    template_id: defaultTemplateId, excluded_customer_ids: [], min_balance: 0,
  });
  const [customerRules, setCustomerRules] = useState<CustomerRule[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const [excludeSearch, setExcludeSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach(c => m.set(c.customer_id, c.customer_name));
    return (id: string) => m.get(id) || id;
  }, [customers]);

  // Load the org's saved rules whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('statement_auto_send_rules')
          .select('*')
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const rows = data || [];
        const all = rows.find((r: any) => r.scope === 'all');
        setAllRule(all ? {
          id: all.id,
          is_active: all.is_active,
          day_of_month: all.day_of_month ?? 1,
          time_of_day: (all.time_of_day || '09:00').slice(0, 5),
          template_id: all.template_id ?? defaultTemplateId,
          excluded_customer_ids: all.excluded_customer_ids || [],
          min_balance: Number(all.min_balance) || 0,
        } : {
          is_active: false, day_of_month: 1, time_of_day: '09:00',
          template_id: defaultTemplateId, excluded_customer_ids: [], min_balance: 0,
        });
        setCustomerRules(rows.filter((r: any) => r.scope === 'specific').map((r: any) => ({
          id: r.id,
          customer_id: (r.customer_ids || [])[0] || '',
          day_of_month: r.day_of_month ?? 1,
          time_of_day: (r.time_of_day || '09:00').slice(0, 5),
          template_id: r.template_id ?? defaultTemplateId,
          is_active: r.is_active,
        })).filter((r: CustomerRule) => r.customer_id));
        setRemovedIds([]);
      } catch (e) {
        console.error('Error loading auto-statement rules:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, defaultTemplateId]);

  const addExcluded = (id: string) => setAllRule(r => r.excluded_customer_ids.includes(id) ? r : { ...r, excluded_customer_ids: [...r.excluded_customer_ids, id] });
  const removeExcluded = (id: string) => setAllRule(r => ({ ...r, excluded_customer_ids: r.excluded_customer_ids.filter(x => x !== id) }));

  const addCustomerRule = (id: string) => {
    if (customerRules.some(r => r.customer_id === id)) return;
    setCustomerRules(prev => [...prev, {
      customer_id: id, day_of_month: allRule.day_of_month, time_of_day: allRule.time_of_day,
      template_id: allRule.template_id, is_active: true,
    }]);
  };
  const updateCustomerRule = (idx: number, patch: Partial<CustomerRule>) =>
    setCustomerRules(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const removeCustomerRule = (idx: number) =>
    setCustomerRules(prev => {
      const r = prev[idx];
      if (r.id) setRemovedIds(ids => [...ids, r.id!]);
      return prev.filter((_, i) => i !== idx);
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      const orgId = org?.id ?? null;
      const base = { organization_id: orgId, created_by: user?.id ?? null, updated_at: new Date().toISOString() };

      // 1. Upsert the global "all" rule.
      const allPayload = {
        ...base,
        scope: 'all',
        name: 'All customers',
        customer_ids: [],
        excluded_customer_ids: allRule.excluded_customer_ids,
        day_of_month: allRule.day_of_month,
        time_of_day: allRule.time_of_day,
        template_id: allRule.template_id,
        min_balance: allRule.min_balance,
        is_active: allRule.is_active,
      };
      if (allRule.id) {
        const { error } = await supabase.from('statement_auto_send_rules').update(allPayload).eq('id', allRule.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('statement_auto_send_rules').insert(allPayload).select('id').single();
        if (error) throw error;
        if (data) setAllRule(r => ({ ...r, id: data.id }));
      }

      // 2. Delete removed per-customer rules.
      if (removedIds.length) {
        const { error } = await supabase.from('statement_auto_send_rules').delete().in('id', removedIds);
        if (error) throw error;
        setRemovedIds([]);
      }

      // 3. Upsert per-customer rules.
      for (const r of customerRules) {
        const payload = {
          ...base,
          scope: 'specific',
          name: nameOf(r.customer_id),
          customer_ids: [r.customer_id],
          excluded_customer_ids: [],
          day_of_month: r.day_of_month,
          time_of_day: r.time_of_day,
          template_id: r.template_id,
          is_active: r.is_active,
        };
        if (r.id) {
          const { error } = await supabase.from('statement_auto_send_rules').update(payload).eq('id', r.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from('statement_auto_send_rules').insert(payload).select('id').single();
          if (error) throw error;
          r.id = data?.id;
        }
      }
      setCustomerRules(prev => [...prev]);
      setSavedAt(Date.now());
    } catch (e: any) {
      console.error('Error saving auto-statement rules:', e);
      alert('Could not save automatic statement settings:\n\n' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const excludedSet = new Set(allRule.excluded_customer_ids);
  const ruledSet = new Set(customerRules.map(r => r.customer_id));

  const excludeMatches = excludeSearch.trim().length >= 2
    ? customers.filter(c => !excludedSet.has(c.customer_id) &&
        (c.customer_name.toLowerCase().includes(excludeSearch.toLowerCase()) || c.customer_id.toLowerCase().includes(excludeSearch.toLowerCase()))).slice(0, 8)
    : [];
  const addMatches = addSearch.trim().length >= 2
    ? customers.filter(c => !ruledSet.has(c.customer_id) &&
        (c.customer_name.toLowerCase().includes(addSearch.toLowerCase()) || c.customer_id.toLowerCase().includes(addSearch.toLowerCase()))).slice(0, 8)
    : [];

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-50"><Zap size={16} className="text-amber-500" /></div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Automatic Statements</h2>
              <p className="text-[11px] text-gray-500">Schedule statements to send on their own.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Not-yet-live notice */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Rules are saved here and use the same email sender as manual statements. Scheduled
                delivery is switched on separately — nothing sends automatically until that's activated.
              </p>
            </div>

            {/* Send to everyone */}
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-blue-600" />
                  <span className="text-sm font-semibold text-gray-900">Send to everyone</span>
                </div>
                <button role="switch" aria-checked={allRule.is_active}
                  onClick={() => setAllRule(r => ({ ...r, is_active: !r.is_active }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${allRule.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${allRule.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mb-3">Every customer with a balance gets a statement on the same day — except any you exclude or give their own day below.</p>

              <div className={allRule.is_active ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Day of month
                    <select value={allRule.day_of_month} onChange={e => setAllRule(r => ({ ...r, day_of_month: Number(e.target.value) }))}
                      className="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                      {DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Time
                    <input type="time" value={allRule.time_of_day} onChange={e => setAllRule(r => ({ ...r, time_of_day: e.target.value }))}
                      className="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                  </label>
                </div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Template
                  <select value={allRule.template_id || ''} onChange={e => setAllRule(r => ({ ...r, template_id: e.target.value || null }))}
                    className="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>)}
                  </select>
                </label>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Only if balance is at least
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input type="number" value={allRule.min_balance || ''} onChange={e => setAllRule(r => ({ ...r, min_balance: Number(e.target.value) || 0 }))}
                      placeholder="0" className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
                  </div>
                </label>

                {/* Exclusions */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1"><UserMinus size={13} className="text-amber-600" /><span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Exclude customers</span></div>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                    <input value={excludeSearch} onChange={e => setExcludeSearch(e.target.value)} placeholder="Search a customer to exclude…"
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400" />
                    {excludeMatches.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                        {excludeMatches.map(c => (
                          <button key={c.customer_id} onClick={() => { addExcluded(c.customer_id); setExcludeSearch(''); }}
                            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-amber-50 border-b border-gray-50 last:border-0">
                            <span className="truncate"><span className="font-medium text-gray-800">{c.customer_name}</span> <span className="text-gray-400 text-xs">{c.customer_id}</span></span>
                            <Plus size={13} className="text-amber-600 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allRule.excluded_customer_ids.length === 0 && <span className="text-[11px] text-gray-400">No one excluded.</span>}
                    {allRule.excluded_customer_ids.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
                        {nameOf(id)}
                        <button onClick={() => removeExcluded(id)} className="hover:text-amber-950"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-customer schedule */}
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1"><CalendarClock size={15} className="text-emerald-600" /><span className="text-sm font-semibold text-gray-900">Per-customer days</span></div>
              <p className="text-[11px] text-gray-500 mb-3">Give specific customers their own send day. This overrides the global schedule for them.</p>

              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Add a customer…"
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400" />
                {addMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    {addMatches.map(c => (
                      <button key={c.customer_id} onClick={() => { addCustomerRule(c.customer_id); setAddSearch(''); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-emerald-50 border-b border-gray-50 last:border-0">
                        <span className="truncate"><span className="font-medium text-gray-800">{c.customer_name}</span> <span className="text-gray-400 text-xs">{c.customer_id}</span></span>
                        <Plus size={13} className="text-emerald-600 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {customerRules.length === 0 && <p className="text-[11px] text-gray-400">No per-customer schedules yet.</p>}
                {customerRules.map((r, idx) => (
                  <div key={r.id || r.customer_id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{nameOf(r.customer_id)}</p>
                      <p className="text-[10px] text-gray-400">{r.customer_id}</p>
                    </div>
                    <select value={r.day_of_month} onChange={e => updateCustomerRule(idx, { day_of_month: Number(e.target.value) })}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                      {DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                    <button role="switch" aria-checked={r.is_active} title={r.is_active ? 'Active' : 'Paused'}
                      onClick={() => updateCustomerRule(idx, { is_active: !r.is_active })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${r.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${r.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={() => removeCustomerRule(idx)} className="p-1 text-gray-400 hover:text-red-600 flex-shrink-0"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-[11px] text-emerald-600 font-medium">
            {savedAt ? <span className="inline-flex items-center gap-1"><Check size={12} /> Saved</span> : ''}
          </span>
          <button onClick={handleSave} disabled={saving || loading}
            className="flex items-center gap-1.5 px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
