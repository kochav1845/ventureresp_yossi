import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Copy, Check, FileText, Mail, Table, Paperclip, Eye, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface CustomerReportTemplatesProps {
  onBack?: () => void;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  include_invoice_table: boolean;
  include_payment_table: boolean;
  include_pdf_attachment: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const AVAILABLE_FIELDS = [
  { key: '{{customer_name}}', label: 'Customer Name', description: 'Full name of the customer' },
  { key: '{{customer_id}}', label: 'Customer ID', description: 'Acumatica customer ID' },
  { key: '{{customer_email}}', label: 'Customer Email', description: 'Customer email address' },
  { key: '{{balance}}', label: 'Balance', description: 'Current outstanding balance' },
  { key: '{{total_invoices}}', label: 'Total Invoices', description: 'Number of unpaid invoices' },
  { key: '{{date_from}}', label: 'Date From', description: 'Start date of report period' },
  { key: '{{date_to}}', label: 'Date To', description: 'End date of report period' },
  { key: '{{credit_memos_count}}', label: 'Credit Memos Count', description: 'Number of credit memos' },
  { key: '{{credit_memos_total}}', label: 'Credit Memos Total', description: 'Total amount of credit memos' },
  { key: '{{oldest_invoice_date}}', label: 'Oldest Invoice Date', description: 'Date of oldest unpaid invoice' },
  { key: '{{days_overdue}}', label: 'Days Overdue', description: 'Days since oldest invoice due date' },
  { key: '{{payment_url}}', label: 'Payment URL', description: 'Link for customer to make payment' },
];

export default function CustomerReportTemplates({ onBack }: CustomerReportTemplatesProps) {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<Template>>({
    name: '',
    subject: 'Account Statement - {{customer_name}}',
    body: '',
    include_invoice_table: true,
    include_payment_table: false,
    include_pdf_attachment: true,
    is_default: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customer_report_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentTemplate.name || !currentTemplate.subject || !currentTemplate.body) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (currentTemplate.id) {
        const { error } = await supabase
          .from('customer_report_templates')
          .update({
            name: currentTemplate.name,
            subject: currentTemplate.subject,
            body: currentTemplate.body,
            include_invoice_table: currentTemplate.include_invoice_table,
            include_payment_table: currentTemplate.include_payment_table,
            include_pdf_attachment: currentTemplate.include_pdf_attachment,
            is_default: currentTemplate.is_default,
          })
          .eq('id', currentTemplate.id);

        if (error) throw error;
        setSuccess('Template updated successfully');
      } else {
        const { error } = await supabase
          .from('customer_report_templates')
          .insert({
            ...currentTemplate,
            created_by: profile?.id,
          });

        if (error) throw error;
        setSuccess('Template created successfully');
      }

      await loadTemplates();
      setEditing(false);
      setCurrentTemplate({
        name: '',
        subject: 'Account Statement - {{customer_name}}',
        body: '',
        include_invoice_table: true,
        include_payment_table: false,
        include_pdf_attachment: true,
        is_default: false,
      });

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('customer_report_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setSuccess('Template deleted successfully');
      await loadTemplates();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDuplicate = async (template: Template) => {
    setCurrentTemplate({
      name: `${template.name} (Copy)`,
      subject: template.subject,
      body: template.body,
      include_invoice_table: template.include_invoice_table,
      include_payment_table: template.include_payment_table,
      include_pdf_attachment: template.include_pdf_attachment,
      is_default: false,
    });
    setEditing(true);
  };

  const insertField = (field: string, targetField: 'subject' | 'body') => {
    const textarea = document.getElementById(targetField) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = currentTemplate[targetField] || '';
    const newText = text.substring(0, start) + field + text.substring(end);

    setCurrentTemplate({ ...currentTemplate, [targetField]: newText });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + field.length, start + field.length);
    }, 0);
  };

  const getPreviewText = () => {
    const sampleData = {
      '{{customer_name}}': 'John Doe Medical Supply',
      '{{customer_id}}': 'CUST-12345',
      '{{customer_email}}': 'john@example.com',
      '{{balance}}': '$15,432.50',
      '{{total_invoices}}': '8',
      '{{date_from}}': '01/01/2024',
      '{{date_to}}': '12/31/2024',
      '{{credit_memos_count}}': '2',
      '{{credit_memos_total}}': '$500.00',
      '{{oldest_invoice_date}}': '10/15/2024',
      '{{days_overdue}}': '45',
      '{{payment_url}}': 'https://venture.bolt.host/pay',
    };

    let previewBody = currentTemplate.body || '';
    Object.entries(sampleData).forEach(([key, value]) => {
      previewBody = previewBody.replace(new RegExp(key, 'g'), value);
    });

    if (currentTemplate.include_invoice_table) {
      previewBody = previewBody.replace('{{invoice_table}}', `
╔════════════════════════════════════════════════════════════════╗
║                    INVOICE DETAILS                              ║
╠═══════════════╦═════════════╦═════════════╦════════════════════╣
║ Invoice #     ║ Date        ║ Due Date    ║ Amount             ║
╠═══════════════╬═════════════╬═════════════╬════════════════════╣
║ INV-001234    ║ 10/15/2024  ║ 11/14/2024  ║ $3,450.00          ║
║ INV-001235    ║ 10/22/2024  ║ 11/21/2024  ║ $2,180.50          ║
║ INV-001236    ║ 11/05/2024  ║ 12/05/2024  ║ $5,802.00          ║
╚═══════════════╩═════════════╩═════════════╩════════════════════╝
      `);
    } else {
      previewBody = previewBody.replace('{{invoice_table}}', '');
    }

    if (currentTemplate.include_payment_table) {
      previewBody = previewBody.replace('{{payment_table}}', `
╔════════════════════════════════════════════════════════════════╗
║                    PAYMENT HISTORY                              ║
╠═════════════════════╦═════════════╦════════════════════════════╣
║ Payment Date        ║ Method      ║ Amount                     ║
╠═════════════════════╬═════════════╬════════════════════════════╣
║ 09/15/2024          ║ Check       ║ $2,500.00                  ║
║ 08/20/2024          ║ Wire        ║ $5,000.00                  ║
╚═════════════════════╩═════════════╩════════════════════════════╝
      `);
    } else {
      previewBody = previewBody.replace('{{payment_table}}', '');
    }

    return previewBody;
  };

  if (editing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setEditing(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {currentTemplate.id ? 'Edit Template' : 'Create New Template'}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Create email templates with dynamic fields for customer reports
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Template Details</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={currentTemplate.name}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Standard Account Statement"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email Subject *
                  </label>
                  <textarea
                    id="subject"
                    value={currentTemplate.subject}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, subject: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    placeholder="Account Statement - {{customer_name}}"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email Body *
                  </label>
                  <textarea
                    id="body"
                    value={currentTemplate.body}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, body: e.target.value })}
                    rows={16}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    placeholder="Dear {{customer_name}},&#10;&#10;Your current balance is {{balance}}..."
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use the fields panel on the right to insert dynamic content
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Options</h3>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentTemplate.include_invoice_table || false}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, include_invoice_table: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Table className="w-4 h-4" />
                      Include Invoice Table
                    </div>
                    <p className="text-xs text-slate-500">Display detailed list of all unpaid invoices</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentTemplate.include_payment_table || false}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, include_payment_table: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Table className="w-4 h-4" />
                      Include Payment History Table
                    </div>
                    <p className="text-xs text-slate-500">Display recent payment history</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentTemplate.include_pdf_attachment || false}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, include_pdf_attachment: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Paperclip className="w-4 h-4" />
                      Attach PDF Invoice Report
                    </div>
                    <p className="text-xs text-slate-500">Generate and attach a PDF with invoice details</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentTemplate.is_default || false}
                    onChange={(e) => setCurrentTemplate({ ...currentTemplate, is_default: e.target.checked })}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Check className="w-4 h-4" />
                      Set as Default Template
                    </div>
                    <p className="text-xs text-slate-500">Use this template by default for new reports</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Available Fields</h3>
              <p className="text-xs text-slate-600 mb-4">
                Click to insert into subject or body at cursor position
              </p>

              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {AVAILABLE_FIELDS.map((field) => (
                  <div key={field.key} className="border border-slate-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{field.label}</div>
                        <div className="text-xs text-slate-500 mt-1">{field.description}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => insertField(field.key, 'subject')}
                        className="flex-1 text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                      >
                        → Subject
                      </button>
                      <button
                        onClick={() => insertField(field.key, 'body')}
                        className="flex-1 text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                      >
                        → Body
                      </button>
                    </div>
                    <code className="block mt-2 text-xs bg-slate-50 px-2 py-1 rounded text-slate-600 font-mono">
                      {field.key}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {showPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h3 className="text-xl font-semibold text-slate-900">Template Preview</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-6">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Subject:</label>
                  <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                    {currentTemplate.subject?.replace(/\{\{customer_name\}\}/g, 'John Doe Medical Supply')}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Body:</label>
                  <div className="bg-slate-50 px-4 py-3 rounded-lg border border-slate-200 whitespace-pre-wrap font-mono text-sm">
                    {getPreviewText()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Customer Report Templates</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage email templates for customer account statements and reports
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-600 mt-4">Loading templates...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-slate-900">{template.name}</h3>
                    {template.is_default && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Updated {new Date(template.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    Subject:
                  </label>
                  <p className="text-sm text-slate-600 mt-1 bg-slate-50 px-3 py-2 rounded border border-slate-200 font-mono">
                    {template.subject}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Body Preview:</label>
                  <p className="text-sm text-slate-600 mt-1 bg-slate-50 px-3 py-2 rounded border border-slate-200 line-clamp-3">
                    {template.body.substring(0, 150)}...
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {template.include_invoice_table && (
                  <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded flex items-center gap-1">
                    <Table className="w-3 h-3" />
                    Invoice Table
                  </span>
                )}
                {template.include_payment_table && (
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded flex items-center gap-1">
                    <Table className="w-3 h-3" />
                    Payment Table
                  </span>
                )}
                {template.include_pdf_attachment && (
                  <span className="px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded flex items-center gap-1">
                    <Paperclip className="w-3 h-3" />
                    PDF Attachment
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentTemplate(template);
                    setEditing(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDuplicate(template)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="col-span-2 text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">No templates yet</p>
              <p className="text-sm text-slate-500 mt-1">Create your first template to get started</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
