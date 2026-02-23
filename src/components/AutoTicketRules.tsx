import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Power, PowerOff, Play, Loader2, Search, Clock, Save, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

type ConditionLogic = 'invoice_only' | 'payment_only' | 'both_and' | 'both_or';

interface AutoTicketRule {
  id: string;
  customer_id: string;
  rule_type: string;
  condition_logic: ConditionLogic;
  min_days_old: number | null;
  max_days_old: number | null;
  check_payment_within_days_min: number | null;
  check_payment_within_days_max: number | null;
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

const CONDITION_LABELS: Record<ConditionLogic, string> = {
  invoice_only: 'Invoice Age Only',
  payment_only: 'Payment Recency Only',
  both_and: 'Invoice Age AND Payment Recency',
  both_or: 'Invoice Age OR Payment Recency',
};

const CONDITION_DESCRIPTIONS: Record<ConditionLogic, string> = {
  invoice_only: 'Creates tickets when invoices reach a certain age',
  payment_only: 'Creates tickets when customers with open invoices haven\'t paid within a timeframe',
  both_and: 'Both conditions must be true: invoice age matches AND payment is overdue',
  both_or: 'Either condition can trigger: invoice age matches OR payment is overdue',
};

function getConditionBadges(rule: AutoTicketRule) {
  switch (rule.condition_logic) {
    case 'invoice_only':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Invoice Age
        </span>
      );
    case 'payment_only':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          Payment Recency
        </span>
      );
    case 'both_and':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
            Invoice Age
          </span>
          <span className="text-[10px] font-bold text-gray-500">AND</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
            Payment
          </span>
        </div>
      );
    case 'both_or':
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800">
            Invoice Age
          </span>
          <span className="text-[10px] font-bold text-gray-500">OR</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
            Payment
          </span>
        </div>
      );
  }
}

function getCriteriaText(rule: AutoTicketRule) {
  const parts: string[] = [];
  if (rule.condition_logic === 'invoice_only' || rule.condition_logic === 'both_and' || rule.condition_logic === 'both_or') {
    parts.push(`Invoices ${rule.min_days_old}-${rule.max_days_old} days old`);
  }
  if (rule.condition_logic === 'payment_only' || rule.condition_logic === 'both_and' || rule.condition_logic === 'both_or') {
    parts.push(`No payment in ${rule.check_payment_within_days_min}-${rule.check_payment_within_days_max} days`);
  }
  return parts;
}

export default function AutoTicketRules({ onBack }: AutoTicketRulesProps) {
  const [rules, setRules] = useState<AutoTicketRule[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoTicketRule | null>(null);
  const [processing, setProcessing] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    customer_id: '',
    condition_logic: 'invoice_only' as ConditionLogic,
    min_days_old: 120,
    max_days_old: 150,
    check_payment_within_days_min: 28,
    check_payment_within_days_max: 35,
    assigned_collector_id: '',
  });

  const { showToast } = useToast();

  const showInvoiceFields = formData.condition_logic === 'invoice_only' || formData.condition_logic === 'both_and' || formData.condition_logic === 'both_or';
  const showPaymentFields = formData.condition_logic === 'payment_only' || formData.condition_logic === 'both_and' || formData.condition_logic === 'both_or';

  const [scheduleHour, setScheduleHour] = useState(6);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

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

  const handleAmPmChange = (newAmPm: string) => {
    handleEstHourChange(estHour12, newAmPm);
  };

  const handleHour12Change = (newHour12: number) => {
    handleEstHourChange(newHour12, estAmPm);
  };

  const formatEstTime = () => {
    return `${estHour12}:${String(scheduleMinute).padStart(2, '0')} ${estAmPm} EST`;
  };

  useEffect(() => {
    fetchRules();
    fetchCollectors();
    fetchSchedule();
  }, []);

  useEffect(() => {
    if (searchTimeoutRef[0]) {
      clearTimeout(searchTimeoutRef[0]);
    }

    if (searchTerm.length >= 2) {
      searchTimeoutRef[0] = setTimeout(() => {
        searchCustomers(searchTerm);
      }, 300);
    } else {
      setFilteredCustomers([]);
    }

    return () => {
      if (searchTimeoutRef[0]) {
        clearTimeout(searchTimeoutRef[0]);
      }
    };
  }, [searchTerm, formData.condition_logic]);

  const fetchRules = async () => {
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from('auto_ticket_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (rulesError) throw rulesError;

      if (!rulesData || rulesData.length === 0) {
        setRules([]);
        return;
      }

      const customerIds = [...new Set(rulesData.map(r => r.customer_id?.trim()))].filter(Boolean);
      const collectorIds = [...new Set(rulesData.map(r => r.assigned_collector_id))];

      const [customersResult, collectorsResult] = await Promise.all([
        supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name')
          .in('customer_id', customerIds),
        supabase
          .from('user_profiles')
          .select('id, full_name, email')
          .in('id', collectorIds)
      ]);

      if (customersResult.error) throw customersResult.error;
      if (collectorsResult.error) throw collectorsResult.error;

      const collectorsMap = new Map(collectorsResult.data?.map(c => [c.id, c]) || []);
      const customersMap = new Map(customersResult.data?.map(c => [c.customer_id, c]) || []);

      const enrichedRules = rulesData.map((rule: any) => {
        const collector = collectorsMap.get(rule.assigned_collector_id);
        const customer = customersMap.get(rule.customer_id?.trim());

        return {
          ...rule,
          condition_logic: rule.condition_logic || (rule.rule_type === 'payment_recency' ? 'payment_only' : 'invoice_only'),
          customer_name: customer?.customer_name || rule.customer_id,
          collector_name: collector?.full_name || 'Unknown',
          collector_email: collector?.email || '',
        };
      });

      setRules(enrichedRules);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const searchCustomers = async (term: string) => {
    setSearchLoading(true);
    try {
      const searchPattern = `%${term}%`;

      if (showPaymentFields) {
        const { data: customersData, error } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name')
          .or(`customer_name.ilike.${searchPattern},customer_id.ilike.${searchPattern}`)
          .order('customer_name')
          .limit(100);

        if (error) throw error;

        const customerIds = customersData?.map(c => c.customer_id) || [];

        if (customerIds.length > 0) {
          const { data: invoiceData, error: invError } = await supabase
            .from('acumatica_invoices')
            .select('customer')
            .eq('type', 'Invoice')
            .gt('balance', 0)
            .in('status', ['Open', 'open'])
            .in('customer', customerIds);

          if (invError) throw invError;

          const customersWithOpenInvoices = new Set(invoiceData?.map(inv => inv.customer) || []);
          const filtered = customersData?.filter(c => customersWithOpenInvoices.has(c.customer_id)) || [];
          setFilteredCustomers(filtered);
        } else {
          setFilteredCustomers([]);
        }
      } else {
        const { data, error } = await supabase
          .from('acumatica_customers')
          .select('customer_id, customer_name')
          .or(`customer_name.ilike.${searchPattern},customer_id.ilike.${searchPattern}`)
          .order('customer_name')
          .limit(100);

        if (error) throw error;
        setFilteredCustomers(data || []);
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSearchLoading(false);
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

  const fetchSchedule = async () => {
    try {
      const { data, error } = await supabase.rpc('get_auto_ticket_cron_schedule');
      if (error) throw error;
      if (data && data.length > 0) {
        const parts = data[0].schedule.split(' ');
        setScheduleMinute(parseInt(parts[0]) || 0);
        setScheduleHour(parseInt(parts[1]) || 0);
      }
    } catch (err: any) {
      console.error('Failed to fetch schedule:', err);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (showInvoiceFields) {
      if (formData.min_days_old >= formData.max_days_old) {
        showToast('Invoice: Maximum days must be greater than minimum days', 'error');
        return;
      }
    }
    if (showPaymentFields) {
      if (formData.check_payment_within_days_min >= formData.check_payment_within_days_max) {
        showToast('Payment: Maximum days must be greater than minimum days', 'error');
        return;
      }
    }

    try {
      const ruleType = formData.condition_logic === 'payment_only' ? 'payment_recency' : 'invoice_age';

      if (editingRule) {
        const updateData: any = {
          assigned_collector_id: formData.assigned_collector_id,
          condition_logic: formData.condition_logic,
          rule_type: ruleType,
        };

        if (showInvoiceFields) {
          updateData.min_days_old = formData.min_days_old;
          updateData.max_days_old = formData.max_days_old;
        } else {
          updateData.min_days_old = null;
          updateData.max_days_old = null;
        }

        if (showPaymentFields) {
          updateData.check_payment_within_days_min = formData.check_payment_within_days_min;
          updateData.check_payment_within_days_max = formData.check_payment_within_days_max;
        } else {
          updateData.check_payment_within_days_min = null;
          updateData.check_payment_within_days_max = null;
        }

        const { error } = await supabase
          .from('auto_ticket_rules')
          .update(updateData)
          .eq('id', editingRule.id);

        if (error) throw error;
        showToast('Rule updated successfully', 'success');
      } else {
        const { data: { user } } = await supabase.auth.getUser();

        const { data: existingRule, error: checkError } = await supabase
          .from('auto_ticket_rules')
          .select('*')
          .eq('customer_id', formData.customer_id)
          .eq('condition_logic', formData.condition_logic)
          .maybeSingle();

        if (checkError) throw checkError;

        if (existingRule) {
          const customerName = selectedCustomerName || formData.customer_id;
          showToast(`A "${CONDITION_LABELS[formData.condition_logic]}" rule already exists for ${customerName}. Please edit the existing rule instead.`, 'error');
          return;
        }

        const insertData: any = {
          customer_id: formData.customer_id,
          rule_type: ruleType,
          condition_logic: formData.condition_logic,
          assigned_collector_id: formData.assigned_collector_id,
          created_by: user?.id,
        };

        if (showInvoiceFields) {
          insertData.min_days_old = formData.min_days_old;
          insertData.max_days_old = formData.max_days_old;
        }

        if (showPaymentFields) {
          insertData.check_payment_within_days_min = formData.check_payment_within_days_min;
          insertData.check_payment_within_days_max = formData.check_payment_within_days_max;
        }

        const { error } = await supabase
          .from('auto_ticket_rules')
          .insert(insertData);

        if (error) throw error;
        showToast('Rule created successfully', 'success');
      }

      setIsModalOpen(false);
      setEditingRule(null);
      resetForm();
      fetchRules();
    } catch (error: any) {
      if (error.message?.includes('duplicate key') || error.message?.includes('23505')) {
        showToast('A rule with this combination already exists. Please edit the existing rule instead.', 'error');
      } else {
        showToast(error.message, 'error');
      }
    }
  };

  const handleEdit = (rule: AutoTicketRule) => {
    setEditingRule(rule);
    setFormData({
      customer_id: rule.customer_id,
      condition_logic: rule.condition_logic,
      min_days_old: rule.min_days_old || 120,
      max_days_old: rule.max_days_old || 150,
      check_payment_within_days_min: rule.check_payment_within_days_min || 28,
      check_payment_within_days_max: rule.check_payment_within_days_max || 35,
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
      condition_logic: 'invoice_only',
      min_days_old: 120,
      max_days_old: 150,
      check_payment_within_days_min: 28,
      check_payment_within_days_max: 35,
      assigned_collector_id: '',
    });
    setSearchTerm('');
    setFilteredCustomers([]);
    setSelectedCustomerName('');
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
              Automatically create tickets based on invoice age, payment recency, or both
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Daily Schedule</h3>
              <p className="text-xs text-gray-500">Rules are processed automatically at this time every day (EST)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <select
                value={estHour12}
                onChange={(e) => handleHour12Change(parseInt(e.target.value))}
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
                onChange={(e) => handleAmPmChange(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
              <span className="text-xs text-gray-400 ml-1">EST</span>
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
              {scheduleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : scheduleSaved ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {scheduleSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
        <p className="text-blue-800 text-sm">
          <strong>How it works:</strong> Every day at {formatEstTime()}, the system checks each active rule:
        </p>
        <ul className="text-blue-800 text-sm list-disc list-inside space-y-1">
          <li><strong>Invoice Age Only:</strong> Finds unpaid invoices dated within the specified age range.</li>
          <li><strong>Payment Recency Only:</strong> Checks if a customer hasn't paid within the specified timeframe.</li>
          <li><strong>Both (AND):</strong> Creates tickets only when BOTH invoice age AND payment conditions are met.</li>
          <li><strong>Both (OR):</strong> Creates tickets when EITHER invoice age OR payment conditions are met.</li>
        </ul>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criteria</th>
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
                  <td className="px-6 py-4">
                    {getConditionBadges(rule)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {getCriteriaText(rule).map((text, i) => (
                      <div key={i}>{text}</div>
                    ))}
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
                  Condition Type
                </label>
                <select
                  value={formData.condition_logic}
                  onChange={(e) => {
                    const newLogic = e.target.value as ConditionLogic;
                    setFormData({ ...formData, condition_logic: newLogic, customer_id: '' });
                    setSearchTerm('');
                    setFilteredCustomers([]);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="invoice_only">Invoice Age Only</option>
                  <option value="payment_only">Payment Recency Only</option>
                  <option value="both_and">Invoice Age AND Payment Recency (both must match)</option>
                  <option value="both_or">Invoice Age OR Payment Recency (either can match)</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  {CONDITION_DESCRIPTIONS[formData.condition_logic]}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer {editingRule && '(cannot be changed)'}
                  {!editingRule && showPaymentFields && ' (only customers with open invoices)'}
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
                        placeholder="Type at least 2 characters to search customers..."
                        className="pl-10 w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {searchLoading && (
                        <Loader2 className="absolute right-3 top-3 w-5 h-5 text-blue-500 animate-spin" />
                      )}
                    </div>
                    {searchTerm.length >= 2 && !searchLoading && filteredCustomers.length === 0 && (
                      <p className="mt-2 text-sm text-gray-500">No customers found matching "{searchTerm}"</p>
                    )}
                    {filteredCustomers.length > 0 && (
                      <div className="mt-2 border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                        {filteredCustomers.map((customer) => {
                          const hasRule = rules.some(
                            r => r.customer_id === customer.customer_id && r.condition_logic === formData.condition_logic
                          );
                          return (
                            <button
                              key={customer.customer_id}
                              type="button"
                              onClick={() => {
                                if (!hasRule) {
                                  setFormData({ ...formData, customer_id: customer.customer_id });
                                  setSelectedCustomerName(customer.customer_name);
                                  setSearchTerm(customer.customer_name);
                                  setFilteredCustomers([]);
                                } else {
                                  showToast('This customer already has this rule type. Please edit the existing rule.', 'error');
                                }
                              }}
                              className={`w-full text-left px-4 py-2 border-b border-gray-200 last:border-b-0 ${
                                hasRule ? 'bg-red-50 cursor-not-allowed' : 'hover:bg-gray-100'
                              }`}
                              disabled={hasRule}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-gray-900">{customer.customer_name}</div>
                                  <div className="text-sm text-gray-500">{customer.customer_id}</div>
                                </div>
                                {hasRule && (
                                  <span className="px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded">
                                    Rule Exists
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {formData.customer_id && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-sm text-green-800">
                          Selected: {selectedCustomerName || formData.customer_id}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showInvoiceFields && (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                  <h3 className="text-sm font-semibold text-blue-800 mb-3">Invoice Age Condition</h3>
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
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      Finds invoices dated between <strong>{formData.max_days_old} and {formData.min_days_old} days ago</strong> from today.
                    </p>
                  </div>
                </div>
              )}

              {showInvoiceFields && showPaymentFields && (
                <div className="flex items-center justify-center">
                  <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${
                    formData.condition_logic === 'both_and'
                      ? 'bg-orange-100 text-orange-700 border border-orange-300'
                      : 'bg-teal-100 text-teal-700 border border-teal-300'
                  }`}>
                    {formData.condition_logic === 'both_and' ? 'AND' : 'OR'}
                  </span>
                </div>
              )}

              {showPaymentFields && (
                <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/30">
                  <h3 className="text-sm font-semibold text-amber-800 mb-3">Payment Recency Condition</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Days Since Payment
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.check_payment_within_days_min}
                        onChange={(e) => setFormData({ ...formData, check_payment_within_days_min: parseInt(e.target.value) || 0 })}
                        required
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">At least this many days since last payment</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Days Since Payment
                      </label>
                      <input
                        type="number"
                        min={formData.check_payment_within_days_min + 1}
                        value={formData.check_payment_within_days_max}
                        onChange={(e) => setFormData({ ...formData, check_payment_within_days_max: parseInt(e.target.value) || 0 })}
                        required
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">At most this many days since last payment</p>
                    </div>
                  </div>
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      Triggers when last payment was <strong>{formData.check_payment_within_days_min} to {formData.check_payment_within_days_max} days ago</strong>.
                    </p>
                  </div>
                </div>
              )}

              {(formData.condition_logic === 'both_and' || formData.condition_logic === 'both_or') && (
                <div className={`p-4 rounded-lg border ${
                  formData.condition_logic === 'both_and'
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-teal-50 border-teal-200'
                }`}>
                  <p className={`text-sm ${formData.condition_logic === 'both_and' ? 'text-orange-800' : 'text-teal-800'}`}>
                    {formData.condition_logic === 'both_and' ? (
                      <>
                        <strong>AND Logic:</strong> A ticket will be created only if the customer has invoices between {formData.max_days_old} and {formData.min_days_old} days old
                        <strong> AND </strong>their last payment was {formData.check_payment_within_days_min} to {formData.check_payment_within_days_max} days ago.
                        Both conditions must be true.
                      </>
                    ) : (
                      <>
                        <strong>OR Logic:</strong> A ticket will be created if the customer has invoices between {formData.max_days_old} and {formData.min_days_old} days old
                        <strong> OR </strong>their last payment was {formData.check_payment_within_days_min} to {formData.check_payment_within_days_max} days ago.
                        Either condition can trigger ticket creation.
                      </>
                    )}
                  </p>
                </div>
              )}

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
