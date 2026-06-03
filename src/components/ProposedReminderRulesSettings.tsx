import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Save, Trash2, Edit2, X, Sparkles, Bot,
  Tag, AtSign, Paperclip, Users, Lightbulb, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type RuleType =
  | 'keyword_match'
  | 'intent_match'
  | 'sender_domain'
  | 'has_attachments'
  | 'customer_attribute'
  | 'gpt_prompt';

type AssigneeStrategy = 'customer_collector' | 'default_user';

type Rule = {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  rule_type: RuleType;
  conditions: Record<string, any>;
  assignee_strategy: AssigneeStrategy;
  default_assignee_id: string | null;
  offset_days: number;
  offset_hours: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reminder_type: 'call' | 'email' | 'meeting' | 'payment' | 'follow_up' | 'general';
  title_template: string;
  description_template: string | null;
  gpt_prompt: string | null;
  gpt_model: string | null;
  priority_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type UserOption = {
  id: string;
  full_name: string | null;
  email: string;
};

const RULE_TYPE_INFO: Record<RuleType, { label: string; icon: any; description: string }> = {
  keyword_match: { label: 'Keyword Match', icon: Tag, description: 'Trigger when subject or body contains any of the listed keywords.' },
  intent_match: { label: 'Detected Intent', icon: Sparkles, description: 'Trigger when the GPT-detected intent matches one of the listed intents.' },
  sender_domain: { label: 'Sender Domain', icon: AtSign, description: 'Trigger when the sender email is from one of the listed domains.' },
  has_attachments: { label: 'Has Attachments', icon: Paperclip, description: 'Trigger when the email has any attachments.' },
  customer_attribute: { label: 'Matched Customer', icon: Users, description: 'Trigger only when the email is matched to a known customer.' },
  gpt_prompt: { label: 'Custom GPT Prompt', icon: Bot, description: 'Use GPT with a custom prompt to decide whether a reminder is needed.' },
};

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;
const REMINDER_TYPE_OPTIONS = ['call', 'email', 'meeting', 'payment', 'follow_up', 'general'] as const;

const TEMPLATE_TIPS = [
  '{sender_email}', '{subject}', '{customer_name}', '{invoice_reference}',
];

export default function ProposedReminderRulesSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadRules();
    loadUsers();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('proposed_reminder_rules')
        .select('*')
        .order('priority_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRules((data as any) || []);
    } catch (err) {
      console.error('Error loading rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .order('full_name');
    setUsers((data as any) || []);
  };

  const handleToggle = async (rule: Rule) => {
    const { error } = await supabase
      .from('proposed_reminder_rules')
      .update({ enabled: !rule.enabled })
      .eq('id', rule.id);
    if (error) {
      alert('Failed to toggle rule');
      return;
    }
    await loadRules();
  };

  const handleDelete = async (rule: Rule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    const { error } = await supabase
      .from('proposed_reminder_rules')
      .delete()
      .eq('id', rule.id);
    if (error) {
      alert('Failed to delete rule');
      return;
    }
    await loadRules();
  };

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setShowForm(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-300" />
                Proposed Reminder Rules
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Configure how incoming emails are turned into proposed reminders.
              </p>
            </div>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Rule
          </button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-100">
            <p className="font-medium">How it works</p>
            <p className="text-amber-200/80 mt-1">
              When an inbound email is analyzed, every enabled rule is evaluated in order of priority.
              Matching rules create a pending proposed reminder for the customer's collector (or your
              chosen fallback user). Use templates like {'{customer_name}'} or {'{invoice_reference}'} in
              titles and descriptions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-12 text-center">
            <Sparkles className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-300 text-lg font-medium">No rules configured yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Create your first rule to start auto-proposing reminders from incoming emails.
            </p>
            <button
              onClick={openNew}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => {
              const info = RULE_TYPE_INFO[rule.rule_type] || RULE_TYPE_INFO.keyword_match;
              const Icon = info.icon;
              const isExpanded = expandedId === rule.id;
              return (
                <div
                  key={rule.id}
                  className={`bg-slate-800 rounded-lg border transition-colors ${
                    rule.enabled ? 'border-slate-700' : 'border-slate-800 opacity-60'
                  }`}
                >
                  <div className="p-4 flex items-start gap-4">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className={`p-2 rounded-lg shrink-0 ${
                      rule.enabled ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-medium truncate">{rule.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                          {info.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                          Priority {rule.priority_order}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-sm text-slate-400 mt-1">{rule.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggle(rule)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-700 peer-checked:bg-emerald-600 rounded-full relative transition-colors">
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                            rule.enabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </div>
                      </label>
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 ml-12 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Title template</p>
                        <p className="text-slate-200 font-mono text-xs bg-slate-900 rounded p-2 break-all">
                          {rule.title_template}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Schedule offset</p>
                        <p className="text-slate-200 text-xs">
                          +{rule.offset_days} days, +{rule.offset_hours} hours from received
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Conditions</p>
                        <pre className="text-slate-200 font-mono text-xs bg-slate-900 rounded p-2 overflow-auto max-h-32">
{JSON.stringify(rule.conditions, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Assignee</p>
                        <p className="text-slate-200 text-xs">
                          {rule.assignee_strategy === 'customer_collector'
                            ? "Customer's assigned collector (fallback to default user)"
                            : 'Default user only'}
                        </p>
                      </div>
                      {rule.rule_type === 'gpt_prompt' && rule.gpt_prompt && (
                        <div className="col-span-2">
                          <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">GPT Prompt</p>
                          <p className="text-slate-200 text-xs bg-slate-900 rounded p-2 whitespace-pre-wrap">
                            {rule.gpt_prompt}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <RuleFormModal
          rule={editing}
          users={users}
          currentUserId={user?.id}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); loadRules(); }}
        />
      )}
    </div>
  );
}

type RuleFormProps = {
  rule: Rule | null;
  users: UserOption[];
  currentUserId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
};

function RuleFormModal({ rule, users, currentUserId, onClose, onSaved }: RuleFormProps) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [ruleType, setRuleType] = useState<RuleType>(rule?.rule_type || 'keyword_match');
  const [keywords, setKeywords] = useState<string>(
    Array.isArray(rule?.conditions?.keywords) ? rule.conditions.keywords.join(', ') : ''
  );
  const [intents, setIntents] = useState<string>(
    Array.isArray(rule?.conditions?.intents) ? rule.conditions.intents.join(', ') : ''
  );
  const [domains, setDomains] = useState<string>(
    Array.isArray(rule?.conditions?.domains) ? rule.conditions.domains.join(', ') : ''
  );
  const [requiresMatchedCustomer, setRequiresMatchedCustomer] = useState<boolean>(
    rule?.conditions?.requires_matched_customer ?? true
  );

  const [assigneeStrategy, setAssigneeStrategy] = useState<AssigneeStrategy>(
    rule?.assignee_strategy || 'customer_collector'
  );
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string>(
    rule?.default_assignee_id || ''
  );
  const [offsetDays, setOffsetDays] = useState<number>(rule?.offset_days ?? 1);
  const [offsetHours, setOffsetHours] = useState<number>(rule?.offset_hours ?? 0);
  const [priority, setPriority] = useState(rule?.priority || 'medium');
  const [reminderTypeVal, setReminderTypeVal] = useState(rule?.reminder_type || 'follow_up');
  const [titleTemplate, setTitleTemplate] = useState(
    rule?.title_template || 'Follow up on email from {sender_email}'
  );
  const [descriptionTemplate, setDescriptionTemplate] = useState(rule?.description_template || '');
  const [gptPrompt, setGptPrompt] = useState(rule?.gpt_prompt || '');
  const [gptModel, setGptModel] = useState(rule?.gpt_model || 'gpt-4o-mini');
  const [priorityOrder, setPriorityOrder] = useState<number>(rule?.priority_order ?? 100);
  const [saving, setSaving] = useState(false);

  const buildConditions = (): Record<string, any> => {
    switch (ruleType) {
      case 'keyword_match':
        return { keywords: keywords.split(',').map(s => s.trim()).filter(Boolean) };
      case 'intent_match':
        return { intents: intents.split(',').map(s => s.trim()).filter(Boolean) };
      case 'sender_domain':
        return { domains: domains.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean) };
      case 'has_attachments':
        return {};
      case 'customer_attribute':
        return { requires_matched_customer: requiresMatchedCustomer };
      case 'gpt_prompt':
        return {};
      default:
        return {};
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please name the rule');
      return;
    }
    if (!titleTemplate.trim()) {
      alert('Please enter a title template');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || '',
        enabled,
        rule_type: ruleType,
        conditions: buildConditions(),
        assignee_strategy: assigneeStrategy,
        default_assignee_id: defaultAssigneeId || null,
        offset_days: Math.max(0, Number(offsetDays) || 0),
        offset_hours: Math.max(0, Number(offsetHours) || 0),
        priority,
        reminder_type: reminderTypeVal,
        title_template: titleTemplate.trim(),
        description_template: descriptionTemplate.trim() || '',
        gpt_prompt: ruleType === 'gpt_prompt' ? gptPrompt.trim() : '',
        gpt_model: ruleType === 'gpt_prompt' ? gptModel : 'gpt-4o-mini',
        priority_order: Math.max(0, Number(priorityOrder) || 0),
        created_by: currentUserId || null,
      };

      if (rule) {
        const { error } = await supabase
          .from('proposed_reminder_rules')
          .update(payload)
          .eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('proposed_reminder_rules')
          .insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (err: any) {
      console.error('Error saving rule:', err);
      alert(`Failed to save rule: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-xl font-bold text-white">{rule ? 'Edit Rule' : 'New Rule'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-slate-300 mb-1">Rule name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Payment promised follow-up"
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-slate-300 mb-1">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Rule type</label>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as RuleType)}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                {Object.entries(RULE_TYPE_INFO).map(([key, info]) => (
                  <option key={key} value={key}>{info.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">{RULE_TYPE_INFO[ruleType].description}</p>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Priority order (lower runs first)</label>
              <input
                type="number"
                min={0}
                value={priorityOrder}
                onChange={(e) => setPriorityOrder(Number(e.target.value))}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {ruleType === 'keyword_match' && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">Keywords (comma separated)</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="payment, invoice, overdue"
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {ruleType === 'intent_match' && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">Intents (comma separated)</label>
              <input
                type="text"
                value={intents}
                onChange={(e) => setIntents(e.target.value)}
                placeholder="payment_promise, dispute, question"
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Match against the GPT-detected intent stored on each email analysis.
              </p>
            </div>
          )}

          {ruleType === 'sender_domain' && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">Domains (comma separated, no @)</label>
              <input
                type="text"
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="acme.com, partner.io"
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {ruleType === 'customer_attribute' && (
            <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresMatchedCustomer}
                onChange={(e) => setRequiresMatchedCustomer(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-slate-200">
                Only trigger when the email is matched to an existing customer
              </span>
            </label>
          )}

          {ruleType === 'gpt_prompt' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-300 mb-1">GPT model</label>
                <select
                  value={gptModel}
                  onChange={(e) => setGptModel(e.target.value)}
                  className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Custom prompt</label>
                <textarea
                  value={gptPrompt}
                  onChange={(e) => setGptPrompt(e.target.value)}
                  rows={5}
                  placeholder="You are an AR assistant. Given this email, decide whether the collector needs to follow up..."
                  className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  GPT-evaluated rules are queued for async processing. The prompt should ask for a yes/no decision.
                </p>
              </div>
            </div>
          )}

          <div className="border-t border-slate-700 pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Reminder defaults</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Title template</label>
                <input
                  type="text"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Reminder type</label>
                <select
                  value={reminderTypeVal}
                  onChange={(e) => setReminderTypeVal(e.target.value as any)}
                  className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  {REMINDER_TYPE_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-slate-300 mb-1">Description template (optional)</label>
                <textarea
                  value={descriptionTemplate}
                  onChange={(e) => setDescriptionTemplate(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Available variables: {TEMPLATE_TIPS.join(' ')}
                </p>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Schedule offset</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      value={offsetDays}
                      onChange={(e) => setOffsetDays(Number(e.target.value))}
                      className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                      placeholder="Days"
                    />
                    <span className="text-xs text-slate-500">days</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min={0}
                      value={offsetHours}
                      onChange={(e) => setOffsetHours(Number(e.target.value))}
                      className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
                      placeholder="Hours"
                    />
                    <span className="text-xs text-slate-500">hours</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Assignment</h3>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Assign to</label>
              <select
                value={assigneeStrategy}
                onChange={(e) => setAssigneeStrategy(e.target.value as AssigneeStrategy)}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="customer_collector">Customer's assigned collector</option>
                <option value="default_user">Specific user only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                {assigneeStrategy === 'customer_collector' ? 'Fallback user' : 'Default user'}
              </label>
              <select
                value={defaultAssigneeId}
                onChange={(e) => setDefaultAssigneeId(e.target.value)}
                className="w-full bg-slate-900 text-white rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="">— None —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-200">Rule enabled</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700 sticky bottom-0 bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
