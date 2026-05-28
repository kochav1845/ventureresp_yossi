import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Plus, Edit2, Trash2, Link as LinkIcon, RefreshCw, Calendar, Mail, User, Clock, PauseCircle, Users, Ticket, Type, CalendarDays, X } from 'lucide-react';
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
  schedule?: Array<{ day: number; times: string[] }>;
};

type EmailTemplate = {
  id: string;
  name: string;
  subject?: string;
  body?: string;
};

type Assignment = {
  id: string;
  customer_id: string;
  formula_id: string | null;
  template_id: string | null;
  custom_schedule: Array<{ day: number; times: string[] }> | null;
  custom_subject: string | null;
  custom_body: string | null;
  start_day_of_month: number;
  timezone: string;
  is_active: boolean;
  created_at: string;
  source_ticket_id?: string | null;
  source_ticket_number?: string | null;
  customer?: Customer;
  formula?: EmailFormula;
  template?: EmailTemplate;
};

type CustomerAssignmentsProps = {
  onBack?: () => void;
};

export default function CustomerAssignments({ onBack }: CustomerAssignmentsProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [formulas, setFormulas] = useState<EmailFormula[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [ticketContext, setTicketContext] = useState<{ ticketId: string; ticketNumber: string } | null>(null);

  const [showManageCustomers, setShowManageCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const [formData, setFormData] = useState({
    customer_id: '',
    formula_id: '',
    template_id: '',
    useManualSchedule: false,
    manualSchedule: [] as Array<{ day: number; times: string[] }>,
    useManualTemplate: false,
    customSubject: '',
    customBody: '',
  });
  const [newScheduleDay, setNewScheduleDay] = useState(1);
  const [newScheduleTime, setNewScheduleTime] = useState('09:00');

  const autoOpenHandled = useRef(false);

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

  useEffect(() => {
    if (autoOpenHandled.current || loading) return;
    const customerName = searchParams.get('customer_name');
    const customerId = searchParams.get('customer_id');
    const ticketId = searchParams.get('ticket_id');
    const ticketNumber = searchParams.get('ticket_number');

    if (!customerName) return;
    autoOpenHandled.current = true;

    if (ticketId && ticketNumber) {
      setTicketContext({ ticketId, ticketNumber });
    }

    (async () => {
      let matchedCustomer = customers.find(
        c => c.name.toLowerCase() === customerName.toLowerCase()
      );

      if (!matchedCustomer) {
        // Look up email from acumatica_customers
        let email = '';
        if (customerId) {
          const { data: acuCustomer } = await supabase
            .from('acumatica_customers')
            .select('customer_name, email_address')
            .eq('customer_id', customerId)
            .maybeSingle();
          email = acuCustomer?.email_address || '';
        }
        if (!email) {
          email = `${customerName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@pending.com`;
        }

        const { data: newCustomer, error } = await supabase
          .from('customers')
          .insert({ name: customerName, email })
          .select()
          .maybeSingle();

        if (!error && newCustomer) {
          matchedCustomer = newCustomer as Customer;
          setCustomers(prev => [...prev, matchedCustomer!]);
        } else if (error) {
          // May already exist with different casing, try to find by email or name pattern
          const { data: existing } = await supabase
            .from('customers')
            .select('id, name, email')
            .ilike('name', customerName)
            .maybeSingle();
          if (existing) {
            matchedCustomer = existing as Customer;
          }
        }
      }

      if (matchedCustomer) {
        setFormData(prev => ({ ...prev, customer_id: matchedCustomer!.id }));
        setShowForm(true);
      } else {
        // Still open the form even if customer couldn't be matched
        setShowForm(true);
      }

      setSearchParams({}, { replace: true });
    })();
  }, [loading, customers, searchParams]);

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
      if (formulasRes.error) throw formulasRes.error;
      if (templatesRes.error) throw templatesRes.error;

      // Fetch all customers via RPC (handles org filtering reliably)
      const { data: acuData, error: acuError } = await supabase.rpc('get_customer_picker_list').limit(10000);
      if (acuError) console.error('Error fetching customers:', acuError);
      const allAcuCustomers = acuData || [];

      // Build customer list from acumatica customers as primary source
      const emailCustomerMap = new Map((customersRes.data || []).map(c => [c.name.toLowerCase(), c]));
      const allCustomers: Customer[] = allAcuCustomers
        .map(ac => {
          const existing = emailCustomerMap.get(ac.customer_name.toLowerCase());
          if (existing) return existing;
          return {
            id: `acu_${ac.customer_id}`,
            name: ac.customer_name,
            email: ac.email_address || '',
          };
        });

      // Include any email-only customers not in acumatica
      const acuNames = new Set(allAcuCustomers.map(ac => ac.customer_name?.toLowerCase()));
      const emailOnlyCustomers = (customersRes.data || []).filter(c => !acuNames.has(c.name.toLowerCase()));
      const mergedCustomers = [...allCustomers, ...emailOnlyCustomers].sort((a, b) => a.name.localeCompare(b.name));

      const assignmentsWithDetails = (assignmentsRes.data || []).map((assignment) => {
        const customer = (customersRes.data || []).find(c => c.id === assignment.customer_id)
          || mergedCustomers.find(c => c.id === assignment.customer_id);
        const formula = formulasRes.data?.find(f => f.id === assignment.formula_id);
        const template = templatesRes.data?.find(t => t.id === assignment.template_id);
        return { ...assignment, customer, formula, template };
      });

      setAssignments(assignmentsWithDetails);
      setCustomers(mergedCustomers);
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
      useManualSchedule: false,
      manualSchedule: [],
      useManualTemplate: false,
      customSubject: '',
      customBody: '',
    });
    setShowForm(true);
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setFormData({
      customer_id: assignment.customer_id,
      formula_id: assignment.formula_id || '',
      template_id: assignment.template_id || '',
      useManualSchedule: !!assignment.custom_schedule,
      manualSchedule: assignment.custom_schedule || [],
      useManualTemplate: !!(assignment.custom_subject || assignment.custom_body),
      customSubject: assignment.custom_subject || '',
      customBody: assignment.custom_body || '',
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

  const handleAddScheduleDay = () => {
    const exists = formData.manualSchedule.find(s => s.day === newScheduleDay);
    if (exists) {
      if (!exists.times.includes(newScheduleTime)) {
        setFormData({
          ...formData,
          manualSchedule: formData.manualSchedule.map(s =>
            s.day === newScheduleDay ? { ...s, times: [...s.times, newScheduleTime].sort() } : s
          ),
        });
      }
    } else {
      setFormData({
        ...formData,
        manualSchedule: [...formData.manualSchedule, { day: newScheduleDay, times: [newScheduleTime] }]
          .sort((a, b) => a.day - b.day),
      });
    }
  };

  const handleRemoveScheduleEntry = (day: number, time?: string) => {
    if (time) {
      setFormData({
        ...formData,
        manualSchedule: formData.manualSchedule
          .map(s => s.day === day ? { ...s, times: s.times.filter(t => t !== time) } : s)
          .filter(s => s.times.length > 0),
      });
    } else {
      setFormData({
        ...formData,
        manualSchedule: formData.manualSchedule.filter(s => s.day !== day),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.customer_id) {
      alert('Please select a customer');
      return;
    }

    if (!formData.useManualSchedule && !formData.formula_id) {
      alert('Please select a formula or create a manual schedule');
      return;
    }

    if (formData.useManualSchedule && formData.manualSchedule.length === 0) {
      alert('Please add at least one schedule entry');
      return;
    }

    if (!formData.useManualTemplate && !formData.template_id) {
      alert('Please select a template or write custom content');
      return;
    }

    if (formData.useManualTemplate && !formData.customSubject) {
      alert('Please enter a subject line');
      return;
    }

    try {
      let resolvedCustomerId = formData.customer_id;

      if (resolvedCustomerId.startsWith('acu_')) {
        const selectedCustomer = customers.find(c => c.id === resolvedCustomerId);
        if (selectedCustomer) {
          const email = selectedCustomer.email || `${selectedCustomer.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@pending.com`;
          const { data: newCust, error: insertErr } = await supabase
            .from('customers')
            .insert({ name: selectedCustomer.name, email })
            .select()
            .maybeSingle();

          if (insertErr) {
            const { data: existing } = await supabase
              .from('customers')
              .select('id')
              .ilike('name', selectedCustomer.name)
              .maybeSingle();
            if (existing) {
              resolvedCustomerId = existing.id;
            } else {
              alert('Error creating customer: ' + insertErr.message);
              return;
            }
          } else if (newCust) {
            resolvedCustomerId = newCust.id;
          }
        }
      }

      const assignmentData: any = {
        customer_id: resolvedCustomerId,
        formula_id: formData.useManualSchedule ? null : formData.formula_id,
        template_id: formData.useManualTemplate ? null : formData.template_id,
        custom_schedule: formData.useManualSchedule ? formData.manualSchedule : null,
        custom_subject: formData.useManualTemplate ? formData.customSubject : null,
        custom_body: formData.useManualTemplate ? formData.customBody : null,
        start_day_of_month: 1,
        timezone: 'America/New_York',
      };

      if (ticketContext && !editingAssignment) {
        assignmentData.source_ticket_id = ticketContext.ticketId;
        assignmentData.source_ticket_number = ticketContext.ticketNumber;
      }

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

  const selectedCustomerForDisplay = customers.find(c => c.id === formData.customer_id);

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
            onClick={() => { setShowForm(false); setTicketContext(null); }}
            className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Assignments
          </button>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingAssignment ? 'Edit Assignment' : 'Create Email Schedule'}
            </h2>

            {ticketContext && !editingAssignment && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6 flex items-center gap-3">
                <Ticket className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-blue-300 text-sm font-medium">
                    Creating email schedule from Ticket #{ticketContext.ticketNumber}
                  </p>
                  <p className="text-blue-400/70 text-xs mt-0.5">
                    Choose a formula or set a manual schedule, then pick a template or write custom email content.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Customer Section - auto-selected when from ticket */}
              {ticketContext && formData.customer_id && selectedCustomerForDisplay ? (
                <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Customer</label>
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-blue-400" />
                    <div>
                      <p className="text-white font-semibold">{selectedCustomerForDisplay.name}</p>
                      {selectedCustomerForDisplay.email && (
                        <p className="text-slate-400 text-sm">{selectedCustomerForDisplay.email}</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
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
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Type to search customers..."
                    className="w-full px-4 py-2 mb-2 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <select
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    size={6}
                    disabled={customers.length === 0}
                  >
                    <option value="">Select a customer</option>
                    {customers
                      .filter(c => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.email?.toLowerCase().includes(customerSearch.toLowerCase()))
                      .slice(0, 100)
                      .map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}{customer.email ? ` (${customer.email})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Schedule Section - Formula OR Manual */}
              <div className="border border-slate-600 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <CalendarDays size={16} className="text-blue-400" />
                    Email Schedule *
                  </label>
                  <div className="flex bg-slate-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, useManualSchedule: false })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        !formData.useManualSchedule ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Use Formula
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, useManualSchedule: true })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        formData.useManualSchedule ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Manual Schedule
                    </button>
                  </div>
                </div>

                {!formData.useManualSchedule ? (
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
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Day of Month</label>
                        <select
                          value={newScheduleDay}
                          onChange={(e) => setNewScheduleDay(parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1">Time</label>
                        <input
                          type="time"
                          value={newScheduleTime}
                          onChange={(e) => setNewScheduleTime(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddScheduleDay}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {formData.manualSchedule.length > 0 && (
                      <div className="bg-slate-900/50 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                        {formData.manualSchedule.map((entry) => (
                          <div key={entry.day} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300 text-sm font-medium">Day {entry.day}:</span>
                              <div className="flex gap-1 flex-wrap">
                                {entry.times.map((time) => (
                                  <span
                                    key={time}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs border border-blue-500/30"
                                  >
                                    {time}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveScheduleEntry(entry.day, time)}
                                      className="text-blue-400 hover:text-red-400"
                                    >
                                      <X size={10} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveScheduleEntry(entry.day)}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {formData.manualSchedule.length === 0 && (
                      <p className="text-xs text-slate-500 italic">Add schedule entries above (e.g., Day 1 at 09:00, Day 15 at 14:00)</p>
                    )}
                  </div>
                )}
              </div>

              {/* Template Section - Template OR Manual Content */}
              <div className="border border-slate-600 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Type size={16} className="text-blue-400" />
                    Email Content *
                  </label>
                  <div className="flex bg-slate-700 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, useManualTemplate: false })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        !formData.useManualTemplate ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Use Template
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, useManualTemplate: true })}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        formData.useManualTemplate ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Write Custom
                    </button>
                  </div>
                </div>

                {!formData.useManualTemplate ? (
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
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Subject *</label>
                      <input
                        type="text"
                        value={formData.customSubject}
                        onChange={(e) => setFormData({ ...formData, customSubject: e.target.value })}
                        placeholder="e.g., Payment Reminder - {customer_name}"
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Body</label>
                      <textarea
                        value={formData.customBody}
                        onChange={(e) => setFormData({ ...formData, customBody: e.target.value })}
                        placeholder="Write your email body here. You can use variables like {customer_name}, {balance}, {invoice_table}, {month}..."
                        rows={6}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Variables: {'{customer_name}'}, {'{balance}'}, {'{invoice_table}'}, {'{month}'}, {'{year}'}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {editingAssignment ? 'Update Assignment' : 'Create Email Schedule'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setTicketContext(null); }}
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
