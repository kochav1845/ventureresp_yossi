import { useState, useEffect } from 'react';
import {
  Save,
  CheckCircle,
  AlertCircle,
  Loader2,
  AtSign,
  ToggleLeft,
  ToggleRight,
  FileText,
  ClipboardList,
  Ticket,
  Bell,
  Shield,
  Plus,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DepartmentSender {
  id: string;
  department_key: string;
  department_label: string;
  from_email: string;
  from_name: string;
  reply_to_email: string;
  reply_to_name: string;
  is_active: boolean;
  description: string;
}

const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  ar: FileText,
  census: ClipboardList,
  tickets: Ticket,
  reminders: Bell,
  noreply: Shield,
};

const DEPARTMENT_COLORS: Record<string, { bg: string; iconBg: string; iconText: string; border: string }> = {
  ar: { bg: 'bg-blue-50', iconBg: 'bg-blue-100', iconText: 'text-blue-600', border: 'border-blue-200' },
  census: { bg: 'bg-teal-50', iconBg: 'bg-teal-100', iconText: 'text-teal-600', border: 'border-teal-200' },
  tickets: { bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconText: 'text-amber-600', border: 'border-amber-200' },
  reminders: { bg: 'bg-rose-50', iconBg: 'bg-rose-100', iconText: 'text-rose-600', border: 'border-rose-200' },
  noreply: { bg: 'bg-slate-50', iconBg: 'bg-slate-200', iconText: 'text-slate-600', border: 'border-slate-200' },
};

const DEFAULT_COLORS = { bg: 'bg-slate-50', iconBg: 'bg-slate-200', iconText: 'text-slate-600', border: 'border-slate-200' };

interface Props {
  fallbackFromEmail: string;
  fallbackFromName: string;
  fallbackReplyToEmail: string;
  fallbackReplyToName: string;
}

export default function DepartmentEmailSenders({ fallbackFromEmail, fallbackFromName, fallbackReplyToEmail, fallbackReplyToName }: Props) {
  const [departments, setDepartments] = useState<DepartmentSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newDept, setNewDept] = useState({ department_key: '', department_label: '', description: '' });

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('department_email_senders')
        .select('*')
        .order('department_label');

      if (fetchError) throw fetchError;
      setDepartments(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateDepartment = (id: string, field: keyof DepartmentSender, value: string | boolean) => {
    setDepartments(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      for (const dept of departments) {
        const { error: updateError } = await supabase
          .from('department_email_senders')
          .update({
            from_email: dept.from_email,
            from_name: dept.from_name,
            reply_to_email: dept.reply_to_email,
            reply_to_name: dept.reply_to_name,
            is_active: dept.is_active,
            department_label: dept.department_label,
            description: dept.description,
          })
          .eq('id', dept.id);

        if (updateError) throw updateError;
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!newDept.department_key || !newDept.department_label) return;
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('department_email_senders')
        .insert({
          department_key: newDept.department_key.toLowerCase().replace(/\s+/g, '_'),
          department_label: newDept.department_label,
          description: newDept.description,
          from_email: '',
          from_name: '',
          reply_to_email: '',
          reply_to_name: '',
          is_active: true,
        });

      if (insertError) throw insertError;
      setNewDept({ department_key: '', department_label: '', description: '' });
      setAddingNew(false);
      await loadDepartments();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteDepartment = async (id: string, key: string) => {
    const builtIn = ['ar', 'census', 'tickets', 'reminders', 'noreply'];
    if (builtIn.includes(key)) return;
    if (!confirm('Remove this department sender?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('department_email_senders')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setDepartments(prev => prev.filter(d => d.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const builtInKeys = ['ar', 'census', 'tickets', 'reminders', 'noreply'];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Department Senders</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure which "from" address each department uses. Empty fields fall back to the default AR sender.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Department
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveSuccess ? 'Saved' : 'Save Departments'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {addingNew && (
        <div className="mb-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-800 mb-3">New Department</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Key (unique)</label>
              <input
                type="text"
                value={newDept.department_key}
                onChange={(e) => setNewDept({ ...newDept, department_key: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="e.g., billing"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
              <input
                type="text"
                value={newDept.department_label}
                onChange={(e) => setNewDept({ ...newDept, department_label: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="e.g., Billing Department"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <input
                type="text"
                value={newDept.description}
                onChange={(e) => setNewDept({ ...newDept, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="What this department is used for"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleAddDepartment}
              disabled={!newDept.department_key || !newDept.department_label}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewDept({ department_key: '', department_label: '', description: '' }); }}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {departments.map((dept) => {
          const Icon = DEPARTMENT_ICONS[dept.department_key] || FileText;
          const colors = DEPARTMENT_COLORS[dept.department_key] || DEFAULT_COLORS;
          const isExpanded = expandedId === dept.id;
          const effectiveFrom = dept.from_email || fallbackFromEmail;
          const isCustom = !builtInKeys.includes(dept.department_key);

          return (
            <div key={dept.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${isExpanded ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'}`}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : dept.id)}
                className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4.5 h-4.5 ${colors.iconText}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{dept.department_label}</p>
                      {!dept.is_active && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded">DISABLED</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dept.from_email ? dept.from_email : <span className="italic">Using default: {fallbackFromEmail}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {dept.from_email && (
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${colors.bg} ${colors.iconText}`}>
                      Custom
                    </span>
                  )}
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mt-3 mb-4">{dept.description}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">From Email</label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="email"
                          value={dept.from_email}
                          onChange={(e) => updateDepartment(dept.id, 'from_email', e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                          placeholder={fallbackFromEmail || 'Leave empty for default'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">From Name</label>
                      <input
                        type="text"
                        value={dept.from_name}
                        onChange={(e) => updateDepartment(dept.id, 'from_name', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        placeholder={fallbackFromName || 'Leave empty for default'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Reply-To Email</label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="email"
                          value={dept.reply_to_email}
                          onChange={(e) => updateDepartment(dept.id, 'reply_to_email', e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                          placeholder={fallbackReplyToEmail || 'Leave empty for default'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Reply-To Name</label>
                      <input
                        type="text"
                        value={dept.reply_to_name}
                        onChange={(e) => updateDepartment(dept.id, 'reply_to_name', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                        placeholder={fallbackReplyToName || 'Leave empty for default'}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => updateDepartment(dept.id, 'is_active', !dept.is_active)}
                      className="flex items-center gap-2 text-sm"
                    >
                      {dept.is_active ? (
                        <ToggleRight className="w-5 h-5 text-blue-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                      )}
                      <span className={dept.is_active ? 'text-blue-700 font-medium' : 'text-slate-500'}>
                        {dept.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </button>

                    <div className="flex items-center gap-2">
                      {effectiveFrom && (
                        <span className="text-xs text-slate-400">
                          Will send as: <span className="font-medium text-slate-600">{effectiveFrom}</span>
                        </span>
                      )}
                      {isCustom && (
                        <button
                          onClick={() => handleDeleteDepartment(dept.id, dept.department_key)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove department"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
