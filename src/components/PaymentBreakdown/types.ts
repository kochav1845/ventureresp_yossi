export interface MonthSummary {
  month_key: string;
  month_label: string;
  total_payments: number;
  total_amount: number;
  payment_count: number;
  payment_amount: number;
  prepayment_count: number;
  prepayment_amount: number;
  voided_count: number;
  voided_amount: number;
  refund_count: number;
  refund_amount: number;
  balance_wo_count: number;
  balance_wo_amount: number;
}

export interface DateBreakdownRow {
  day_date: string;
  day_label: string;
  payment_type: string;
  payment_status: string;
  payment_count: number;
  total_amount: number;
  avg_amount: number;
}

export interface DaySummary {
  date: string;
  label: string;
  total_count: number;
  total_amount: number;
  types: Record<string, { count: number; amount: number; statuses: Record<string, { count: number; amount: number }> }>;
}

export type PaymentTypeKey = 'Payment' | 'Prepayment' | 'Voided Payment' | 'Refund' | 'Balance WO';

export const PAYMENT_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string; textColor: string }> = {
  'Payment': { label: 'Payments', color: '#2563eb', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  'Prepayment': { label: 'Prepayments', color: '#0891b2', bgColor: 'bg-cyan-50', textColor: 'text-cyan-700' },
  'Voided Payment': { label: 'Voided', color: '#dc2626', bgColor: 'bg-red-50', textColor: 'text-red-700' },
  'Voided Check': { label: 'Voided Checks', color: '#dc2626', bgColor: 'bg-red-50', textColor: 'text-red-700' },
  'Refund': { label: 'Refunds', color: '#f59e0b', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  'Balance WO': { label: 'Balance W/O', color: '#6b7280', bgColor: 'bg-gray-50', textColor: 'text-gray-700' },
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export interface ComparisonResult {
  acumaticaCount: number;
  dbCount: number;
  difference: number;
}

export interface ComparisonState {
  loading: boolean;
  error: string | null;
  result: ComparisonResult | null;
}

export interface FetchProgress {
  current: number;
  total: number;
  created: number;
  updated: number;
  applicationsSynced: number;
  filesSynced: number;
}

export interface FetchState {
  loading: boolean;
  error: string | null;
  result: { created: number; updated: number } | null;
  progress?: FetchProgress | null;
  jobId?: string | null;
}

export interface StalePayment {
  reference_number: string;
  type: string;
  customer_name: string;
  db_date: string;
  acumatica_date: string | null;
  acumatica_status: string;
  amount: number;
}

export interface VerifyResult {
  acumaticaCount: number;
  dbCount: number;
  inAcumaticaNotDb: number;
  inDbNotAcumatica: number;
  stalePayments: StalePayment[];
  fixedPayments: { reference_number: string; old_date: string; new_date: string }[];
}

export interface VerifyState {
  loading: boolean;
  error: string | null;
  result: VerifyResult | null;
}
