import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  Settings, X, Plus, Trash2, Save, Loader2, Check, Star, Pencil, ArrowLeft,
  ChevronUp, ChevronDown, Download, FileSpreadsheet,
} from 'lucide-react';
import {
  DEFAULT_EXCEL_LAYOUT,
  CUSTOMER_FIELD_DEFS,
  normalizeExcelLayout,
  generateCustomerStatementExcel,
  downloadExcelFile,
  type StatementExcelLayout,
  type StatementCustomerData,
} from '../../lib/statementExport';
import type { StatementExcelTemplate } from './types';

// Sample data used for the live preview and the sample download.
const SAMPLE_CUSTOMER: StatementCustomerData = {
  customer_id: 'CUST-001',
  customer_name: 'Sample Customer Inc.',
  email: 'billing@samplecustomer.com',
  terms: 'NET 30',
  total_balance: 3250.5,
  credit_memo_balance: 0,
  open_invoice_count: 3,
  max_days_overdue: 45,
  invoices: [
    { reference_number: 'INV-10231', date: '2026-06-15', due_date: '2026-07-15', amount: 1200, balance: 1200, status: 'Open', description: 'Monthly supplies', days_overdue: 45, type: 'Invoice' },
    { reference_number: 'INV-10307', date: '2026-07-20', due_date: '2026-08-19', amount: 1850.5, balance: 1850.5, status: 'Open', description: 'Equipment rental', days_overdue: 10, type: 'Invoice' },
    { reference_number: 'INV-10390', date: '2026-08-10', due_date: '2026-09-09', amount: 200, balance: 200, status: 'Open', description: 'Service call', days_overdue: 0, type: 'Invoice' },
  ],
};

interface Props {
  open: boolean;
  onClose: () => void;
  templates: StatementExcelTemplate[];
  onTemplatesChanged: () => void;
}

type EditorState = {
  id: string | null; // null = new template
  name: string;
  is_default: boolean;
  layout: StatementExcelLayout;
};

export default function ExcelTemplateSettings({ open, onClose, templates, onTemplatesChanged }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setEditor(null); setSavedAt(null); }
  }, [open]);

  if (!open) return null;

  const openNew = () => setEditor({
    id: null,
    name: '',
    is_default: templates.length === 0,
    layout: JSON.parse(JSON.stringify(DEFAULT_EXCEL_LAYOUT)),
  });

  const openEdit = (t: StatementExcelTemplate) => setEditor({
    id: t.id,
    name: t.name,
    is_default: t.is_default,
    layout: normalizeExcelLayout(JSON.parse(JSON.stringify(t.layout))),
  });

  const friendlyError = (e: any) => {
    const msg = e?.message || String(e);
    if (msg.includes('statement_excel_templates') || e?.code === '42P01') {
      return 'The statement_excel_templates table does not exist yet.\n\nRun the migration SQL (supabase/migrations/..._create_statement_excel_templates.sql) in the Supabase SQL editor, then try again.';
    }
    return msg;
  };

  const handleSave = async () => {
    if (!editor) return;
    if (!editor.name.trim()) { toast.warning('Please give the template a name.'); return; }
    if (!editor.layout.columns.some(c => c.enabled)) { toast.warning('Enable at least one invoice column.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: editor.name.trim(),
        layout: editor.layout,
        is_default: editor.is_default,
        updated_at: new Date().toISOString(),
      };
      if (editor.id) {
        const { error } = await supabase.from('statement_excel_templates').update(payload).eq('id', editor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('statement_excel_templates')
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
      setSavedAt(Date.now());
      setEditor(null);
      onTemplatesChanged();
    } catch (e: any) {
      console.error('Error saving excel template:', e);
      toast.error('Could not save the Excel template: ' + friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: StatementExcelTemplate) => {
    if (!window.confirm(`Delete the Excel template "${t.name}"?\n\nStatements will fall back to the default layout.`)) return;
    setDeletingId(t.id);
    try {
      const { error } = await supabase.from('statement_excel_templates').delete().eq('id', t.id);
      if (error) throw error;
      onTemplatesChanged();
    } catch (e: any) {
      toast.error('Could not delete the template: ' + friendlyError(e));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (t: StatementExcelTemplate) => {
    try {
      const { error } = await supabase.from('statement_excel_templates')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', t.id);
      if (error) throw error;
      onTemplatesChanged();
    } catch (e: any) {
      toast.error('Could not set the default template: ' + friendlyError(e));
    }
  };

  const patchLayout = (patch: Partial<StatementExcelLayout>) =>
    setEditor(ed => ed ? { ...ed, layout: { ...ed.layout, ...patch } } : ed);

  const toggleCustomerField = (key: string) => {
    if (!editor) return;
    const fields = editor.layout.customer_fields;
    patchLayout({
      customer_fields: fields.includes(key)
        ? fields.filter(f => f !== key)
        // Keep the block in its canonical order when re-enabling a field.
        : CUSTOMER_FIELD_DEFS.map(d => d.key).filter(k => k === key || fields.includes(k)),
    });
  };

  const patchColumn = (idx: number, patch: Partial<{ label: string; enabled: boolean }>) => {
    if (!editor) return;
    patchLayout({ columns: editor.layout.columns.map((c, i) => i === idx ? { ...c, ...patch } : c) });
  };

  const moveColumn = (idx: number, dir: -1 | 1) => {
    if (!editor) return;
    const cols = [...editor.layout.columns];
    const j = idx + dir;
    if (j < 0 || j >= cols.length) return;
    [cols[idx], cols[j]] = [cols[j], cols[idx]];
    patchLayout({ columns: cols });
  };

  const downloadSample = () => {
    if (!editor) return;
    const data = generateCustomerStatementExcel(SAMPLE_CUSTOMER, editor.layout);
    downloadExcelFile(data, 'Statement_Template_Sample.xlsx');
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {editor ? (
              <button onClick={() => setEditor(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <ArrowLeft size={16} className="text-gray-500" />
              </button>
            ) : (
              <div className="p-1.5 rounded-lg bg-slate-100"><Settings size={16} className="text-slate-600" /></div>
            )}
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {editor ? (editor.id ? 'Edit Excel Template' : 'New Excel Template') : 'Statement Excel Templates'}
              </h2>
              <p className="text-[11px] text-gray-500">
                {editor
                  ? 'Design how the attached Excel statement looks.'
                  : 'Templates control the Excel sheet attached to each statement.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button>
        </div>

        {/* Body */}
        {!editor ? (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <button
              onClick={openNew}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <Plus size={16} /> New Excel Template
            </button>

            {templates.length === 0 && (
              <div className="text-center py-10">
                <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No Excel templates yet.</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Statements currently use the built-in default layout. Create a template to customize it.
                </p>
              </div>
            )}

            {templates.map(t => {
              const enabledCols = t.layout.columns.filter(c => c.enabled);
              return (
                <div key={t.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate">{t.name}</span>
                      {t.is_default && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-semibold text-amber-700">
                          <Star size={10} /> Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!t.is_default && (
                        <button onClick={() => handleSetDefault(t)} title="Make default"
                          className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50">
                          <Star size={15} />
                        </button>
                      )}
                      <button onClick={() => openEdit(t)} title="Edit"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(t)} title="Delete" disabled={deletingId === t.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                        {deletingId === t.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5 truncate">
                    Title: “{t.layout.title || '—'}” · {enabledCols.length} column{enabledCols.length !== 1 ? 's' : ''}
                    {t.layout.show_aging_summary ? ' · aging summary' : ''}
                    {t.layout.show_total_row ? ' · total row' : ''}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Name + default */}
            <div className="space-y-3">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Template name
                <input value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })}
                  placeholder="e.g. Standard Statement"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={editor.is_default}
                  onChange={e => setEditor({ ...editor, is_default: e.target.checked })}
                  className="rounded accent-amber-500" />
                Use as the default template for statements
              </label>
            </div>

            {/* Sheet basics */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <span className="text-sm font-semibold text-gray-900">Sheet</span>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Title
                <input value={editor.layout.title} onChange={e => patchLayout({ title: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
                <span className="block mt-1 text-[10px] font-normal normal-case text-gray-400">
                  Placeholders: {'{{customer_name}}'}, {'{{customer_id}}'}, {'{{date}}'}
                </span>
              </label>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sheet tab name
                <input value={editor.layout.sheet_name} maxLength={31}
                  onChange={e => patchLayout({ sheet_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
              </label>
            </div>

            {/* Customer info block */}
            <div className="rounded-xl border border-gray-200 p-4">
              <span className="text-sm font-semibold text-gray-900">Customer info block</span>
              <p className="text-[11px] text-gray-500 mb-2">Lines shown at the top of the sheet.</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {CUSTOMER_FIELD_DEFS.map(f => (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={editor.layout.customer_fields.includes(f.key)}
                      onChange={() => toggleCustomerField(f.key)} className="rounded accent-blue-600" />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Sections */}
            <div className="rounded-xl border border-gray-200 p-4 space-y-2">
              <span className="text-sm font-semibold text-gray-900">Sections</span>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={editor.layout.show_aging_summary}
                  onChange={e => patchLayout({ show_aging_summary: e.target.checked })} className="rounded accent-blue-600" />
                Aging summary (Current / 1-30 / 31-60 / 61-90 / 90+)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={editor.layout.show_total_row}
                  onChange={e => patchLayout({ show_total_row: e.target.checked })} className="rounded accent-blue-600" />
                TOTAL row under the invoice list
              </label>
            </div>

            {/* Invoice columns */}
            <div className="rounded-xl border border-gray-200 p-4">
              <span className="text-sm font-semibold text-gray-900">Invoice columns</span>
              <p className="text-[11px] text-gray-500 mb-2">Check the columns to include, rename them, and reorder with the arrows.</p>
              <div className="space-y-1.5">
                {editor.layout.columns.map((c, idx) => (
                  <div key={c.key} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${c.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
                    <input type="checkbox" checked={c.enabled}
                      onChange={e => patchColumn(idx, { enabled: e.target.checked })}
                      className="rounded accent-blue-600 flex-shrink-0" />
                    <input value={c.label} disabled={!c.enabled}
                      onChange={e => patchColumn(idx, { label: e.target.value })}
                      className="flex-1 min-w-0 px-2 py-1 border border-transparent hover:border-gray-200 focus:border-gray-200 rounded text-sm bg-transparent disabled:text-gray-400 focus:ring-1 focus:ring-blue-300" />
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide flex-shrink-0 hidden sm:inline">{c.key.replace(/_/g, ' ')}</span>
                    <button onClick={() => moveColumn(idx, -1)} disabled={idx === 0}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 flex-shrink-0"><ChevronUp size={14} /></button>
                    <button onClick={() => moveColumn(idx, 1)} disabled={idx === editor.layout.columns.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 flex-shrink-0"><ChevronDown size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">Preview</span>
                <button onClick={downloadSample}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium">
                  <Download size={13} /> Download sample .xlsx
                </button>
              </div>
              <SheetPreview layout={editor.layout} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-[11px] text-emerald-600 font-medium">
            {savedAt && !editor ? <span className="inline-flex items-center gap-1"><Check size={12} /> Saved</span> : ''}
          </span>
          {editor ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditor(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          ) : (
            <button onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

// A lightweight spreadsheet-style rendering of the layout with sample data.
function SheetPreview({ layout }: { layout: StatementExcelLayout }) {
  const c = SAMPLE_CUSTOMER;
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const money = (n: number) => n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
  const fieldValue: Record<string, string> = {
    customer_name: c.customer_name,
    customer_id: c.customer_id,
    email: c.email,
    terms: c.terms,
    statement_date: today,
    total_balance: money(c.total_balance),
  };
  const cellValue = (inv: typeof c.invoices[number], key: string): string => {
    switch (key) {
      case 'reference_number': return inv.reference_number;
      case 'date': return new Date(inv.date).toLocaleDateString('en-US');
      case 'due_date': return new Date(inv.due_date).toLocaleDateString('en-US');
      case 'description': return inv.description;
      case 'amount': return money(inv.amount);
      case 'balance': return money(inv.balance);
      case 'days_overdue': return String(inv.days_overdue);
      case 'aging': return inv.days_overdue <= 0 ? 'Current' : inv.days_overdue <= 30 ? '1-30' : '31-60';
      case 'type': return inv.type;
      case 'status': return inv.status;
      default: return '';
    }
  };
  const title = layout.title
    .replace(/\{\{customer_name\}\}/g, c.customer_name)
    .replace(/\{\{customer_id\}\}/g, c.customer_id)
    .replace(/\{\{date\}\}/g, today);
  const cols = layout.columns.filter(col => col.enabled);
  const total = c.invoices.reduce((s, i) => s + i.balance, 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
      <div className="min-w-max p-3 font-mono text-[11px] leading-5 text-gray-800">
        {layout.title.trim() && <div className="font-bold text-[13px] mb-2">{title}</div>}
        {layout.customer_fields.length > 0 && (
          <div className="mb-2">
            {layout.customer_fields.map(key => {
              const def = CUSTOMER_FIELD_DEFS.find(d => d.key === key);
              if (!def) return null;
              return (
                <div key={key} className="grid grid-cols-[140px_1fr]">
                  <span className="text-gray-500">{def.label}:</span>
                  <span>{fieldValue[key]}</span>
                </div>
              );
            })}
          </div>
        )}
        {layout.show_aging_summary && (
          <div className="mb-2">
            <div className="font-bold">Aging Summary</div>
            <table className="border-collapse">
              <tbody>
                <tr>
                  {['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'].map(h => (
                    <td key={h} className="border border-gray-200 bg-gray-50 px-2 py-0.5 font-semibold">{h}</td>
                  ))}
                </tr>
                <tr>
                  {[money(200), money(1850.5), money(1200), money(0), money(0), money(total)].map((v, i) => (
                    <td key={i} className="border border-gray-200 px-2 py-0.5 text-right">{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="font-bold mb-0.5">Open Invoices</div>
        <table className="border-collapse">
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col.key} className="border border-gray-200 bg-gray-50 px-2 py-0.5 text-left font-semibold">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.invoices.map(inv => (
              <tr key={inv.reference_number}>
                {cols.map(col => (
                  <td key={col.key} className="border border-gray-200 px-2 py-0.5">{cellValue(inv, col.key)}</td>
                ))}
              </tr>
            ))}
            {layout.show_total_row && (
              <tr>
                {cols.map((col, i) => {
                  const balanceIdx = cols.findIndex(x => x.key === 'balance');
                  const valueIdx = balanceIdx >= 0 ? balanceIdx : Math.max(cols.length - 1, 1);
                  const labelIdx = Math.max(valueIdx - 1, 0);
                  return (
                    <td key={col.key} className="border border-gray-200 px-2 py-0.5 font-bold">
                      {i === valueIdx ? money(total) : i === labelIdx ? 'TOTAL:' : ''}
                    </td>
                  );
                })}
              </tr>
            )}
            {cols.length === 0 && (
              <tr><td className="px-2 py-1 text-gray-400 italic">No columns enabled</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
