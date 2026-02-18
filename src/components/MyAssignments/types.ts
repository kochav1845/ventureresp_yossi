export interface Assignment {
  assignment_id: string;
  invoice_reference_number: string;
  ticket_id: string | null;
  ticket_number: string | null;
  ticket_status: string | null;
  ticket_priority: string | null;
  ticket_type: string | null;
  ticket_due_date?: string | null;
  customer: string;
  customer_name: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  invoice_status: string;
  color_status: string | null;
  description: string;
  assignment_notes: string;
  promise_date?: string | null;
  collection_date?: string | null;
  memo_count?: number;
  has_attachments?: boolean;
  last_memo?: {
    memo_text: string;
    created_at: string;
  };
}

export interface TicketGroup {
  ticket_id: string;
  ticket_number: string;
  ticket_status: string;
  ticket_priority: string;
  ticket_type: string;
  ticket_due_date?: string | null;
  ticket_created_at?: string | null;
  ticket_closed_at?: string | null;
  customer_id: string;
  customer_name: string;
  promise_date?: string | null;
  promise_by_user_name?: string | null;
  invoices: Assignment[];
  last_status_change?: {
    status: string;
    changed_at: string;
    changed_by_name: string;
  };
  last_activity?: {
    description: string;
    created_at: string;
    created_by_name: string;
  };
  note_count?: number;
  has_attachments?: boolean;
  last_note?: {
    note_text: string;
    created_at: string;
  };
  // Real-time customer balance tracking
  customer_balance?: number;
  open_invoice_count?: number;
  oldest_invoice_date?: string | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
}

export interface CustomerAssignment {
  assignment_id: string;
  customer_id: string;
  customer_name: string;
  customer_balance: number;
  notes: string;
  assigned_at: string;
}

export interface TicketStatusOption {
  id: string;
  status_name: string;
  display_name: string;
  color_class: string;
  sort_order: number;
}
