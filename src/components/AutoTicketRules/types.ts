export type ConditionLogic = 'invoice_only' | 'payment_only' | 'both_and' | 'both_or' | 'advanced';

export type ConditionType =
  | 'balance_threshold'
  | 'invoice_count_overdue'
  | 'invoice_age_days'
  | 'payment_pattern_deviation'
  | 'payment_amount_drop'
  | 'days_since_last_payment'
  | 'invoice_amount_threshold'
  | 'overdue_percentage'
  | 'payment_frequency_change'
  | 'total_overdue_amount';

export type Operator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'pct_drop';

export type ActionType = 'ticket_only' | 'email_only' | 'ticket_and_email' | 'reminder_only';

export type AppliesTo = 'all' | 'specific' | 'exclude';

export interface RuleCondition {
  id?: string;
  rule_id?: string;
  condition_type: ConditionType;
  operator: Operator;
  value_numeric: number | null;
  value_numeric_max: number | null;
  value_text: string;
  time_unit: string;
  date_reference: string;
}

export interface RuleTarget {
  id?: string;
  rule_id?: string;
  target_type: 'include' | 'exclude';
  customer_id: string;
  customer_name?: string;
}

export interface AutoTicketRule {
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
  rule_name: string | null;
  description: string | null;
  action_type: ActionType;
  email_recipients: string[];
  notify_admin: boolean;
  priority: string;
  ticket_type_id: string | null;
  logic_operator: string;
  applies_to: AppliesTo;
  customer_name?: string;
  collector_name?: string;
  collector_email?: string;
  conditions?: RuleCondition[];
  targets?: RuleTarget[];
}

export interface Customer {
  customer_id: string;
  customer_name: string;
}

export interface Collector {
  id: string;
  full_name: string;
  email: string;
}

export interface TicketType {
  id: string;
  name: string;
  color: string;
}

export const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  balance_threshold: 'Customer Balance Threshold',
  invoice_count_overdue: 'Number of Overdue Invoices',
  invoice_age_days: 'Invoice Age (Days Overdue)',
  payment_pattern_deviation: 'Payment Pattern Change',
  payment_amount_drop: 'Payment Amount Drop',
  days_since_last_payment: 'Days Since Last Payment',
  invoice_amount_threshold: 'Single Invoice Amount',
  overdue_percentage: 'Percentage of Invoices Overdue',
  payment_frequency_change: 'Payment Frequency Change',
  total_overdue_amount: 'Total Overdue Amount',
};

export const CONDITION_TYPE_DESCRIPTIONS: Record<ConditionType, string> = {
  balance_threshold: 'Triggers when customer total balance exceeds a threshold (e.g., balance > $100,000)',
  invoice_count_overdue: 'Triggers when a customer has N or more invoices past their due date',
  invoice_age_days: 'Triggers when invoices are overdue by a certain number of days',
  payment_pattern_deviation: 'Detects when a customer deviates from their normal payment day (e.g., usually pays on the 1st, now paying on the 5th)',
  payment_amount_drop: 'Triggers when monthly payment drops below a percentage of their average (e.g., usually pays $100K/month but only paid $80K)',
  days_since_last_payment: 'Triggers when a customer hasn\'t made any payment in N days',
  invoice_amount_threshold: 'Triggers when any single invoice exceeds a threshold amount',
  overdue_percentage: 'Triggers when a certain percentage of a customer\'s invoices are past due',
  payment_frequency_change: 'Detects changes in how often a customer pays (e.g., went from weekly to monthly)',
  total_overdue_amount: 'Triggers when the total overdue balance exceeds a threshold',
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  gt: 'Greater than',
  lt: 'Less than',
  gte: 'Greater than or equal to',
  lte: 'Less than or equal to',
  eq: 'Equal to',
  between: 'Between',
  pct_drop: 'Percentage drop',
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  ticket_only: 'Create Ticket Only',
  email_only: 'Send Email Alert Only',
  ticket_and_email: 'Create Ticket + Send Email',
  reminder_only: 'Create Reminder Only',
};
