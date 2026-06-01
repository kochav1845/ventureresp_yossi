import { useState } from 'react';
import { X, Plus, Trash2, Search, Loader2, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import {
  ConditionType,
  Operator,
  ActionType,
  AppliesTo,
  RuleCondition,
  RuleTarget,
  AutoTicketRule,
  Customer,
  Collector,
  TicketType,
  CONDITION_TYPE_LABELS,
  CONDITION_TYPE_DESCRIPTIONS,
  OPERATOR_LABELS,
  ACTION_TYPE_LABELS,
} from './types';

interface RuleFormModalProps {
  isOpen: boolean;
  editingRule: AutoTicketRule | null;
  collectors: Collector[];
  ticketTypes: TicketType[];
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_CONDITION: RuleCondition = {
  condition_type: 'balance_threshold',
  operator: 'gt',
  value_numeric: 100000,
  value_numeric_max: null,
  value_text: '',
  time_unit: 'days',
  date_reference: 'due_date',
};

export default function RuleFormModal({
  isOpen,
  editingRule,
  collectors,
  ticketTypes,
  onClose,
  onSaved,
}: RuleFormModalProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const [ruleName, setRuleName] = useState(editingRule?.rule_name || '');
  const [description, setDescription] = useState(editingRule?.description || '');
  const [actionType, setActionType] = useState<ActionType>(editingRule?.action_type || 'ticket_only');
  const [emailRecipients, setEmailRecipients] = useState<string[]>(editingRule?.email_recipients || []);
  const [newEmail, setNewEmail] = useState('');
  const [notifyAdmin, setNotifyAdmin] = useState(editingRule?.notify_admin || false);
  const [priority, setPriority] = useState(editingRule?.priority || 'medium');
  const [ticketTypeId, setTicketTypeId] = useState(editingRule?.ticket_type_id || '');
  const [assignedCollectorId, setAssignedCollectorId] = useState(editingRule?.assigned_collector_id || '');
  const [logicOperator, setLogicOperator] = useState(editingRule?.logic_operator || 'AND');
  const [appliesTo, setAppliesTo] = useState<AppliesTo>(editingRule?.applies_to || 'all');

  const [conditions, setConditions] = useState<RuleCondition[]>(
    editingRule?.conditions?.length ? editingRule.conditions : [{ ...DEFAULT_CONDITION }]
  );

  const [targets, setTargets] = useState<RuleTarget[]>(editingRule?.targets || []);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const showEmailFields = actionType === 'email_only' || actionType === 'ticket_and_email';
  const showTicketFields = actionType === 'ticket_only' || actionType === 'ticket_and_email';

  const addCondition = () => {
    setConditions([...conditions, { ...DEFAULT_CONDITION }]);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, updates: Partial<RuleCondition>) => {
    setConditions(conditions.map((c, i) => i === idx ? { ...c, ...updates } : c));
  };

  const addEmailRecipient = () => {
    if (newEmail && /\S+@\S+\.\S+/.test(newEmail) && !emailRecipients.includes(newEmail)) {
      setEmailRecipients([...emailRecipients, newEmail]);
      setNewEmail('');
    }
  };

  const removeEmailRecipient = (email: string) => {
    setEmailRecipients(emailRecipients.filter(e => e !== email));
  };

  const searchCustomers = async (term: string) => {
    if (term.length < 2) {
      setCustomerResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('acumatica_customers')
        .select('customer_id, customer_name')
        .or(`customer_name.ilike.%${term}%,customer_id.ilike.%${term}%`)
        .order('customer_name')
        .limit(50);

      if (error) throw error;
      setCustomerResults(data || []);
    } catch {
      setCustomerResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const addTarget = (customer: Customer) => {
    const targetType = appliesTo === 'exclude' ? 'exclude' : 'include';
    if (!targets.find(t => t.customer_id === customer.customer_id)) {
      setTargets([...targets, {
        target_type: targetType,
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
      }]);
    }
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const removeTarget = (customerId: string) => {
    setTargets(targets.filter(t => t.customer_id !== customerId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ruleName.trim()) {
      showToast('Please enter a rule name', 'error');
      return;
    }
    if (conditions.length === 0) {
      showToast('Please add at least one condition', 'error');
      return;
    }
    if (showTicketFields && !assignedCollectorId) {
      showToast('Please select a collector to assign tickets', 'error');
      return;
    }
    if (appliesTo === 'specific' && targets.length === 0) {
      showToast('Please add at least one customer for "Specific Customers" scope', 'error');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const ruleData: any = {
        rule_name: ruleName.trim(),
        description: description.trim() || null,
        action_type: actionType,
        email_recipients: emailRecipients,
        notify_admin: notifyAdmin,
        priority,
        ticket_type_id: ticketTypeId || null,
        assigned_collector_id: assignedCollectorId || collectors[0]?.id,
        logic_operator: logicOperator,
        applies_to: appliesTo,
        condition_logic: 'advanced',
        rule_type: 'advanced',
        active: true,
      };

      if (appliesTo === 'specific' && targets.length === 1) {
        ruleData.customer_id = targets[0].customer_id;
      } else if (appliesTo === 'all') {
        ruleData.customer_id = '__ALL__';
      } else {
        ruleData.customer_id = appliesTo === 'exclude' ? '__EXCLUDE__' : '__MULTI__';
      }

      let ruleId: string;

      if (editingRule) {
        const { error } = await supabase
          .from('auto_ticket_rules')
          .update(ruleData)
          .eq('id', editingRule.id);
        if (error) throw error;
        ruleId = editingRule.id;

        await supabase.from('auto_ticket_rule_conditions').delete().eq('rule_id', ruleId);
        await supabase.from('auto_ticket_rule_targets').delete().eq('rule_id', ruleId);
      } else {
        ruleData.created_by = user?.id;
        const { data, error } = await supabase
          .from('auto_ticket_rules')
          .insert(ruleData)
          .select('id')
          .single();
        if (error) throw error;
        ruleId = data.id;
      }

      if (conditions.length > 0) {
        const conditionInserts = conditions.map(c => ({
          rule_id: ruleId,
          condition_type: c.condition_type,
          operator: c.operator,
          value_numeric: c.value_numeric,
          value_numeric_max: c.value_numeric_max,
          value_text: c.value_text || null,
          time_unit: c.time_unit,
          date_reference: c.date_reference,
        }));
        const { error } = await supabase.from('auto_ticket_rule_conditions').insert(conditionInserts);
        if (error) throw error;
      }

      if (targets.length > 0 && appliesTo !== 'all') {
        const targetInserts = targets.map(t => ({
          rule_id: ruleId,
          target_type: t.target_type,
          customer_id: t.customer_id,
        }));
        const { error } = await supabase.from('auto_ticket_rule_targets').insert(targetInserts);
        if (error) throw error;
      }

      showToast(editingRule ? 'Rule updated successfully' : 'Rule created successfully', 'success');
      onSaved();
      onClose();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getOperatorsForCondition = (type: ConditionType): Operator[] => {
    switch (type) {
      case 'payment_pattern_deviation':
      case 'payment_frequency_change':
        return ['gt', 'gte', 'between'];
      case 'payment_amount_drop':
        return ['pct_drop', 'gt', 'lt'];
      case 'overdue_percentage':
        return ['gt', 'gte', 'lt', 'lte', 'between'];
      default:
        return ['gt', 'lt', 'gte', 'lte', 'eq', 'between'];
    }
  };

  const getValueLabel = (type: ConditionType): string => {
    switch (type) {
      case 'balance_threshold':
      case 'invoice_amount_threshold':
      case 'total_overdue_amount':
        return 'Amount ($)';
      case 'payment_amount_drop':
        return 'Drop threshold (% or $)';
      case 'invoice_count_overdue':
        return 'Number of invoices';
      case 'invoice_age_days':
      case 'days_since_last_payment':
      case 'payment_pattern_deviation':
      case 'payment_frequency_change':
        return 'Days';
      case 'overdue_percentage':
        return 'Percentage (%)';
      default:
        return 'Value';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Define conditions that automatically create tickets, send emails, or set reminders
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="divide-y divide-gray-100">
          {/* Basic Info */}
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Rule Name</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., High Balance Alert"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this rule monitors..."
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Conditions */}
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Conditions</h3>
                <p className="text-xs text-gray-500 mt-0.5">Define what triggers this rule</p>
              </div>
              <div className="flex items-center gap-3">
                {conditions.length > 1 && (
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-600">Match:</span>
                    <select
                      value={logicOperator}
                      onChange={(e) => setLogicOperator(e.target.value)}
                      className="text-xs font-semibold border-0 bg-transparent focus:ring-0 p-0 pr-6"
                    >
                      <option value="AND">ALL conditions (AND)</option>
                      <option value="OR">ANY condition (OR)</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={addCondition}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Condition
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {conditions.map((condition, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 relative group">
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCondition(idx)}
                      className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {idx > 0 && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                        logicOperator === 'AND'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-teal-50 text-teal-700 border-teal-200'
                      }`}>
                        {logicOperator}
                      </span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Condition Type</label>
                      <select
                        value={condition.condition_type}
                        onChange={(e) => updateCondition(idx, { condition_type: e.target.value as ConditionType })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {(Object.keys(CONDITION_TYPE_LABELS) as ConditionType[]).map(type => (
                          <option key={type} value={type}>{CONDITION_TYPE_LABELS[type]}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {CONDITION_TYPE_DESCRIPTIONS[condition.condition_type]}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Operator</label>
                        <select
                          value={condition.operator}
                          onChange={(e) => updateCondition(idx, { operator: e.target.value as Operator })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {getOperatorsForCondition(condition.condition_type).map(op => (
                            <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          {getValueLabel(condition.condition_type)}
                        </label>
                        <input
                          type="number"
                          value={condition.value_numeric ?? ''}
                          onChange={(e) => updateCondition(idx, { value_numeric: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="Value"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      {condition.operator === 'between' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Max Value</label>
                          <input
                            type="number"
                            value={condition.value_numeric_max ?? ''}
                            onChange={(e) => updateCondition(idx, { value_numeric_max: e.target.value ? parseFloat(e.target.value) : null })}
                            placeholder="Max"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      )}
                      {(condition.condition_type === 'invoice_age_days' || condition.condition_type === 'days_since_last_payment') && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Measured From</label>
                          <select
                            value={condition.date_reference}
                            onChange={(e) => updateCondition(idx, { date_reference: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="due_date">Invoice Due Date</option>
                            <option value="invoice_date">Invoice Create Date</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Scope */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Customer Scope</h3>
              <p className="text-xs text-gray-500 mt-0.5">Which customers does this rule apply to?</p>
            </div>

            <div className="flex gap-3">
              {(['all', 'specific', 'exclude'] as AppliesTo[]).map(scope => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => {
                    setAppliesTo(scope);
                    if (scope === 'all') setTargets([]);
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                    appliesTo === scope
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {scope === 'all' && 'All Customers'}
                  {scope === 'specific' && 'Specific Customers'}
                  {scope === 'exclude' && 'All Except...'}
                </button>
              ))}
            </div>

            {appliesTo !== 'all' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      searchCustomers(e.target.value);
                    }}
                    placeholder={appliesTo === 'exclude' ? 'Search customers to exclude...' : 'Search customers to include...'}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-blue-500 animate-spin" />
                  )}
                </div>

                {customerResults.length > 0 && (
                  <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                    {customerResults.map(customer => (
                      <button
                        key={customer.customer_id}
                        type="button"
                        onClick={() => addTarget(customer)}
                        disabled={targets.some(t => t.customer_id === customer.customer_id)}
                        className="w-full text-left px-3.5 py-2 hover:bg-gray-50 disabled:bg-gray-100 disabled:opacity-50 text-sm"
                      >
                        <span className="font-medium">{customer.customer_name}</span>
                        <span className="text-gray-500 ml-2">{customer.customer_id}</span>
                      </button>
                    ))}
                  </div>
                )}

                {targets.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {targets.map(target => (
                      <span
                        key={target.customer_id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                          target.target_type === 'exclude'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {target.customer_name || target.customer_id}
                        <button
                          type="button"
                          onClick={() => removeTarget(target.customer_id)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {appliesTo === 'exclude' && targets.length > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-800">
                      This rule will apply to all customers <strong>except</strong> the {targets.length} listed above.
                    </p>
                  </div>
                )}
              </div>
            )}

            {appliesTo === 'all' && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-800">
                  This rule will be evaluated against <strong>all customers</strong> in the system.
                </p>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="px-6 py-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Action</h3>
              <p className="text-xs text-gray-500 mt-0.5">What happens when the rule triggers?</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.keys(ACTION_TYPE_LABELS) as ActionType[]).map(action => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setActionType(action)}
                  className={`py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-center ${
                    actionType === action
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {ACTION_TYPE_LABELS[action]}
                </button>
              ))}
            </div>

            {showTicketFields && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Assign Ticket To</label>
                  <select
                    value={assignedCollectorId}
                    onChange={(e) => setAssignedCollectorId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required={showTicketFields}
                  >
                    <option value="">Select collector...</option>
                    {collectors.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Ticket Type</label>
                  <select
                    value={ticketTypeId}
                    onChange={(e) => setTicketTypeId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Default (Overdue Payment)</option>
                    {ticketTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {showEmailFields && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyAdmin}
                      onChange={(e) => setNotifyAdmin(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Notify admin(s)</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Additional Email Recipients</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmailRecipient())}
                      placeholder="email@example.com"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addEmailRecipient}
                      className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {emailRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {emailRecipients.map(email => (
                        <span key={email} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full text-xs">
                          {email}
                          <button type="button" onClick={() => removeEmailRecipient(email)} className="hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 flex items-center justify-end gap-3 bg-gray-50 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
