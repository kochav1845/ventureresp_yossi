import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, Edit2, Trash2, Link as LinkIcon, RefreshCw, Calendar, Mail, User, Clock, PauseCircle, Users } from 'lucide-react';
import ManageCustomersModal from './ManageCustomersModal';

type Customer = {
  id: string;
  name: string;
  email: string;
  postpone_until?: string | null;
  postpone_reason?: string | null;
};

type EmailFormula = {
  id: string;
  name: string;
};

type EmailTemplate = {
  id: string;
  name: string;
};

type Assignment = {
  id: string;
  customer_id: string;
  formula_id: string;
  template_id: string;
  start_day_of_month: number;
  timezone: string;
  is_active: boolean;
  created_at: string;
  customer?: Customer;
  formula?: EmailFormula;
  template?: EmailTemplate;
};

type CustomerAssignmentsProps = {
  onBack?: () => void;
};

export default function CustomerAssignments({ onBack }: CustomerAssignmentsProps) {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [formulas, setFormulas] = useState<EmailFormula[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const [showManageCustomers, setShowManageCustomers] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: '',
    formula_id: '',
    template_id: '',
    start_day_of_month: 1,
    timezone: 'America/New_York',
  });

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignmentsRes, customersRes, formulasRes, templatesRes] = await Promise.all([
        supabase.from('customer_assignments').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('id, name, email, postpone_until, postpone_reason').order('name'),
        supabase.from('email_formulas').select('id, name').order('name'),
        supabase.from('email_templates').select('id, name').order('name'),
      ]);

      if (assignmentsRes.error) throw assignmentsRes.error;
      if (customersRes.error) throw customersRes.error;
      if (formulasRes.error) throw formulasRes.error;
      if (templatesRes.error) throw templatesRes.error;

      const assignmentsWithDetails = await Promise.all(
        (assignmentsRes.data || []).map(async (assignment) => {
          const customer = customersRes.data?.find(c => c.id === assignment.customer_id);
          const formula = formulasRes.data?.find(f => f.id === assignment.formula_id);
          const template = templatesRes.data?.find(t => t.id === assignment.template_id);
          return { ...assignment, customer, formula, template };
        })
      );

      setAssignments(assignmentsWithDetails);
      setCustomers(customersRes.data || []);
      setFormulas(formulasRes.data || []);
      setTemplates(templatesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingAssignment(null);
    setFormData({
      customer_id: '',
      formula_id: '',
      template_id: '',
      start_day_of_month: 1,
      timezone: 'America/New_York',
    });
    setShowForm(true);
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setFormData({
      customer_id: assignment.customer_id,
      formula_id: assignment.formula_id,
      template_id: assignment.template_id,
      start_day_of_month: assignment.start_day_of_month,
      timezone: assignment.timezone || 'America/New_York',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;

    try {
      const { error } = await supabase
        .from('customer_assignments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Error deleting assignment');
    }
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from('customer_assignments')
        .update({ is_active: !currentValue })
        .eq('id', id);

      if (error) throw error;
      setAssignments(assignments.map(a => a.id === id ? { ...a, is_active: !currentValue } : a));
    } catch (error) {
      console.error('Error updating assignment status:', error);
      alert('Error updating assignment status');
    } finally {
      setUpdating(null);
    }
  };

  const handleUnpostpone = async (customerId: string) => {
    if (!confirm('Remove the postponement for this customer? They will start receiving scheduled emails again.')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          postpone_until: null,
          postpone_reason: null
        })
        .eq('id', customerId);

      if (error) throw error;

      // Reload data to reflect changes
      await loadData();
    } catch (error) {
      console.error('Error removing postponement:', error);
      alert('Error removing postponement');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customer_id) {
      alert('Please select a customer');
      return;
    }

    if (!formData.formula_id) {
      alert('Please select a formula');
      return;
    }

    if (!formData.template_id) {
      alert('Please select a template');
      return;
    }

    if (formData.start_day_of_month < 1 || formData.start_day_of_month > 31) {
      alert('Start day must be between 1 and 31');
      return;
    }

    try {
      const assignmentData = {
        customer_id: formData.customer_id,
        formula_id: formData.formula_id,
        template_id: formData.template_id,
        start_day_of_month: formData.start_day_of_month,
        timezone: formData.timezone,
      };

      if (editingAssignment) {
        const { error } = await supabase
          .from('customer_assignments')
          .update(assignmentData)
          .eq('id', editingAssignment.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customer_assignments')
          .insert(assignmentData);

        if (error) throw error;
      }

      setShowForm(false);
      await loadData();
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('Error saving assignment');
    }
  };

  if (showForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
        <ManageCustomersModal
          isOpen={showManageCustomers}
          onClose={() => setShowManageCustomers(false)}
          onCustomersChanged={loadData}
        />

        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setShowForm(false)}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Assignments
          </button>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingAssignment ? 'Edit Assignment' : 'Create New Assignment'}
            </h2>

            {customers.length === 0 || formulas.length === 0 || templates.length === 0 ? (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
                <p className="text-yellow-300 text-sm">
                  You need to create at least one customer, one formula, and one template before creating an assignment.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">
                    Customer *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowManageCustomers(true)}
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Users size={14} />
                    Manage Customers
                  </button>
                </div>
                <select
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={customers.length === 0}
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} ({customer.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Formula *
                </label>
                <select
                  value={formData.formula_id}
                  onChange={(e) => setFormData({ ...formData, formula_id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={formulas.length === 0}
                >
                  <option value="">Select a formula</option>
                  {formulas.map((formula) => (
                    <option key={formula.id} value={formula.id}>
                      {formula.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Template *
                </label>
                <select
                  value={formData.template_id}
                  onChange={(e) => setFormData({ ...formData, template_id: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={templates.length === 0}
                >
                  <option value="">Select a template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Start Day of Month *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.start_day_of_month}
                      onChange={(e) => setFormData({ ...formData, start_day_of_month: parseInt(e.target.value) || 1 })}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-400 mt-1">Day 1-31</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Timezone *
                    </label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="America/New_York">Eastern Time (New York)</option>
                      <option value="America/Chicago">Central Time (Chicago)</option>
                      <option value="America/Denver">Mountain Time (Denver)</option>
                      <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
                      <option value="America/Phoenix">Arizona Time (Phoenix)</option>
                      <option value="America/Anchorage">Alaska Time (Anchorage)</option>
                      <option value="Pacific/Honolulu">Hawaii Time (Honolulu)</option>
                      <option value="UTC">UTC</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Send times defined in the email formula will use this timezone</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  disabled={customers.length === 0 || formulas.length === 0 || templates.length === 0}
                >
                  {editingAssignment ? 'Update Assignment' : 'Create Assignment'}
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
      <ManageCustomersModal
        isOpen={showManageCustomers}
        onClose={() => setShowManageCustomers(false)}
        onCustomersChanged={loadData}
      />

      <div className="max-w-7xl mx-auto">
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
                <LinkIcon className="text-blue-400" size={24} />
                <h2 className="text-xl font-semibold text-white">Customer Assignments</h2>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowManageCustomers(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors border border-slate-600"
                >
                  <Users size={18} />
                  Manage Customers
                </button>
                <button
                  onClick={loadData}
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
                  New Assignment
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin text-blue-400 mx-auto mb-4" size={32} />
                <p className="text-slate-400">Loading assignments...</p>
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-center py-12">
                <LinkIcon className="text-slate-600 mx-auto mb-4" size={48} />
                <p className="text-slate-400 mb-4">No assignments created yet</p>
                <button
                  onClick={handleCreate}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={18} />
                  Create Your First Assignment
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-slate-700/30 rounded-lg p-6 border border-slate-600 hover:border-slate-500 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <User className="text-blue-400" size={20} />
                          <div className="flex items-center gap-2 flex-wrap">
                            <div>
                              <span className="text-white font-semibold">{assignment.customer?.name}</span>
                              <span className="text-slate-400 text-sm ml-2">({assignment.customer?.email})</span>
                            </div>
                            {assignment.customer?.postpone_until && new Date(assignment.customer.postpone_until) > new Date() && (
                              <button
                                onClick={() => handleUnpostpone(assignment.customer_id)}
                                className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/30 hover:bg-yellow-500/30 rounded text-xs text-yellow-300 transition-colors"
                                title={`${assignment.customer.postpone_reason || 'Postponed'} - Click to remove postponement`}
                              >
                                <PauseCircle size={12} />
                                <span>Postponed until {new Date(assignment.customer.postpone_until).toLocaleDateString()}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="text-slate-400" size={16} />
                            <span className="text-slate-300 text-sm">
                              Formula: <span className="font-medium">{assignment.formula?.name}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="text-slate-400" size={16} />
                            <span className="text-slate-300 text-sm">
                              Template: <span className="font-medium">{assignment.template?.name}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="text-slate-400" size={16} />
                            <span className="text-slate-300 text-sm">
                              Starts: Day <span className="font-medium">{assignment.start_day_of_month}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="text-slate-400" size={16} />
                            <span className="text-slate-300 text-sm">
                              Timezone: <span className="font-medium">{assignment.timezone?.replace('America/', '').replace('_', ' ') || 'UTC'}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              assignment.is_active
                                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                : 'bg-slate-600/50 text-slate-400 border border-slate-600'
                            }`}>
                              {assignment.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleToggleActive(assignment.id, assignment.is_active)}
                          disabled={updating === assignment.id}
                          className={`p-2 rounded-lg transition-colors ${
                            assignment.is_active
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-slate-600 hover:bg-slate-500'
                          } text-white ${updating === assignment.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={assignment.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <LinkIcon size={18} />
                        </button>
                        <button
                          onClick={() => handleEdit(assignment)}
                          className="p-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(assignment.id)}
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
