import { useEffect, useState } from 'react';
import { X, Save, PencilLine, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { createManualInvoice, nextManualKey, InvoiceDocType } from '../../lib/manualRecords';
import {
  DueDateReminderPlan,
  DEFAULT_REMINDER_PLAN,
  createDueDateReminders,
} from '../../lib/dueDateReminders';
import DueDateReminders from '../DueDateReminders';

/**
 * Add an invoice / credit memo / debit memo by hand against any customer —
 * manual or synced. It lands in acumatica_invoices with source='manual', so it
 * counts towards balances, aging, statements and tickets like any other, and
 * the sync's orphan cleanup leaves it alone.
 */
export default function AddInvoiceModal({
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
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [suggestedRef, setSuggestedRef] = useState('');
  const [reminderPlan, setReminderPlan] = useState<DueDateReminderPlan>({ ...DEFAULT_REMINDER_PLAN });

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    reference_number: '',
    type: 'Invoice' as InvoiceDocType,
    status: 'Open',
    date: today,
    due_date: '',
    amount: '',
    balance: '',
    description: '',
    terms: '',
    po_number: '',
    note: '',
  });

  useEffect(() => {
    nextManualKey('invoice').then(setSuggestedRef).catch(() => setSuggestedRef(''));
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Default the due date to 30 days after the invoice date. Overdue is measured
  // from the due date across the app, so leaving it blank makes an invoice age
  // from its invoice date instead.
  useEffect(() => {
    if (!form.date || form.due_date) return;
    const d = new Date(form.date + 'T00:00:00');
    d.setDate(d.getDate() + 30);
    set('due_date', d.toISOString().slice(0, 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  const amountNum = Number(form.amount) || 0;
  const balanceNum = form.balance === '' ? amountNum : Number(form.balance) || 0;

  const handleSave = async () => {
    if (!amountNum) {
      toast.warning('Enter an amount');
      return;
    }
    if (balanceNum > amountNum + 0.005) {
      toast.warning('Balance cannot be more than the amount');
      return;
    }
    setSaving(true);
    try {
      const created = await createManualInvoice({
        reference_number: form.reference_number.trim() || suggestedRef || undefined,
        type: form.type,
        customer: customerId,
        customer_name: customerName,
        status: form.status,
        date: form.date,
        due_date: form.due_date || null,
        amount: amountNum,
        balance: balanceNum,
        description: form.description,
        terms: form.terms,
        po_number: form.po_number,
        note: form.note,
      });
      // Schedule the "before it's due" reminders against the new invoice.
      // A failure here must not make the saved invoice look like it failed.
      let reminderNote = '';
      if (reminderPlan.enabled && form.due_date && profile?.id) {
        try {
          const { created: n, skippedPast } = await createDueDateReminders({
            plan: reminderPlan,
            dueDate: form.due_date,
            userId: profile.id,
            title: `${form.type} ${created.reference_number} due — ${customerName}`,
            invoiceId: created.id,
            invoiceReference: created.reference_number,
            reminderType: 'payment',
          });
          reminderNote = n ? ` · ${n} reminder${n === 1 ? '' : 's'} set` : '';
          if (skippedPast.length && !n) {
            toast.warning('The invoice was added, but every reminder lead time had already passed.');
          }
        } catch (re: any) {
          console.error('Error scheduling due-date reminders:', re);
          toast.warning('Invoice added, but the reminders could not be scheduled: ' + (re?.message || ''));
        }
      }

      toast.success(`Added ${created.type} ${created.reference_number}${reminderNote}`);
      onCreated?.();
      onClose();
    } catch (e: any) {
      console.error('Error creating manual invoice:', e);
      toast.error(
        e?.code === '23505'
          ? 'That reference number already exists for this document type.'
          : 'Could not add the invoice: ' + (e?.message || 'unknown error')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-violet-50 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <PencilLine className="w-5 h-5 text-violet-600 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 leading-tight">Add Invoice by Hand</h2>
              <p className="text-xs text-gray-600 truncate">{customerName} · {customerId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded hover:bg-violet-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500"
              >
                <option value="Invoice">Invoice</option>
                <option value="Credit Memo">Credit Memo</option>
                <option value="Debit Memo">Debit Memo</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Reference Number</label>
              <input
                value={form.reference_number}
                onChange={e => set('reference_number', e.target.value)}
                placeholder={suggestedRef || 'auto'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Blank uses <span className="font-mono">{suggestedRef || '…'}</span>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <input type="number" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Open Balance</label>
              <input type="number" step="0.01" value={form.balance} onChange={e => set('balance', e.target.value)}
                placeholder={amountNum ? amountNum.toFixed(2) : '0.00'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-violet-500" />
              <p className="text-[10px] text-gray-500 mt-1">Blank = full amount still owed.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500"
              >
                <option value="Open">Open</option>
                <option value="Balanced">Balanced</option>
                <option value="Closed">Closed</option>
                <option value="Credit Hold">Credit Hold</option>
                <option value="Voided">Voided</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Terms</label>
              <input value={form.terms} onChange={e => set('terms', e.target.value)} placeholder="e.g. Net 30"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">PO / Customer Order #</label>
              <input value={form.po_number} onChange={e => set('po_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500" />
          </div>

          <DueDateReminders
            dueDate={form.due_date}
            plan={reminderPlan}
            onChange={setReminderPlan}
            label="Remind me before this invoice is due"
          />

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-violet-500" />
          </div>

          {balanceNum > 0 && (
            <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              This will add <strong>${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>{' '}
              to {customerName}'s open balance and show up in aging, statements and ticket filters,
              tagged <strong>Manual</strong>.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !amountNum}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Adding…' : 'Add Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
