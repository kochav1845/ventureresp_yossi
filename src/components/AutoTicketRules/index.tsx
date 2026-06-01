import { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, Edit2, Trash2, Power, PowerOff, Play, Loader2,
  Clock, Save, Check, Zap, Mail, Bell, Ticket, Filter, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import RuleFormModal from './RuleFormModal';
import {
  AutoTicketRule,
  Collector,
  TicketType,
  RuleCondition,
  RuleTarget,
  CONDITION_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  ActionType,
} from './types';

interface AutoTicketRulesPageProps {
  onBack: () => void;
}

export default function AutoTicketRulesPage({ onBack }: AutoTicketRulesPageProps) {
  const [rules, setRules] = useState<AutoTicketRule[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTicketRule | null>(null);
  const [processing, setProcessing] = useState(false);

  const [scheduleHour, setScheduleHour] = useState(6);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const { showToast } = useToast();

  const EST_OFFSET = -5;
  const utcToEst = (utcHour: number) => {
    let estHour = utcHour + EST_OFFSET;
    if (estHour < 0) estHour += 24;
    if (estHour >= 24) estHour -= 24;
    return estHour;
  };
  const estToUtc = (estHour: number) => {
    let utcHour = estHour - EST_OFFSET;
    if (utcHour < 0) utcHour += 24;
    if (utcHour >= 24) utcHour -= 24;
    return utcHour;
  };

  const estHour = utcToEst(scheduleHour);
  const estHour12 = estHour === 0 ? 12 : estHour > 12 ? estHour - 12 : estHour;
  const estAmPm = estHour < 12 ? 'AM' : 'PM';

  const handleEstHourChange = (hour12: number, amPm: string) => {
    let hour24 = hour12;
    if (amPm === 'AM') {
      hour24 = hour12 === 12 ? 0 : hour12;
    } else {
      hour24 = hour12 === 12 ? 12 : hour12 + 12;
    }
    setScheduleHour(estToUtc(hour24));
  };

  const formatEstTime = () => `${estHour12}:${String(scheduleMinute).padStart(2, '0')} ${estAmPm} EST`;

  useEffect(() => {
    fetchRules();
    fetchCollectors();
    fetchTicketTypes();
    fetchSchedule();
  }, []);

  const fetchRules = async () => {
    try {
      const { data: rulesData, error } = await supabase
        .from('auto_ticket_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!rulesData || rulesData.length === 0) {
        setRules([]);
        setLoading(false);
        return;
      }

      const customerIds = [...new Set(rulesData.map(r => r.customer_id?.trim()))].filter(Boolean);
      const collectorIds = [...new Set(rulesData.map(r => r.assigned_collector_id))];
      const ruleIds = rulesData.map(r => r.id);

      const [customersResult, collectorsResult, conditionsResult, targetsResult] = await Promise.all([
        supabase.from('acumatica_customers').select('customer_id, customer_name').in('customer_id', customerIds),
        supabase.from('user_profiles').select('id, full_name, email').in('id', collectorIds),
        supabase.from('auto_ticket_rule_conditions').select('*').in('rule_id', ruleIds),
        supabase.from('auto_ticket_rule_targets').select('*').in('rule_id', ruleIds),
      ]);

      const collectorsMap = new Map(collectorsResult.data?.map(c => [c.id, c]) || []);
      const customersMap = new Map(customersResult.data?.map(c => [c.customer_id, c]) || []);

      const conditionsByRule = new Map<string, RuleCondition[]>();
      (conditionsResult.data || []).forEach((c: any) => {
        if (!conditionsByRule.has(c.rule_id)) conditionsByRule.set(c.rule_id, []);
        conditionsByRule.get(c.rule_id)!.push(c);
      });

      const targetsByRule = new Map<string, RuleTarget[]>();
      (targetsResult.data || []).forEach((t: any) => {
        if (!targetsByRule.has(t.rule_id)) targetsByRule.set(t.rule_id, []);
        targetsByRule.get(t.rule_id)!.push({
          ...t,
          customer_name: customersMap.get(t.customer_id)?.customer_name || t.customer_id,
        });
      });

      const enrichedRules = rulesData.map((rule: any) => {
        const collector = collectorsMap.get(rule.assigned_collector_id);
        const customer = customersMap.get(rule.customer_id?.trim());

        return {
          ...rule,
          condition_logic: rule.condition_logic || (rule.rule_type === 'payment_recency' ? 'payment_only' : 'invoice_only'),
          customer_name: customer?.customer_name || rule.customer_id,
          collector_name: collector?.full_name || 'Unknown',
          collector_email: collector?.email || '',
          conditions: conditionsByRule.get(rule.id) || [],
          targets: targetsByRule.get(rule.id) || [],
        };
      });

      setRules(enrichedRules);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
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

  const fetchTicketTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_type_options')
        .select('id, name, color')
        .order('name');
      if (error) throw error;
      setTicketTypes(data || []);
    } catch {
      setTicketTypes([]);
    }
  };

  const fetchSchedule = async () => {
    try {
      const { data, error } = await supabase.rpc('get_auto_ticket_cron_schedule');
      if (error) throw error;
      if (data && data.length > 0) {
        const parts = data[0].schedule.split(' ');
        setScheduleMinute(parseInt(parts[0]) || 0);
        setScheduleHour(parseInt(parts[1]) || 0);
      }
    } catch {
      // ignore
    }
  };

  const saveSchedule = async () => {
    setScheduleLoading(true);
    try {
      const { error } = await supabase.rpc('update_auto_ticket_cron_schedule', {
        p_hour: scheduleHour,
        p_minute: scheduleMinute,
      });
      if (error) throw error;
      showToast(`Schedule updated to ${formatEstTime()} daily`, 'success');
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2000);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleTestRun = async () => {
    if (!confirm('This will process all active rules and create/update tickets. Continue?')) return;
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-auto-ticket-rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to process rules');
      showToast(
        `Processed ${result.results.processed} rules. Created ${result.results.tickets_created} tickets, updated ${result.results.tickets_updated} tickets.`,
        'success'
      );
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setProcessing(false);
    }
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
    if (!confirm('Are you sure you want to delete this rule? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('auto_ticket_rules').delete().eq('id', rule.id);
      if (error) throw error;
      showToast('Rule deleted', 'success');
      fetchRules();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleEdit = (rule: AutoTicketRule) => {
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const getActionIcon = (action: ActionType) => {
    switch (action) {
      case 'ticket_only': return <Ticket className="w-3.5 h-3.5" />;
      case 'email_only': return <Mail className="w-3.5 h-3.5" />;
      case 'ticket_and_email': return <Zap className="w-3.5 h-3.5" />;
      case 'reminder_only': return <Bell className="w-3.5 h-3.5" />;
      default: return <Ticket className="w-3.5 h-3.5" />;
    }
  };

  const getScopeLabel = (rule: AutoTicketRule) => {
    if (rule.applies_to === 'all' || rule.customer_id === '__ALL__') return 'All customers';
    if (rule.applies_to === 'exclude' || rule.customer_id === '__EXCLUDE__') {
      return `All except ${rule.targets?.length || 0}`;
    }
    if (rule.targets && rule.targets.length > 1) {
      return `${rule.targets.length} customers`;
    }
    return rule.customer_name || rule.customer_id;
  };

  const getConditionSummary = (rule: AutoTicketRule) => {
    if (rule.condition_logic === 'advanced' && rule.conditions && rule.conditions.length > 0) {
      return rule.conditions.map((c, i) => (
        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 mr-1 mb-1">
          {CONDITION_TYPE_LABELS[c.condition_type as keyof typeof CONDITION_TYPE_LABELS] || c.condition_type}
        </span>
      ));
    }
    const parts: string[] = [];
    if (rule.condition_logic === 'invoice_only' || rule.condition_logic === 'both_and' || rule.condition_logic === 'both_or') {
      parts.push(`Invoices ${rule.min_days_old}-${rule.max_days_old} days`);
    }
    if (rule.condition_logic === 'payment_only' || rule.condition_logic === 'both_and' || rule.condition_logic === 'both_or') {
      parts.push(`No payment ${rule.check_payment_within_days_min}-${rule.check_payment_within_days_max} days`);
    }
    return parts.map((p, i) => (
      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 mr-1 mb-1">
        {p}
      </span>
    ));
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Auto-Alert Rules</h1>
            <p className="text-gray-600 mt-0.5 text-sm">
              Create comprehensive rules to automatically monitor customers and trigger actions
            </p>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleTestRun}
            disabled={processing}
            className="flex items-center space-x-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Run Now</span>
          </button>
          <button
            onClick={() => { setEditingRule(null); setIsModalOpen(true); }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>New Rule</span>
          </button>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Daily Evaluation</h3>
              <p className="text-xs text-gray-500">Rules are evaluated automatically at this time (EST)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <select
                value={estHour12}
                onChange={(e) => handleEstHourChange(parseInt(e.target.value), estAmPm)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-gray-500 font-bold">:</span>
              <select
                value={scheduleMinute}
                onChange={(e) => setScheduleMinute(parseInt(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <select
                value={estAmPm}
                onChange={(e) => handleEstHourChange(estHour12, e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
            <button
              onClick={saveSchedule}
              disabled={scheduleLoading}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                scheduleSaved
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {scheduleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : scheduleSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {scheduleSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-500">Total Rules</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rules.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-gray-500">Active</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rules.filter(r => r.active).length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-gray-500">High Priority</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rules.filter(r => r.priority === 'high' || r.priority === 'urgent').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-gray-500">Email Alerts</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rules.filter(r => r.action_type === 'email_only' || r.action_type === 'ticket_and_email').length}</p>
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No rules configured</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
            Create rules to automatically monitor customer behavior and trigger alerts when conditions are met.
          </p>
          <button
            onClick={() => { setEditingRule(null); setIsModalOpen(true); }}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Create your first rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white rounded-xl border border-gray-200 p-5 transition-all hover:shadow-sm ${!rule.active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {rule.rule_name || rule.customer_name || 'Unnamed Rule'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      rule.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      rule.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      rule.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {rule.priority}
                    </span>
                    {!rule.active && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase">
                        Disabled
                      </span>
                    )}
                  </div>

                  {rule.description && (
                    <p className="text-xs text-gray-500 mb-2 line-clamp-1">{rule.description}</p>
                  )}

                  <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-xs">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <span className="font-medium">Scope:</span>
                      <span>{getScopeLabel(rule)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      {getActionIcon(rule.action_type || 'ticket_only')}
                      <span>{ACTION_TYPE_LABELS[rule.action_type as ActionType] || 'Ticket Only'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <span className="font-medium">Assigned:</span>
                      <span>{rule.collector_name}</span>
                    </div>
                    {rule.conditions && rule.conditions.length > 1 && (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <span className="font-medium">Logic:</span>
                        <span className={`font-semibold ${rule.logic_operator === 'AND' ? 'text-orange-600' : 'text-teal-600'}`}>
                          {rule.logic_operator}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap">
                    {getConditionSummary(rule)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`p-2 rounded-lg transition-colors ${rule.active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                    title={rule.active ? 'Disable' : 'Enable'}
                  >
                    {rule.active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <RuleFormModal
        isOpen={isModalOpen}
        editingRule={editingRule}
        collectors={collectors}
        ticketTypes={ticketTypes}
        onClose={() => { setIsModalOpen(false); setEditingRule(null); }}
        onSaved={fetchRules}
      />
    </div>
  );
}
