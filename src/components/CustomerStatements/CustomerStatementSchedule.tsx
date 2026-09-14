import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrg } from '../../contexts/OrgContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  X, CalendarClock, Loader2, Play, Pause, Save, Mail, CheckCircle, Eye, AlertTriangle, Paperclip, FileText,
} from 'lucide-react';

const DAY_OPTIONS = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: ordinal(i + 1) })),
  { value: 31, label: 'Last day' },
];
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
const money = (n: number) => `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtDateTime = (s: string | null) => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

// Next occurrence of a day-of-month (31 = last day) from `from`, clamped per month.
function nextStatementDate(day: number, from = new Date()): Date {
  const clamp = (y: number, m1: number) => Math.min(day || 1, new Date(y, m1, 0).getDate());
  let y = from.getFullYear(), m1 = from.getMonth() + 1;
  let d = clamp(y, m1);
  if (from.getDate() > d) { m1++; if (m1 > 12) { m1 = 1; y++; } d = clamp(y, m1); }
  return new Date(y, m1 - 1, d);
}

interface Rule { id: string; scope: string; customer_ids: string[] | null; excluded_customer_ids: string[] | null; day_of_month: number; template_id: string | null; is_active: boolean; }
interface EmailLog {
  id: string; subject: string; sent_at: string | null; delivered_at: string | null; opened_at: string | null;
  open_count: number | null; bounced_at: string | null; bounce_reason: string | null; status: string | null;
  invoice_count: number | null; total_balance: number | null; had_pdf_attachment: boolean | null; template_name: string | null;
}

export default function CustomerStatementSchedule({ customerId, customerName, onClose }: { customerId: string; customerName: string; onClose: () => void }) {
  const { org } = useOrg();
  const { user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [allRule, setAllRule] = useState<Rule | null>(null);
  const [specific, setSpecific] = useState<Rule | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [dayDraft, setDayDraft] = useState<number>(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: rules }, { data: cfg }, { data: logRows }] = await Promise.all([
        supabase.from('statement_auto_send_rules').select('id, scope, customer_ids, excluded_customer_ids, day_of_month, template_id, is_active'),
        supabase.from('statement_auto_send_config').select('enabled').maybeSingle(),
        supabase.from('customer_email_logs')
          .select('id, subject, sent_at, delivered_at, opened_at, open_count, bounced_at, bounce_reason, status, invoice_count, total_balance, had_pdf_attachment, template_name')
          .eq('customer_id', customerId).order('sent_at', { ascending: false }).limit(50),
      ]);
      const all = (rules as Rule[] || []).find(r => r.scope === 'all') || null;
      const spec = (rules as Rule[] || []).find(r => r.scope === 'specific' && (r.customer_ids || []).includes(customerId)) || null;
      setAllRule(all); setSpecific(spec); setEnabled(!!(cfg as any)?.enabled);
      setLogs((logRows as EmailLog[]) || []);
      setDayDraft(spec?.day_of_month ?? all?.day_of_month ?? 1);
    } catch (e) { console.error('schedule load failed', e); }
    finally { setLoading(false); }
  }, [customerId]);
  useEffect(() => { load(); }, [load]);

  // Derived schedule state
  const isExcluded = !!allRule && (allRule.excluded_customer_ids || []).includes(customerId);
  const followsAll = !specific && !!allRule;
  const effectiveDay = specific?.day_of_month ?? allRule?.day_of_month ?? 1;
  const scheduled = specific ? specific.is_active : (followsAll ? (allRule!.is_active && !isExcluded) : false);
  const nextDate = scheduled ? nextStatementDate(effectiveDay) : null;

  const base = () => ({ organization_id: org?.id ?? null, created_by: user?.id ?? null, updated_at: new Date().toISOString() });

  const saveDay = async () => {
    setSaving(true);
    try {
      if (specific) {
        const { error } = await supabase.from('statement_auto_send_rules').update({ day_of_month: dayDraft, is_active: true, updated_at: new Date().toISOString() }).eq('id', specific.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('statement_auto_send_rules').insert({
          ...base(), scope: 'specific', name: customerName, customer_ids: [customerId], excluded_customer_ids: [],
          day_of_month: dayDraft, time_of_day: allRule?.day_of_month ? '09:00' : '09:00', template_id: allRule?.template_id ?? null,
          min_balance: 0, is_active: true,
        });
        if (error) throw error;
        // Following the 'all' rule before? make sure we're not also excluded.
        if (isExcluded) await supabase.from('statement_auto_send_rules').update({ excluded_customer_ids: (allRule!.excluded_customer_ids || []).filter(x => x !== customerId), updated_at: new Date().toISOString() }).eq('id', allRule!.id);
      }
      toast.success(`Statements set for the ${dayDraft === 31 ? 'last day' : ordinal(dayDraft)} of each month.`);
      await load();
    } catch (e: any) { toast.error('Could not save the schedule: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };

  const togglePause = async () => {
    setSaving(true);
    try {
      if (scheduled) {
        // Pause
        if (specific) {
          const { error } = await supabase.from('statement_auto_send_rules').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', specific.id);
          if (error) throw error;
        } else if (allRule) {
          const ex = Array.from(new Set([...(allRule.excluded_customer_ids || []), customerId]));
          const { error } = await supabase.from('statement_auto_send_rules').update({ excluded_customer_ids: ex, updated_at: new Date().toISOString() }).eq('id', allRule.id);
          if (error) throw error;
        }
        toast.success(`Paused — ${customerName} won't get statements until turned back on.`);
      } else {
        // Resume
        if (specific) {
          const { error } = await supabase.from('statement_auto_send_rules').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', specific.id);
          if (error) throw error;
        } else if (allRule && isExcluded) {
          const ex = (allRule.excluded_customer_ids || []).filter(x => x !== customerId);
          const { error } = await supabase.from('statement_auto_send_rules').update({ excluded_customer_ids: ex, updated_at: new Date().toISOString() }).eq('id', allRule.id);
          if (error) throw error;
        } else {
          // Not scheduled at all -> create an active per-customer rule.
          const { error } = await supabase.from('statement_auto_send_rules').insert({
            ...base(), scope: 'specific', name: customerName, customer_ids: [customerId], excluded_customer_ids: [],
            day_of_month: dayDraft, time_of_day: '09:00', template_id: allRule?.template_id ?? null, min_balance: 0, is_active: true,
          });
          if (error) throw error;
        }
        toast.success(`${customerName} will receive statements again.`);
      }
      await load();
    } catch (e: any) { toast.error('Could not update: ' + (e?.message || e)); }
    finally { setSaving(false); }
  };

  const logBadge = (l: EmailLog) => {
    if (l.bounced_at) return { text: 'Bounced', cls: 'bg-red-50 text-red-700', icon: <AlertTriangle className="w-3 h-3" /> };
    if (l.opened_at) return { text: `Opened${l.open_count ? ` ${l.open_count}×` : ''}`, cls: 'bg-emerald-50 text-emerald-700', icon: <Eye className="w-3 h-3" /> };
    if (l.delivered_at) return { text: 'Delivered', cls: 'bg-blue-50 text-blue-700', icon: <CheckCircle className="w-3 h-3" /> };
    return { text: l.status || 'Sent', cls: 'bg-gray-100 text-gray-600', icon: <Mail className="w-3 h-3" /> };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><CalendarClock className="w-4.5 h-4.5 text-blue-600" /></div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">Statements</h3>
              <p className="text-xs text-gray-500 truncate">{customerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : (
            <>
              {/* Status + next date */}
              <div className={`rounded-xl border p-4 ${scheduled ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${scheduled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {scheduled ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    {scheduled ? 'Receiving statements' : 'Paused'}
                  </span>
                  <button onClick={togglePause} disabled={saving}
                    className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 ${scheduled ? 'text-amber-700 bg-amber-100 hover:bg-amber-200' : 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'}`}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : scheduled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {scheduled ? 'Turn off' : 'Turn on'}
                  </button>
                </div>
                <p className="text-sm text-gray-700 mt-3">
                  {scheduled
                    ? <>Next statement: <span className="font-semibold">{nextDate ? fmtDate(nextDate.toISOString()) : '—'}</span></>
                    : <>No statements will be sent until turned back on.</>}
                </p>
                {!enabled && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Automatic sending is off globally — enable it on the Statements page (“Automatic”).</p>
                )}
              </div>

              {/* Edit day */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Send on</label>
                <div className="flex items-center gap-2">
                  <select value={dayDraft} onChange={e => setDayDraft(Number(e.target.value))}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-400">
                    {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} of the month</option>)}
                  </select>
                  <button onClick={saveDay} disabled={saving || dayDraft === effectiveDay}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  {specific ? 'This customer has its own schedule.' : followsAll ? `Following the default schedule (the ${allRule!.day_of_month === 31 ? 'last day' : ordinal(allRule!.day_of_month)}) — set a day here to override.` : 'No default schedule set — choose a day to schedule this customer.'}
                </p>
              </div>

              {/* Previous statements */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Previous statements ({logs.length})</h4>
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">No statements have been sent to this customer yet.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {logs.map(l => {
                      const b = logBadge(l);
                      const open = openLog === l.id;
                      return (
                        <div key={l.id}>
                          <button onClick={() => setOpenLog(open ? null : l.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50">
                            <FileText className="w-4 h-4 text-gray-300 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-800 truncate">{l.subject || 'Statement'}</p>
                              <p className="text-xs text-gray-400">{fmtDate(l.sent_at)}{l.invoice_count ? ` · ${l.invoice_count} inv` : ''}{l.total_balance ? ` · ${money(l.total_balance)}` : ''}</p>
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0 ${b.cls}`}>{b.icon}{b.text}</span>
                          </button>
                          {open && (
                            <div className="px-3 pb-3 pt-0 text-xs text-gray-600 space-y-1 bg-gray-50/60">
                              <div className="flex justify-between"><span className="text-gray-400">Sent</span><span>{fmtDateTime(l.sent_at)}</span></div>
                              {l.delivered_at && <div className="flex justify-between"><span className="text-gray-400">Delivered</span><span>{fmtDateTime(l.delivered_at)}</span></div>}
                              {l.opened_at && <div className="flex justify-between"><span className="text-gray-400">Opened</span><span>{fmtDateTime(l.opened_at)}{l.open_count ? ` (${l.open_count}×)` : ''}</span></div>}
                              {l.bounced_at && <div className="flex justify-between text-red-600"><span>Bounced</span><span>{l.bounce_reason || fmtDateTime(l.bounced_at)}</span></div>}
                              {l.template_name && <div className="flex justify-between"><span className="text-gray-400">Template</span><span>{l.template_name}</span></div>}
                              <div className="flex justify-between"><span className="text-gray-400">Attachment</span><span className="inline-flex items-center gap-1">{l.had_pdf_attachment ? <><Paperclip className="w-3 h-3" /> PDF</> : 'None'}</span></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
