export interface StatementInvoice {
  reference_number: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  status: string;
  description: string;
  days_overdue: number;
  type: string;
}

export interface StatementCustomer {
  customer_id: string;
  customer_name: string;
  email: string;
  terms: string;
  total_balance: number;
  credit_memo_balance: number;
  open_invoice_count: number;
  max_days_overdue: number;
  invoices: StatementInvoice[];
  // Invoice activity within the selected period (populated from the activity RPC).
  invoiced_count?: number;
  invoiced_amount?: number;
  last_invoice_date?: string | null;
}

export type StatementPeriod = 'last_month' | 'this_month' | 'last_30' | 'last_90' | 'all';

export interface ReportTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  include_invoice_table: boolean;
  include_payment_table: boolean;
  is_default: boolean;
}

// A saved Excel-statement layout (row in `statement_excel_templates`).
export interface StatementExcelTemplate {
  id: string;
  name: string;
  layout: import('../../lib/statementExport').StatementExcelLayout;
  is_default: boolean;
}

export type SortField = 'name' | 'balance' | 'invoices' | 'overdue' | 'invoiced';
export type SortOrder = 'asc' | 'desc';
