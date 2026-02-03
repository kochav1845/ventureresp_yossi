// Customer Types
export interface Customer {
  id: string;
  acumatica_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  status: string | null;
  credit_limit: number | null;
  current_balance: number | null;
  overdue_balance: number | null;
  total_invoices: number;
  red_threshold_days: number | null;
  created_at: string;
  updated_at: string;
  last_modified_datetime: string | null;
}

// Invoice Types
export interface Invoice {
  id: string;
  acumatica_id: string;
  customer_id: string | null;
  customer_name: string | null;
  reference_number: string;
  type: string;
  status: string;
  date: string;
  due_date: string | null;
  amount: number;
  balance: number;
  description: string | null;
  terms: string | null;
  color_status: 'red' | 'yellow' | 'green' | null;
  color_changed_at: string | null;
  color_changed_by: string | null;
  promise_date: string | null;
  promise_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  last_modified_datetime: string | null;
}

// Payment Types
export interface Payment {
  id: string;
  acumatica_id: string;
  reference_number: string;
  customer_id: string | null;
  customer_name: string | null;
  payment_date: string;
  payment_method: string | null;
  payment_ref: string | null;
  status: string;
  amount: number;
  unapplied_balance: number | null;
  cash_account: string | null;
  description: string | null;
  application_history: PaymentApplication[] | null;
  created_at: string;
  updated_at: string;
  last_modified_datetime: string | null;
}

export interface PaymentApplication {
  doc_type: string;
  reference_nbr: string;
  amount_paid: number;
  balance: number | null;
  invoice_date: string | null;
  invoice_due_date: string | null;
}

// Analytics Types
export interface CustomerAnalytics {
  customer_id: string;
  customer_name: string;
  total_balance: number;
  overdue_balance: number;
  invoice_count: number;
  oldest_invoice_date: string;
  days_overdue: number;
}

export interface InvoiceAnalytics {
  total_invoices: number;
  total_balance: number;
  overdue_balance: number;
  red_count: number;
  yellow_count: number;
  green_count: number;
  uncolored_count: number;
}

export interface PaymentAnalytics {
  total_payments: number;
  total_amount: number;
  payment_type: string;
  payment_count: number;
}

// User Types (extends UserProfile from supabase.ts)
export interface UserActivity {
  id: string;
  user_id: string;
  action: string;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_profiles?: {
    email: string;
    full_name: string | null;
  };
}

// Reminder Types
export interface Reminder {
  id: string;
  user_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  title: string;
  description: string | null;
  reminder_date: string;
  priority: 'low' | 'medium' | 'high';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Email Types
export interface InboundEmail {
  id: string;
  customer_id: string | null;
  sender_email: string;
  subject: string;
  body: string;
  received_at: string;
  processing_status: string;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  folder: string;
  thread_id: string | null;
  normalized_subject: string | null;
}

// Ticket Types
export interface CollectionTicket {
  id: string;
  customer_id: string;
  invoice_id: string | null;
  assigned_to: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  description: string | null;
  resolution_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

// Filter Types
export interface CustomerFilter {
  search?: string;
  minBalance?: number;
  maxBalance?: number;
  minInvoices?: number;
  maxInvoices?: number;
  minDaysOverdue?: number;
  maxDaysOverdue?: number;
  startDate?: string;
  endDate?: string;
  excludeZeroBalance?: boolean;
  excludeFromAnalytics?: boolean;
}

export interface InvoiceFilter {
  search?: string;
  customerName?: string;
  colorStatus?: string;
  status?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

// Pagination Types
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
