export interface Assignment {
  assignment_id: string;
  invoice_reference_number: string;
  ticket_id: string | null;
  ticket_number: string | null;
  ticket_status: string | null;
  ticket_priority: string | null;
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
}

export interface TicketGroup {
  ticket_id: string;
  ticket_number: string;
  ticket_status: string;
  ticket_priority: string;
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
