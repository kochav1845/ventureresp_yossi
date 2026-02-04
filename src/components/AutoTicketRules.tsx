import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Power, PowerOff, Play, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

interface AutoTicketRule {
  id: string;
  customer_id: string;
  min_days_old: number;
  max_days_old: number;
  assigned_collector_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  active: boolean;
  customer_name?: string;
  collector_name?: string;
  collector_email?: string;
}

interface Customer {
  customer_id: string;
  customer_name: string;
}

interface Collector {
  id: string;
  full_name: string;
  email: string;
}

interface AutoTicketRulesProps {
  onBack: () => void;
}

export default function AutoTicketRules({ onBack }: AutoTicketRulesProps) {
  const [rules, setRules] = useState<AutoTicketRule[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTicketRule | null>(null);
  const [processing, setProcessing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);

  const [formData, setFormData] = useState({
    customer_id: '',
    min_days_old: 120,
    max_days_old: 150,
    assigned_collector_id: '',
  });

  const { showToast } = useToast();

  useEffect(() => {
    fetchRules();
    fetchCustomers();
    fetchCollectors();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = customers.filter(
        (c) =>
          c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.customer_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredCustomers(filtered.slice(0, 50));
    } else {
      setFilteredCustomers([]);
    }
  }, [searchTerm, customers]);

  const fetchRules = async () => {
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from('auto_ticket_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (rulesError) throw rulesError;

      const { data: collectorsData, error: collectorsError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email');

      if (collectorsError) throw collectorsError;

      const { data: customersData, error: customersError } = await supabase
        .from('acumatica_customers')
        .select('customer_id, customer_name');

      if (customersError) throw customersError;

      const collectorsMap = new Map(collectorsData?.map(c => [c.id, c]) || []);
      const customersMap = new Map(customersData?.map(c => [c.customer_id, c]) || []);

      const enrichedRules = rulesData?.map((rule: any) => {
        const collector = collectorsMap.get(rule.assigned_collector_id);
        const customer = customersMap.get(rule.customer_id);

        return {
          ...rule,
          customer_name: customer?.customer_name || rule.customer_id,
          collector_name: collector?.full_name || 'Unknown',
          collector_email: collector?.email || '',
        };
      }) || [];

      setRules(enrichedRules);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('acumatica_customers')
        .select('customer_id, customer_name')
        .order('customer_name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const fetchCollectors = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('role', ['collector', 'manager', 'admin'])
        .order('full_name');

      if (error) throw error;
      setCollectors(data || []);
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.min_days_old >= formData.max_days_old) {
      showToast('Maximum days must be greater than minimum days', 'error');
      return;
    }

    try {
      if (editingRule) {
        const { error } = await supabase
          .from('auto_ticket_rules')
          .update({
            min_days_old: formData.min_days_old,
            max_days_old: formData.max_days_old,
            assigned_collector_id: formData.assigned_collector_id,
          })
          .eq('id', editingRule.id);

        if (error) throw error;
        showToast('Rule updated successfully', 'success');
      } else {
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
          .from('auto_ticket_rules')
          .insert({
            ...formData,
            created_by: user?.id,
          });

        if (error) throw error;
        showToast('Rule created successfully', 'success');
      }

      setIsModalOpen(false);
      setEditingRule(null);
      resetForm();
      fetchRules();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleEdit = (rule: AutoTicketRule) => {
    setEditingRule(rule);
    setFormData({
      customer_id: rule.customer_id,
      min_days_old: rule.min_days_old,
      max_days_old: rule.max_days_old,
      assigned_collector_id: rule.assigned_collector_id,
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (rule: AutoTicketRule) => {
    try {
      const { error } = await supabase
        .from('auto_ticket_rules')
        .update({ active: !rule.active })
        .eq('id', rule.id);

      if (error) throw error;
      showToast(`Rule ${rule.active ? 'disabled' : 'enabled'}`, 'success');
      fetchRules();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleDelete = async (rule: AutoTicketRule) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const { error } = await supabase
        .from('auto_ticket_rules')
        .delete()
        .eq('id', rule.id);

      if (error) throw error;
      showToast('Rule deleted successfully', 'success');
      fetchRules();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleTestRun = async () => {
    if (!confirm('This will process all active rules and create/update tickets. Continue?')) return;

    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/process-auto-ticket-rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to process rules');

      showToast(
        `Processed ${result.results.processed} rules. Created ${result.results.tickets_created} tickets, updated ${result.results.tickets_updated} tickets, added ${result.results.invoices_added} invoices.`,
        'success'
      );

      if (result.results.errors.length > 0) {
        console.error('Processing errors:', result.results.errors);
        showToast(`${result.results.errors.length} errors occurred. Check console for details.`, 'error');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customer_id: '',
      min_days_old: 120,
      max_days_old: 150,
      assigned_collector_id: '',
    });
    setSearchTerm('');
    setFilteredCustomers([]);
  };

  const handleOpenModal = () => {
    resetForm();
    setEditingRule(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auto-Ticket Rules</h1>
            <p className="text-gray-600 mt-1">
              Automatically create tickets for customers with invoices in specific date ranges
            </p>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleTestRun}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>Run Now</span>
          </button>
          <button
            onClick={handleOpenModal}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-blue-800 text-sm">
          <strong>How it works:</strong> Every day at 6:00 AM, the system checks each active rule and finds unpaid invoices
          with dates between the specified range. If invoices are found, it creates a new ticket or adds them to an existing
          ticket for that customer and collector.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-500">No auto-ticket rules configured yet</p>
          <button
            onClick={handleOpenModal}
            className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
          >
            Create your first rule
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Range</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id} className={!rule.active ? 'opacity-50' : ''}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{rule.customer_name}</div>
                    <div className="text-xs text-gray-500">{rule.customer_id}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {rule.min_days_old} - {rule.max_days_old} days old
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{rule.collector_name}</div>
                    <div className="text-xs text-gray-500">{rule.collector_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    {rule.active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className="text-gray-600 hover:text-gray-900"
                      title={rule.active ? 'Disable' : 'Enable'}
                    >
                      {rule.active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleEdit(rule)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule)}
                      className="text-red-600 hover:text-red-900"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingRule ? 'Edit Auto-Ticket Rule' : 'Create Auto-Ticket Rule'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer {editingRule && '(cannot be changed)'}
                </label>
                {editingRule ? (
                  <div className="p-3 bg-gray-100 rounded-lg">
                    <div className="font-medium text-gray-900">{editingRule.customer_name}</div>
                    <div className="text-sm text-gray-500">{editingRule.customer_id}</div>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search customers..."
                        className="pl-10 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    {filteredCustomers.length > 0 && (
                      <div className="mt-2 border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <button
                            key={customer.customer_id}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, customer_id: customer.customer_id });
                              setSearchTerm(customer.customer_name);
                              setFilteredCustomers([]);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 border-b border-gray-200 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">{customer.customer_name}</div>
                            <div className="text-sm text-gray-500">{customer.customer_id}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {formData.customer_id && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-sm text-green-800">
                          Selected: {customers.find(c => c.customer_id === formData.customer_id)?.customer_name}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Minimum Days Old
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_days_old}
                    onChange={(e) => setFormData({ ...formData, min_days_old: parseInt(e.target.value) || 0 })}
                    required
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Invoices must be at least this old</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Days Old
                  </label>
                  <input
                    type="number"
                    min={formData.min_days_old + 1}
                    value={formData.max_days_old}
                    onChange={(e) => setFormData({ ...formData, max_days_old: parseInt(e.target.value) || 0 })}
                    required
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Invoices must be at most this old</p>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  This rule will find invoices dated between <strong>{formData.max_days_old} and {formData.min_days_old} days ago</strong> from today.
                  The date range updates daily.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign To Collector
                </label>
                <select
                  value={formData.assigned_collector_id}
                  onChange={(e) => setFormData({ ...formData, assigned_collector_id: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a collector</option>
                  {collectors.map((collector) => (
                    <option key={collector.id} value={collector.id}>
                      {collector.full_name} ({collector.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingRule(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.customer_id || !formData.assigned_collector_id}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
