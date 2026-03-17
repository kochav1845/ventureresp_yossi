import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Mail, FileSpreadsheet, Paperclip, Eye } from 'lucide-react';
import type { StatementCustomer, ReportTemplate } from './types';

interface Props {
  customers: StatementCustomer[];
  template: ReportTemplate;
  useTestEmail: boolean;
  testEmail: string;
  onClose: () => void;
  onConfirmSend: () => void;
  sending: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

function replacePlaceholders(text: string, customer: StatementCustomer) {
  const unpaidInvoices = customer.invoices.filter(inv => inv.balance > 0);
  const oldestInvoice = unpaidInvoices.length > 0
    ? unpaidInvoices.reduce((oldest, inv) =>
        new Date(inv.date) < new Date(oldest.date) ? inv : oldest
      , unpaidInvoices[0])
    : null;

  const daysOverdue = oldestInvoice?.due_date
    ? Math.max(0, Math.floor((Date.now() - new Date(oldestInvoice.due_date).getTime()) / 86400000))
    : 0;

  const replacements: Record<string, string> = {
    '{{customer_name}}': customer.customer_name,
    '{{customer_id}}': customer.customer_id,
    '{{customer_email}}': customer.email || '',
    '{{balance}}': formatCurrency(customer.total_balance),
    '{{total_invoices}}': customer.open_invoice_count.toString(),
    '{{date_from}}': '',
    '{{date_to}}': formatDate(new Date().toISOString()),
    '{{credit_memos_count}}': '0',
    '{{credit_memos_total}}': formatCurrency(0),
    '{{oldest_invoice_date}}': oldestInvoice ? formatDate(oldestInvoice.date) : '',
    '{{days_overdue}}': daysOverdue.toString(),
    '{{payment_url}}': '',
  };

  let result = text;
  Object.entries(replacements).forEach(([key, value]) => {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  });
  return result;
}

function renderInvoiceTable(invoices: StatementCustomer['invoices']) {
  const unpaid = invoices.filter(inv => inv.balance > 0)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  if (unpaid.length === 0) return null;

  const totalBalance = unpaid.reduce((sum, inv) => sum + inv.balance, 0);

  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-b-2 border-gray-200">Invoice #</th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-b-2 border-gray-200">Invoice Date</th>
            <th className="px-3 py-2.5 text-left font-semibold text-gray-700 border-b-2 border-gray-200">Due Date</th>
            <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b-2 border-gray-200">Amount</th>
            <th className="px-3 py-2.5 text-right font-semibold text-gray-700 border-b-2 border-gray-200">Balance</th>
          </tr>
        </thead>
        <tbody>
          {unpaid.map((inv, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-3 py-2 text-gray-800 border-b border-gray-100">{inv.reference_number}</td>
              <td className="px-3 py-2 text-gray-600 border-b border-gray-100">{formatDate(inv.date)}</td>
              <td className="px-3 py-2 text-gray-600 border-b border-gray-100">{formatDate(inv.due_date)}</td>
              <td className="px-3 py-2 text-gray-800 text-right border-b border-gray-100">{formatCurrency(inv.amount)}</td>
              <td className="px-3 py-2 text-gray-900 text-right font-medium border-b border-gray-100">{formatCurrency(inv.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-red-50">
            <td colSpan={4} className="px-3 py-2.5 font-semibold text-gray-800 border-t-2 border-gray-200">Total Balance Due:</td>
            <td className="px-3 py-2.5 text-right font-bold text-red-600 text-base border-t-2 border-gray-200">{formatCurrency(totalBalance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function EmailPreviewModal({ customers, template, useTestEmail, testEmail, onClose, onConfirmSend, sending }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const customer = customers[currentIndex];

  if (!customer) return null;

  const recipientEmail = useTestEmail ? testEmail : customer.email;
  const subjectPrefix = useTestEmail ? '[TEST] ' : '';
  const subject = subjectPrefix + replacePlaceholders(template.subject, customer);

  let bodyText = replacePlaceholders(template.body, customer);
  const hasInvoiceTablePlaceholder = bodyText.includes('{{invoice_table}}');
  const bodyParts = bodyText.split('{{invoice_table}}');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Email Preview</h3>
              <p className="text-xs text-gray-500">Review before sending</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {customers.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-1">
                <button
                  onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                  disabled={currentIndex === 0}
                  className="p-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-gray-600 min-w-[60px] text-center">
                  {currentIndex + 1} of {customers.length}
                </span>
                <button
                  onClick={() => setCurrentIndex(Math.min(customers.length - 1, currentIndex + 1))}
                  disabled={currentIndex === customers.length - 1}
                  className="p-1.5 text-gray-500 hover:text-gray-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-3 border-b border-gray-100 bg-white">
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-16 pt-0.5 flex-shrink-0">To</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800">{customer.customer_name}</span>
                <span className="text-xs text-gray-400">&lt;{recipientEmail || 'no email'}&gt;</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-16 pt-0.5 flex-shrink-0">Subject</span>
              <span className="text-sm font-medium text-gray-900">{subject}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide w-16 pt-0.5 flex-shrink-0">Attach</span>
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-emerald-800 font-medium">
                  Statement_{customer.customer_name.replace(/[^a-zA-Z0-9]/g, '_')}_{new Date().toISOString().split('T')[0]}.xlsx
                </span>
                <Paperclip className="w-3 h-3 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="mx-auto max-w-[600px] bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-5">
                <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                  {hasInvoiceTablePlaceholder ? (
                    <>
                      {bodyParts.map((part, i) => (
                        <div key={i}>
                          {part.split('\n').map((line, j) => (
                            <span key={j}>
                              {line}
                              {j < part.split('\n').length - 1 && <br />}
                            </span>
                          ))}
                          {i < bodyParts.length - 1 && template.include_invoice_table && renderInvoiceTable(customer.invoices)}
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      {bodyText.split('\n').map((line, i) => (
                        <span key={i}>
                          {line}
                          {i < bodyText.split('\n').length - 1 && <br />}
                        </span>
                      ))}
                      {template.include_invoice_table && renderInvoiceTable(customer.invoices)}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {customers.length} customer{customers.length !== 1 ? 's' : ''} will receive this email
            {useTestEmail && <span className="text-teal-600 font-medium"> (all to test address)</span>}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirmSend}
              disabled={sending}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
                useTestEmail ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Mail className="w-4 h-4" />
              Confirm & Send {customers.length} Email{customers.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
