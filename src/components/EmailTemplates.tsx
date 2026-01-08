import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, Edit2, Trash2, Mail, RefreshCw, Eye } from 'lucide-react';

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type EmailTemplatesProps = {
  onBack?: () => void;
};

export default function EmailTemplates({ onBack }: EmailTemplatesProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
  });

  const [previewData, setPreviewData] = useState({
    customerName: 'John Doe',
    month: new Date().toLocaleString('default', { month: 'long' }),
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({ name: '', subject: '', body: '' });
    setShowForm(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      body: template.body,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error deleting template. It may be in use by customer assignments.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Please enter a template name');
      return;
    }

    if (!formData.subject.trim()) {
      alert('Please enter an email subject');
      return;
    }

    if (!formData.body.trim()) {
      alert('Please enter email body content');
      return;
    }

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update({
            name: formData.name,
            subject: formData.subject,
            body: formData.body,
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert({
            name: formData.name,
            subject: formData.subject,
            body: formData.body,
          });

        if (error) throw error;
      }

      setShowForm(false);
      await loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template');
    }
  };

  const replaceVariables = (text: string) => {
    return text
      .replace(/\{customer_name\}/g, previewData.customerName)
      .replace(/\{month\}/g, previewData.month);
  };

  const handlePreview = () => {
    setShowPreview(true);
  };

  if (showPreview) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Form
          </button>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <Eye className="text-blue-400" />
              Email Preview
            </h2>

            <div className="space-y-6">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Preview Variables
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={previewData.customerName}
                      onChange={(e) => setPreviewData({ ...previewData, customerName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Month</label>
                    <input
                      type="text"
                      value={previewData.month}
                      onChange={(e) => setPreviewData({ ...previewData, month: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-600 border border-slate-500 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-xl">
                <div className="border-b border-slate-200 pb-4 mb-4">
                  <div className="text-sm text-slate-500 mb-2">Subject:</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {replaceVariables(formData.subject)}
                  </div>
                </div>
                <div className="text-slate-800 whitespace-pre-wrap">
                  {replaceVariables(formData.body)}
                </div>
              </div>

              <button
                onClick={() => setShowPreview(false)}
                className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setShowForm(false)}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Templates
          </button>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </h2>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
              <p className="text-blue-300 text-sm">
                <strong>Available variables:</strong> Use <code className="bg-slate-900 px-2 py-0.5 rounded">{'customer_name}'}</code> for customer name and <code className="bg-slate-900 px-2 py-0.5 rounded">{'month}'}</code> for current month.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Monthly Census Request"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Subject *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Census for {month}"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Body *
                </label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={10}
                  placeholder="Dear {customer_name},&#10;&#10;Please send your census for {month}.&#10;&#10;Thank you,&#10;Venture Respiratory Services"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handlePreview}
                  className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Eye size={18} />
                  Preview
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700">
          <div className="p-6 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="text-blue-400" size={24} />
                <h2 className="text-xl font-semibold text-white">Email Templates</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={loadTemplates}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  New Template
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
                <p className="text-slate-400">Loading templates...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="text-slate-600 mx-auto mb-4" size={48} />
                <p className="text-slate-400 mb-4">No templates created yet</p>
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  Create Your First Template
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="bg-slate-700/30 rounded-lg p-6 border border-slate-600 hover:border-slate-500 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-2">{template.name}</h3>
                        <div className="space-y-2">
                          <div>
                            <span className="text-xs text-slate-400 uppercase">Subject:</span>
                            <p className="text-slate-300">{template.subject}</p>
                          </div>
                          <div>
                            <span className="text-xs text-slate-400 uppercase">Body Preview:</span>
                            <p className="text-slate-400 text-sm line-clamp-3">{template.body}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
