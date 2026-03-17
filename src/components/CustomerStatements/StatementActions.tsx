import { useState } from 'react';
import { FileSpreadsheet, Mail, Download, Send, X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  generateCustomerStatementExcel,
  generateBatchStatementExcel,
  uint8ArrayToBase64,
  downloadExcelFile,
} from '../../lib/statementExport';
import type { StatementCustomer, ReportTemplate } from './types';

interface Props {
  selectedCustomers: StatementCustomer[];
  templates: ReportTemplate[];
  selectedTemplateId: string | null;
  onTemplateChange: (id: string) => void;
  ensureInvoicesLoaded: (customerIds: string[]) => Promise<void>;
}

type ActionMode = null | 'download' | 'email';

interface EmailProgress {
  customer: string;
  status: 'pending' | 'sending' | 'success' | 'failed';
  error?: string;
}

export default function StatementActions({ selectedCustomers, templates, selectedTemplateId, onTemplateChange, ensureInvoicesLoaded }: Props) {
  const { profile } = useAuth();
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [sending, setSending] = useState(false);
  const [emailProgress, setEmailProgress] = useState<EmailProgress[]>([]);
  const [downloadType, setDownloadType] = useState<'individual' | 'combined'>('combined');

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const customersWithEmail = selectedCustomers.filter(c => c.email);

  const [preparingData, setPreparingData] = useState(false);

  const handleDownload = async () => {
    if (selectedCustomers.length === 0) return;

    setPreparingData(true);
    try {
      await ensureInvoicesLoaded(selectedCustomers.map(c => c.customer_id));
    } catch (err) {
      console.error('Error loading invoice data:', err);
    } finally {
      setPreparingData(false);
    }

    if (downloadType === 'combined') {
      const data = generateBatchStatementExcel(selectedCustomers);
      downloadExcelFile(data, `Customer_Statements_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      selectedCustomers.forEach(customer => {
        const data = generateCustomerStatementExcel(customer);
        const safeName = customer.customer_name.replace(/[^a-zA-Z0-9]/g, '_');
        downloadExcelFile(data, `Statement_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`);
      });
    }
    setActionMode(null);
  };

  const handleSendEmails = async () => {
    if (!selectedTemplate || customersWithEmail.length === 0) return;

    setSending(true);
    try {
      await ensureInvoicesLoaded(customersWithEmail.map(c => c.customer_id));
    } catch (err) {
      console.error('Error loading invoice data:', err);
    }
    const progress: EmailProgress[] = customersWithEmail.map(c => ({
      customer: c.customer_name,
      status: 'pending',
    }));
    setEmailProgress([...progress]);

    for (let i = 0; i < customersWithEmail.length; i++) {
      const customer = customersWithEmail[i];
      progress[i].status = 'sending';
      setEmailProgress([...progress]);

      try {
        const excelData = generateCustomerStatementExcel(customer);
        const base64 = uint8ArrayToBase64(excelData);

        const oldestInvoice = customer.invoices.length > 0
          ? customer.invoices.reduce((oldest, inv) =>
              new Date(inv.date) < new Date(oldest.date) ? inv : oldest
            , customer.invoices[0])
          : null;

        const daysOverdue = oldestInvoice?.due_date
          ? Math.max(0, Math.floor((Date.now() - new Date(oldestInvoice.due_date).getTime()) / 86400000))
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
              templateId: selectedTemplateId,
              templateName: selectedTemplate.name,
              template: {
                subject: selectedTemplate.subject,
                body: selectedTemplate.body,
                include_invoice_table: selectedTemplate.include_invoice_table,
              },
              customerData: {
                customer_name: customer.customer_name,
                customer_id: customer.customer_id,
                customer_email: customer.email,
                balance: customer.total_balance,
                total_invoices: customer.open_invoice_count,
                invoices: customer.invoices
                  .filter(inv => inv.balance > 0)
                  .map(inv => ({
                    reference_number: inv.reference_number,
                    invoice_date: inv.date,
                    due_date: inv.due_date,
                    amount: inv.amount,
                    balance: inv.balance,
                    description: inv.description,
                  })),
                oldest_invoice_date: oldestInvoice?.date || '',
                days_overdue: daysOverdue,
              },
              pdfBase64: base64,
              sentByUserId: profile?.id,
              department: 'ar',
            }),
          }
        );

        if (response.ok) {
          progress[i].status = 'success';
        } else {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }));
          progress[i].status = 'failed';
          progress[i].error = err.error || err.details || 'Failed';
        }
      } catch (err: any) {
        progress[i].status = 'failed';
        progress[i].error = err.message || 'Network error';
      }

      setEmailProgress([...progress]);
      if (i < customersWithEmail.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    setSending(false);
  };

  const successCount = emailProgress.filter(p => p.status === 'success').length;
  const failCount = emailProgress.filter(p => p.status === 'failed').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">
              {selectedCustomers.length} customer{selectedCustomers.length !== 1 ? 's' : ''} selected
            </span>
            {selectedCustomers.length > 0 && !selectedCustomers.every(c => c.email) && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="w-3 h-3" />
                {selectedCustomers.filter(c => !c.email).length} without email
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActionMode(actionMode === 'download' ? null : 'download')}
              disabled={selectedCustomers.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Download Excel
            </button>
            <button
              onClick={() => setActionMode(actionMode === 'email' ? null : 'email')}
              disabled={selectedCustomers.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <Mail className="w-4 h-4" />
              Email Statements
            </button>
          </div>
        </div>
      </div>

      {actionMode === 'download' && (
        <div className="px-6 py-4 bg-emerald-50/50 border-b border-gray-100 animate-in fade-in duration-200">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-700 font-medium">Format:</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={downloadType === 'combined'}
                  onChange={() => setDownloadType('combined')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">Combined file (Summary + Detail sheets)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={downloadType === 'individual'}
                  onChange={() => setDownloadType('individual')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">Separate file per customer</span>
              </label>
            </div>
            <div className="flex-1" />
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download {selectedCustomers.length} Statement{selectedCustomers.length !== 1 ? 's' : ''}
            </button>
            <button onClick={() => setActionMode(null)} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {actionMode === 'email' && (
        <div className="px-6 py-4 bg-blue-50/50 animate-in fade-in duration-200">
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="text-sm text-gray-700 font-medium whitespace-nowrap">Email Template:</label>
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => onTemplateChange(e.target.value)}
                className="flex-1 max-w-md px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              >
                {templates.length === 0 && <option value="">No templates available</option>}
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.is_default ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-gray-600">
                Sending to <span className="font-semibold text-blue-700">{customersWithEmail.length}</span> customer{customersWithEmail.length !== 1 ? 's' : ''} with email addresses.
                Each receives their personalized statement with an Excel attachment.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendEmails}
                  disabled={sending || customersWithEmail.length === 0 || !selectedTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Sending...' : `Send ${customersWithEmail.length} Email${customersWithEmail.length !== 1 ? 's' : ''}`}
                </button>
                <button onClick={() => { setActionMode(null); setEmailProgress([]); }} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {emailProgress.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Email Progress</span>
                  <div className="flex items-center gap-3 text-xs">
                    {successCount > 0 && <span className="text-emerald-600 font-medium">{successCount} sent</span>}
                    {failCount > 0 && <span className="text-red-600 font-medium">{failCount} failed</span>}
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                  {emailProgress.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      {p.status === 'pending' && <div className="w-4 h-4 rounded-full bg-gray-200 flex-shrink-0" />}
                      {p.status === 'sending' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />}
                      {p.status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                      {p.status === 'failed' && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      <span className="text-gray-700 truncate">{p.customer}</span>
                      {p.error && <span className="text-xs text-red-500 ml-auto truncate max-w-[200px]">{p.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
