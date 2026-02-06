import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Mail, Send, Loader2, CheckCircle, AlertCircle, User, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  include_invoice_table: boolean;
  include_payment_table: boolean;
  include_pdf_attachment: boolean;
}

interface Customer {
  id: string;
  customer_name: string;
  customer_id: string;
  general_email: string | null;
  billing_email: string | null;
  balance: number;
}

interface TestTemplateEmailModalProps {
  template: Template;
  onClose: () => void;
}

export default function TestTemplateEmailModal({ template, onClose }: TestTemplateEmailModalProps) {
  const { profile } = useAuth();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [testEmail, setTestEmail] = useState(profile?.email || '');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchCustomers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCustomers([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('acumatica_customers')
        .select('id, customer_name, customer_id, general_email, billing_email, balance')
        .or(`customer_name.ilike.%${query}%,customer_id.ilike.%${query}%`)
        .order('customer_name')
        .limit(10);

      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Customer search error:', err);
      setCustomers([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    setShowDropdown(true);
    setSelectedCustomer(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCustomers(value), 250);
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.customer_name);
    setShowDropdown(false);
  };

  const handleSendTest = async () => {
    if (!selectedCustomer) return;
    if (!testEmail || !testEmail.includes('@')) {
      setResult({ type: 'error', message: 'Please enter a valid email address' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      setLoadingInvoices(true);
      const { data: invoices, error: invError } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, invoice_date, due_date, amount, balance, description')
        .eq('customer', selectedCustomer.customer_id)
        .gt('balance', 0)
        .order('due_date', { ascending: true });

      if (invError) throw invError;
      setLoadingInvoices(false);

      const invoiceList = invoices || [];
      const totalBalance = invoiceList.reduce((sum: number, inv: any) => sum + (inv.balance || 0), 0);
      const oldestDueDate = invoiceList.length > 0 ? invoiceList[0].due_date : null;
      const daysOverdue = oldestDueDate
        ? Math.max(0, Math.floor((Date.now() - new Date(oldestDueDate).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-customer-invoice-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateId: template.id,
            templateName: `[TEST] ${template.name}`,
            template: {
              subject: `[TEST] ${template.subject}`,
              body: template.body,
              include_invoice_table: template.include_invoice_table,
              include_payment_table: template.include_payment_table,
            },
            customerData: {
              customer_name: selectedCustomer.customer_name,
              customer_id: selectedCustomer.customer_id,
              customer_email: testEmail,
              balance: totalBalance || selectedCustomer.balance || 0,
              total_invoices: invoiceList.length,
              invoices: invoiceList,
              date_from: invoiceList.length > 0 ? invoiceList[invoiceList.length - 1].invoice_date : new Date().toISOString(),
              date_to: new Date().toISOString(),
              oldest_invoice_date: oldestDueDate,
              days_overdue: daysOverdue,
              payment_url: '',
            },
            sentByUserId: profile?.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send test email');
      }

      setResult({
        type: 'success',
        message: `Test email sent to ${testEmail} using data from ${selectedCustomer.customer_name}`,
      });
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Failed to send test email' });
    } finally {
      setSending(false);
      setLoadingInvoices(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Send className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Send Test Email</h2>
                <p className="text-sm text-blue-100">{template.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select Customer
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Choose a customer whose real data will populate the template
            </p>
            <div className={`flex items-center border rounded-xl px-3 py-2.5 transition-all ${
              showDropdown ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-300'
            }`}>
              <Search className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => handleCustomerSearchChange(e.target.value)}
                onFocus={() => customerSearch.length >= 2 && setShowDropdown(true)}
                placeholder="Search by customer name or ID..."
                className="flex-1 text-sm focus:outline-none"
              />
              {searching && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            </div>

            {showDropdown && customers.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => selectCustomer(customer)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b border-slate-100 last:border-0"
                  >
                    <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{customer.customer_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{customer.customer_id}</span>
                        {customer.general_email && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="truncate">{customer.general_email}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      ${customer.balance?.toLocaleString() || '0'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {showDropdown && customerSearch.length >= 2 && !searching && customers.length === 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center">
                <p className="text-sm text-slate-500">No customers found</p>
              </div>
            )}
          </div>

          {selectedCustomer && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-blue-900">{selectedCustomer.customer_name}</div>
                  <div className="text-xs text-blue-600">
                    {selectedCustomer.customer_id} -- Balance: ${selectedCustomer.balance?.toLocaleString() || '0'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerSearch('');
                  }}
                  className="p-1 hover:bg-blue-200 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-blue-500" />
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Send Test To
            </label>
            <p className="text-xs text-slate-500 mb-2">
              The test email will be delivered to this address instead of the customer
            </p>
            <div className="flex items-center border border-slate-300 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Mail className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Template Preview</span>
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-medium">Subject: </span>
              <span className="text-slate-500 font-mono text-xs">
                [TEST] {template.subject.replace(
                  /\{\{customer_name\}\}/g,
                  selectedCustomer?.customer_name || '{{customer_name}}'
                )}
              </span>
            </div>
            <div className="flex gap-2 mt-2">
              {template.include_invoice_table && (
                <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Invoice Table</span>
              )}
              {template.include_payment_table && (
                <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Payment Table</span>
              )}
              {template.include_pdf_attachment && (
                <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">PDF Attached</span>
              )}
            </div>
          </div>

          {result && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${
              result.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {result.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <p className="text-sm">{result.message}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSendTest}
            disabled={!selectedCustomer || !testEmail || sending}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingInvoices ? 'Loading data...' : 'Sending...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Test Email
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
