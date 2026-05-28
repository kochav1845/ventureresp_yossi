import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus, Edit2, Trash2, Calendar, Clock, Users, Send, X, Power, PowerOff,
  CheckCircle, Search, AlertTriangle, FileText
} from 'lucide-react';
import type { ReportTemplate } from './types';

interface AutoSendRule {
  id: string;
  name: string;
  customer_ids: string[];
  day_of_month: number;
  time_of_day: string;
  template_id: string | null;
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
}

interface CustomerOption {
  customer_id: string;
  customer_name: string;
  email_address: string;
}

interface Props {
  templates: ReportTemplate[];
}

export default function StatementAutoSendRules({ templates }: Props) {
  const { user } = useAuth();
  const [rules, setRules] = useState<AutoSendRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoSendRule | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    customer_ids: [] as string[],
    day_of_month: 5,
    time_of_day: '09:00',
    template_id: '',
  });

  useEffect(() => {
    loadRules();
    loadCustomers();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('statement_auto_send_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setRules(data || []);
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase.rpc('get_customer_picker_list').limit(10000);
    if (data) {
      setCustomers(data.filter((c: any) => c.email_address).map((c: any) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        email_address: c.email_address || '',
      })));
    }
  };

  const handleCreate = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      customer_ids: [],
      day_of_month: 5,
      time_of_day: '09:00',
      template_id: templates[0]?.id || '',
    });
    setCustomerSearch('');
    setShowForm(true);
  };

  const handleEdit = (rule: AutoSendRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      customer_ids: rule.customer_ids,
      day_of_month: rule.day_of_month,
      time_of_day: rule.time_of_day,
      template_id: rule.template_id || '',
    });
    setCustomerSearch('');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this auto-send rule?')) return;
    await supabase.from('statement_auto_send_rules').delete().eq('id', id);
    await loadRules();
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await supabase.from('statement_auto_send_rules').update({ is_active: !current }).eq('id', id);
    setRules(rules.map(r => r.id === id ? { ...r, is_active: !current } : r));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('Please enter a rule name'); return; }
    if (formData.customer_ids.length === 0) { alert('Please select at least one customer'); return; }
    if (!formData.template_id) { alert('Please select a template'); return; }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        customer_ids: formData.customer_ids,
        day_of_month: formData.day_of_month,
        time_of_day: formData.time_of_day,
        template_id: formData.template_id,
        created_by: user?.id,
      };

      if (editingRule) {
        const { error } = await supabase
          .from('statement_auto_send_rules')
          .update(payload)
          .eq('id', editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('statement_auto_send_rules')
          .insert(payload);
        if (error) throw error;
      }

      setShowForm(false);
      await loadRules();
    } catch (err: any) {
      alert('Error saving rule: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addCustomer = (id: string) => {
    if (!formData.customer_ids.includes(id)) {
      setFormData({ ...formData, customer_ids: [...formData.customer_ids, id] });
    }
    setCustomerSearch('');
  };

  const removeCustomer = (id: string) => {
    setFormData({ ...formData, customer_ids: formData.customer_ids.filter(c => c !== id) });
  };

  const getCustomerName = (id: string) => {
    return customers.find(c => c.customer_id === id)?.customer_name || id;
  };

  const getCustomerEmail = (id: string) => {
    return customers.find(c => c.customer_id === id)?.email_address || '';
  };

  const filteredCustomers = customerSearch.trim()
    ? customers
        .filter(c =>
          !formData.customer_ids.includes(c.customer_id) &&
          (c.customer_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
           c.customer_id.toLowerCase().includes(customerSearch.toLowerCase()) ||
           c.email_address.toLowerCase().includes(customerSearch.toLowerCase()))
        )
        .slice(0, 50)
    : [];

  const getTemplateName = (id: string | null) => {
    if (!id) return 'None';
    return templates.find(t => t.id === id)?.name || 'Unknown';
  };

  if (showForm) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">
            {editingRule ? 'Edit Auto Send Rule' : 'Create Auto Send Rule'}
          </h2>
          <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Rule Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Rule Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Monthly statements - Top accounts"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                Day of Month
              </label>
              <select
                value={formData.day_of_month}
                onChange={(e) => setFormData({ ...formData, day_of_month: parseInt(e.target.value) })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                Time
              </label>
              <input
                type="time"
                value={formData.time_of_day}
                onChange={(e) => setFormData({ ...formData, time_of_day: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-gray-400" />
              Statement Template
            </label>
            <select
              value={formData.template_id}
              onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a template</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-400" />
              Customers ({formData.customer_ids.length} selected)
            </label>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customers to add..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {filteredCustomers.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.customer_id}
                      type="button"
                      onClick={() => addCustomer(c.customer_id)}
                      className="w-full px-4 py-2.5 text-left hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-900">{c.customer_name}</span>
                      <span className="text-xs text-gray-500 ml-2">{c.email_address}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {formData.customer_ids.length > 0 && (
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                {formData.customer_ids.map(id => (
                  <div key={id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{getCustomerName(id)}</span>
                      <span className="text-xs text-gray-400 ml-2">{getCustomerEmail(id)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomer(id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {formData.customer_ids.length === 0 && (
              <p className="text-xs text-gray-400 italic mt-2">Search and add customers above</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Auto Send Rules</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Automatically email statements to selected customers on a recurring schedule
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Rule
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading rules...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Send className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700">No auto-send rules yet</h3>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Create a rule to automatically email statements to customers on a schedule
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Your First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-white rounded-xl border shadow-sm transition-all ${
                rule.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-bold text-gray-900 truncate">{rule.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        rule.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {rule.is_active ? <CheckCircle className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                        {rule.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        Day {rule.day_of_month} of each month
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        {rule.time_of_day}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-blue-500" />
                        {rule.customer_ids.length} customer{rule.customer_ids.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-500" />
                        {getTemplateName(rule.template_id)}
                      </span>
                    </div>

                    {rule.last_sent_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        Last sent: {new Date(rule.last_sent_at).toLocaleDateString()} at {new Date(rule.last_sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}

                    {/* Customer names preview */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {rule.customer_ids.slice(0, 5).map(id => (
                        <span key={id} className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {getCustomerName(id)}
                        </span>
                      ))}
                      {rule.customer_ids.length > 5 && (
                        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          +{rule.customer_ids.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                    <button
                      onClick={() => handleToggleActive(rule.id, rule.is_active)}
                      className={`p-2 rounded-lg transition-colors ${
                        rule.is_active
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-gray-400 hover:bg-gray-100'
                      }`}
                      title={rule.is_active ? 'Pause rule' : 'Activate rule'}
                    >
                      {rule.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit rule"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
