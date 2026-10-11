import { useEffect, useState } from 'react';
import { X, Save, PencilLine, Loader2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { createManualCustomer, nextManualKey } from '../../lib/manualRecords';

/**
 * Create a customer that only exists in this app. Acumatica never sees it and
 * the sync never touches it; it carries source='manual' so it is marked as
 * hand-entered everywhere.
 */
export default function AddCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (customerId: string, customerName: string) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [suggestedId, setSuggestedId] = useState('');

  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    email_address: '',
    phone1: '',
    phone2: '',
    address_line1: '',
    address_line2: '',
    city: '',
    billing_state: '',
    postal_code: '',
    country: 'US',
    customer_class: '',
    terms: '',
    credit_limit: '',
    parent_account: '',
    statement_cycle_id: '',
    days_from_invoice_threshold: '30',
    customer_status: 'Active',
    is_test_customer: false,
    manual_note: '',
  });

  // Show the key it will get, but let it be overridden.
  useEffect(() => {
    nextManualKey('customer')
      .then(setSuggestedId)
      .catch(() => setSuggestedId(''));
  }, []);

  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.customer_name.trim()) {
      toast.warning('Customer name is required');
      return;
    }
    setSaving(true);
    try {
      const created = await createManualCustomer({
        customer_id: form.customer_id.trim() || suggestedId || undefined,
        customer_name: form.customer_name,
        email_address: form.email_address,
        phone1: form.phone1,
        phone2: form.phone2,
        address_line1: form.address_line1,
        address_line2: form.address_line2,
        city: form.city,
        billing_state: form.billing_state,
        postal_code: form.postal_code,
        country: form.country,
        customer_class: form.customer_class,
        terms: form.terms,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        parent_account: form.parent_account,
        statement_cycle_id: form.statement_cycle_id,
        days_from_invoice_threshold: form.days_from_invoice_threshold
          ? Number(form.days_from_invoice_threshold)
          : 30,
        customer_status: form.customer_status,
        is_test_customer: form.is_test_customer,
        manual_note: form.manual_note,
      });

      toast.success(`Created ${created.customer_name} (${created.customer_id})`);
      onCreated?.(created.customer_id, created.customer_name);
      onClose();
    } catch (e: any) {
      console.error('Error creating manual customer:', e);
      toast.error(
        e?.code === '23505'
          ? 'That customer ID is already taken — pick another.'
          : 'Could not create the customer: ' + (e?.message || 'unknown error')
      );
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, props: any = {}) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        value={String(form[key] ?? '')}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
        {...props}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-violet-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <PencilLine className="w-5 h-5 text-violet-600" />
            <h2 className="font-bold text-gray-900">New Manual Customer</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800 rounded hover:bg-violet-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-5">
          <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
            This customer exists only in this app. It is tagged <strong>Manual</strong> everywhere,
            is never sent to Acumatica, and the sync will never overwrite or delete it.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Customer ID</label>
              <input
                value={form.customer_id}
                onChange={e => set('customer_id', e.target.value)}
                placeholder={suggestedId || 'auto'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Leave blank to use <span className="font-mono">{suggestedId || '…'}</span>. The{' '}
                <span className="font-mono">M-</span> prefix keeps it from ever clashing with an
                Acumatica account number.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.customer_name}
                onChange={e => set('customer_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {field('Email', 'email_address', { type: 'email' })}
              {field('Phone', 'phone1')}
              {field('Alt Phone', 'phone2')}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {field('Address Line 1', 'address_line1')}
              {field('Address Line 2', 'address_line2')}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {field('City', 'city')}
              {field('State', 'billing_state')}
              {field('Postal Code', 'postal_code')}
              {field('Country', 'country')}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Terms &amp; Classification</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {field('Customer Class', 'customer_class')}
              {field('Terms', 'terms', { placeholder: 'e.g. Net 30' })}
              {field('Credit Limit', 'credit_limit', { type: 'number', step: '0.01', min: '0' })}
              {field('Parent Account', 'parent_account')}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {field('Statement Cycle', 'statement_cycle_id')}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Red Threshold (days)</label>
                <input
                  type="number"
                  min="1"
                  value={form.days_from_invoice_threshold}
                  onChange={e => set('days_from_invoice_threshold', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={form.customer_status}
                  onChange={e => set('customer_status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Hold">Hold</option>
                  <option value="Credit Hold">Credit Hold</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Internal Note</label>
            <textarea
              value={form.manual_note}
              onChange={e => set('manual_note', e.target.value)}
              rows={2}
              placeholder="Why this customer is being tracked outside Acumatica…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <input
              type="checkbox"
              checked={form.is_test_customer}
              onChange={e => set('is_test_customer', e.target.checked)}
              className="mt-0.5 h-4 w-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
            />
            <span>
              <span className="font-medium">Mark as a test customer</span>
              <span className="block text-xs text-gray-500">
                Test customers are hidden from the Customers list and the Dashboard, and are
                excluded from the totals. Useful for trying things out.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.customer_name.trim()}
            className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}
