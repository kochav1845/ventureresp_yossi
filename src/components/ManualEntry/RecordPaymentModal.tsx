import { useEffect, useMemo, useState } from 'react';
import { X, Save, PencilLine, Loader2, Upload, Trash2, FileImage } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { formatDate } from '../../lib/dateUtils';
import { createManualPayment, nextManualKey, CheckUpload } from '../../lib/manualRecords';

interface OpenInvoice {
  id: string;
  reference_number: string;
  type: string;
  date: string;
  due_date: string | null;
  balance: number;
  source: string | null;
}

/**
 * Record a payment by hand and attach its cheque images. Writes the same three
 * things the Acumatica payment sync does — acumatica_payments,
 * payment_attachments (is_check_image) and payment_invoice_applications — so
 * the cheque opens from the Payments screen exactly like a synced one.
 */
export default function RecordPaymentModal({
  customerId,
  customerName,
  onClose,
  onCreated,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [suggestedRef, setSuggestedRef] = useState('');
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<CheckUpload[]>([]);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    reference_number: '',
    type: 'Payment',
    application_date: today,
    payment_amount: '',
    payment_method: 'CHECK',
    payment_ref: '',
    description: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    nextManualKey('payment').then(setSuggestedRef).catch(() => setSuggestedRef(''));
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingInvoices(true);
      try {
        const { data, error } = await supabase
          .from('acumatica_invoices')
          .select('id, reference_number, type, date, due_date, balance, source')
          .eq('customer', customerId)
          .in('type', ['Invoice', 'Debit Memo'])
          .in('status', ['Open', 'Balanced', 'Credit Hold'])
          .gt('balance', 0)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(500);
        if (error) throw error;
        setOpenInvoices((data || []) as OpenInvoice[]);
      } catch (e) {
        console.error('Error loading open invoices:', e);
      } finally {
        setLoadingInvoices(false);
      }
    })();
  }, [customerId]);

  const amountNum = Number(form.payment_amount) || 0;
  const appliedTotal = useMemo(
    () => Object.values(applied).reduce((s, v) => s + (Number(v) || 0), 0),
    [applied]
  );
  const unapplied = amountNum - appliedTotal;
  const overApplied = appliedTotal > amountNum + 0.005;

  const key = (inv: OpenInvoice) => `${inv.type}::${inv.reference_number}`;

  /** Walk the oldest invoices first and spend the payment across them. */
  const autoApply = () => {
    let left = amountNum;
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (left <= 0.004) break;
      const take = Math.min(left, Number(inv.balance) || 0);
      if (take > 0) {
        next[key(inv)] = take.toFixed(2);
        left -= take;
      }
    }
    setApplied(next);
  };

  const addFiles = (files: FileList | null, side: 'front' | 'back' | null) => {
    if (!files?.length) return;
    setChecks(prev => [...prev, ...Array.from(files).map(file => ({ file, side }))]);
  };

  const handleSave = async () => {
    if (!amountNum) {
      toast.warning('Enter the payment amount');
      return;
    }
    if (overApplied) {
      toast.warning('You have applied more than the payment amount');
      return;
    }
    setSaving(true);
    try {
      const applications = openInvoices
        .filter(inv => Number(applied[key(inv)]) > 0)
        .map(inv => ({
          reference_number: inv.reference_number,
          type: inv.type,
          amount: Number(applied[key(inv)]),
        }));

      await createManualPayment(
        {
          reference_number: form.reference_number.trim() || suggestedRef || undefined,
          type: form.type,
          customer_id: customerId,
          customer_name: customerName,
          application_date: form.application_date,
          payment_amount: amountNum,
          payment_method: form.payment_method,
          payment_ref: form.payment_ref,
          description: form.description,
          applications,
        },
        checks
      );

      toast.success(
        applications.length
          ? `Payment recorded and applied to ${applications.length} invoice(s)`
          : 'Payment recorded'
      );
      onCreated?.();
      onClose();
    } catch (e: any) {
      console.error('Error recording manual payment:', e);
      toast.error('Could not record the payment: ' + (e?.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const money = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-violet-50 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <PencilLine className="w-5 h-5 text-violet-600 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 leading-tight">Record Payment / Upload Check</h2>
              <p className="text-xs text-gray-600 truncate">{customerName} · {customerId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded hover:bg-violet-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500">
                <option value="Payment">Payment</option>
                <option value="Prepayment">Prepayment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={form.application_date} onChange={e => set('application_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.01" value={form.payment_amount}
                onChange={e => set('payment_amount', e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Check #</label>
              <input value={form.payment_ref} onChange={e => set('payment_ref', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
              <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500">
                <option value="CHECK">Check</option>
                <option value="ACH">ACH</option>
                <option value="WIRE">Wire</option>
                <option value="CC">Credit Card</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Reference</label>
              <input value={form.reference_number} onChange={e => set('reference_number', e.target.value)}
                placeholder={suggestedRef || 'auto'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
          </div>

          {/* ── cheque images ─────────────────────────────────────────────── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Check Images</h3>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 border border-violet-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-violet-200">
                <Upload className="w-3.5 h-3.5" /> Add front
                <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                  onChange={e => { addFiles(e.target.files, 'front'); e.currentTarget.value = ''; }} />
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 border border-violet-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-violet-200">
                <Upload className="w-3.5 h-3.5" /> Add back
                <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                  onChange={e => { addFiles(e.target.files, 'back'); e.currentTarget.value = ''; }} />
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-200">
                <Upload className="w-3.5 h-3.5" /> Other document
                <input type="file" accept="image/*,application/pdf" multiple className="hidden"
                  onChange={e => { addFiles(e.target.files, null); e.currentTarget.value = ''; }} />
              </label>
            </div>

            {checks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {checks.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                    <FileImage className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    <span className="flex-1 truncate text-gray-800">{c.file.name}</span>
                    {c.side && (
                      <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded text-[10px] font-semibold uppercase">
                        {c.side}
                      </span>
                    )}
                    <span className="text-gray-400">{(c.file.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setChecks(prev => prev.filter((_, j) => j !== i))}
                      className="p-0.5 text-red-500 hover:bg-red-50 rounded" title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── apply to invoices ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Apply to Invoices {openInvoices.length > 0 && `(${openInvoices.length} open)`}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={autoApply} disabled={!amountNum || !openInvoices.length}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 border border-blue-300 rounded hover:bg-blue-200 disabled:opacity-40 font-medium">
                  Auto-apply oldest first
                </button>
                <button onClick={() => setApplied({})}
                  className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100">
                  Clear
                </button>
              </div>
            </div>

            {loadingInvoices ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading open invoices…
              </div>
            ) : openInvoices.length === 0 ? (
              <p className="text-xs text-gray-500 py-2">
                No open invoices. The payment will be recorded as an unapplied credit.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
                {openInvoices.map(inv => (
                  <div key={inv.id} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-gray-50">
                    <span className="font-mono font-medium text-gray-900 w-28 truncate" title={inv.reference_number}>
                      {inv.reference_number}
                    </span>
                    {inv.source === 'manual' && (
                      <span className="px-1 bg-violet-100 text-violet-700 rounded text-[9px] font-bold uppercase">M</span>
                    )}
                    <span className="text-gray-500 w-20">{inv.type}</span>
                    <span className="text-gray-500 w-24">Due {formatDate(inv.due_date)}</span>
                    <span className="flex-1 text-right text-red-600 font-semibold">{money(Number(inv.balance))}</span>
                    <input
                      type="number" step="0.01" min="0" max={Number(inv.balance)}
                      value={applied[key(inv)] ?? ''}
                      onChange={e => setApplied(p => ({ ...p, [key(inv)]: e.target.value }))}
                      placeholder="0.00"
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                ))}
              </div>
            )}

            {amountNum > 0 && (
              <div className={`mt-2 flex items-center justify-between text-xs px-3 py-2 rounded-lg border ${
                overApplied
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
              }`}>
                <span>Applied <strong>{money(appliedTotal)}</strong> of {money(amountNum)}</span>
                <span>
                  {overApplied
                    ? `Over by ${money(appliedTotal - amountNum)}`
                    : `Unapplied ${money(unapplied)}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !amountNum || overApplied}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
