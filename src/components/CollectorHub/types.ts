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
  total_actions: number;
  login_count: number;
  tickets_created: number;
  tickets_closed: number;
  notes_added: number;
  status_changes: number;
  invoice_color_changes: number;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  created_at: string;
  user_name?: string;
}
