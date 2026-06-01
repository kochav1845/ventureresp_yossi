export interface InvoiceMonthSummary {
  month_key: string;
  month_label: string;
  total_invoices: number;
  total_amount: number;
  total_balance: number;
  total_open_balance: number;

  // Per-status aggregates (across all types)
  open_count: number;
  open_amount: number;
  open_balance: number;
  closed_count: number;
  closed_amount: number;
  closed_balance: number;
  balanced_count: number;
  balanced_amount: number;
  balanced_balance: number;
  canceled_count: number;
  canceled_amount: number;
  canceled_balance: number;
  voided_count: number;
  voided_amount: number;
  voided_balance: number;
  credit_hold_count: number;
  credit_hold_amount: number;
  credit_hold_balance: number;
  on_hold_count: number;
  on_hold_amount: number;
  on_hold_balance: number;

  // Per-type totals
  invoice_count: number;
  invoice_amount: number;
  invoice_balance: number;
  invoice_open_balance: number;
  invoice_open_count: number;
  invoice_open_amount: number;
  invoice_closed_count: number;
  invoice_closed_amount: number;
  invoice_balanced_count: number;
  invoice_balanced_amount: number;
  credit_memo_count: number;
  credit_memo_amount: number;
  credit_memo_balance: number;
  credit_memo_open_balance: number;
  credit_memo_open_count: number;
  credit_memo_open_amount: number;
  credit_memo_closed_count: number;
  credit_memo_closed_amount: number;
  credit_memo_balanced_count: number;
  credit_memo_balanced_amount: number;
  debit_memo_count: number;
  debit_memo_amount: number;
  debit_memo_balance: number;
  debit_memo_open_balance: number;
  debit_memo_open_count: number;
  debit_memo_open_amount: number;
  debit_memo_closed_count: number;
  debit_memo_closed_amount: number;
  credit_wo_count: number;
  credit_wo_amount: number;
  credit_wo_balance: number;
  overdue_charge_count: number;
  overdue_charge_amount: number;
  overdue_charge_balance: number;
}

export interface InvoiceDateBreakdownRow {
  day_date: string;
  day_label: string;
  invoice_type: string;
  invoice_status: string;
  invoice_count: number;
  total_amount: number;
  total_balance: number;
  avg_amount: number;
}

export interface InvoiceDaySummary {
  date: string;
  label: string;
  total_count: number;
  total_amount: number;
  total_balance: number;
  types: Record<string, {
    count: number;
    amount: number;
    balance: number;
    statuses: Record<string, { count: number; amount: number; balance: number }>;
  }>;
}

export type InvoiceTypeKey = 'Invoice' | 'Credit Memo' | 'Debit Memo' | 'Credit WO' | 'Overdue Charge';

export const INVOICE_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string; textColor: string }> = {
  'Invoice': { label: 'Invoices', color: '#2563eb', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  'Credit Memo': { label: 'Credit Memos', color: '#059669', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  'Debit Memo': { label: 'Debit Memos', color: '#d97706', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  'Credit WO': { label: 'Credit W/O', color: '#6b7280', bgColor: 'bg-gray-50', textColor: 'text-gray-700' },
  'Overdue Charge': { label: 'Overdue Charges', color: '#dc2626', bgColor: 'bg-red-50', textColor: 'text-red-700' },
};

export const INVOICE_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; textColor: string }> = {
  'Open': { label: 'Open', color: '#2563eb', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
  'Closed': { label: 'Closed', color: '#6b7280', bgColor: 'bg-gray-50', textColor: 'text-gray-700' },
  'Balanced': { label: 'Balanced', color: '#059669', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  'Canceled': { label: 'Canceled', color: '#dc2626', bgColor: 'bg-red-50', textColor: 'text-red-700' },
  'Voided': { label: 'Voided', color: '#be185d', bgColor: 'bg-pink-50', textColor: 'text-pink-700' },
  'Credit Hold': { label: 'Credit Hold', color: '#d97706', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  'On Hold': { label: 'On Hold', color: '#9333ea', bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export interface TypeCount {
  acumatica: number;
  db: number;
  difference: number;
}

export interface ComparisonResult {
  acumaticaCount: number;
  dbCount: number;
  difference: number;
  byType: Record<string, TypeCount>;
  trulyMissing: number;
  missingByType: Record<string, number>;
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
}

export interface FetchState {
  loading: boolean;
  error: string | null;
  result: { created: number; updated: number } | null;
  progress?: FetchProgress | null;
  jobId?: string | null;
}

export interface ExtraInvoice {
  reference_number: string;
  type: string;
  customer: string;
  customer_name: string;
  amount: number;
  balance: number;
  status: string;
}

export interface VerificationResult {
  acumaticaCount: number;
  dbCount: number;
  extraCount: number;
  extras: ExtraInvoice[];
  deletedInvoices: { reference_number: string; type: string; customer_name: string }[];
  deletedCount: number;
}

export interface VerificationState {
  loading: boolean;
  error: string | null;
  result: VerificationResult | null;
  mode?: 'verify' | 'delete';
}
