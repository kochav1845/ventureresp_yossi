export interface CollectorCombined {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  assigned_customers: number;
  total_changes: number;
  green_changes: number;
  orange_changes: number;
  red_changes: number;
  untouched_to_red: number;
  orange_to_green: number;
  working_days: number;
  tickets_assigned: number;
  invoices_assigned: number;
  invoices_modified: number;
  payments_modified: number;
  emails_scheduled: number;
  emails_sent: number;
  last_activity_at: string | null;
  total_collected: number;
  invoices_paid: number;
  payment_count: number;
}

export interface CollectorActivity {
  activity_date: string;
  invoices_modified: number;
  payments_modified: number;
  emails_sent: number;
  customers_contacted: number;
}

export interface ChangeLog {
  changed_at: string;
  changed_by_email: string;
  change_type: string;
  field_name: string;
  old_value: string;
  new_value: string;
  invoice_reference_number?: string;
  payment_reference_number?: string;
}
