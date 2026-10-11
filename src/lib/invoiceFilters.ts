import { supabase } from './supabase';

/**
 * The invoice filter criteria shared by the Customer detail page, the ticket
 * create form and the ticket detail page. Kept as strings because every one of
 * these is bound straight to an <input>; empty string means "not set".
 */
export interface InvoiceFilters {
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  daysOverdueMin: string;
  daysOverdueMax: string;
  colorStatus: string;
  invoiceStatus: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export type InvoiceTab = 'open-invoices' | 'balanced-invoices' | 'paid-invoices' | 'payments';

export const DEFAULT_INVOICE_FILTERS: InvoiceFilters = {
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  daysOverdueMin: '',
  daysOverdueMax: '',
  colorStatus: '',
  invoiceStatus: '',
  sortBy: 'date',
  sortOrder: 'desc',
};

/** What gets stored on collection_tickets.source_filter. */
export interface TicketSourceFilter {
  tab: InvoiceTab;
  excludeCreditMemos: boolean;
  capturedAt: string;
  filters: InvoiceFilters;
}

export interface FilteredInvoice {
  id: string;
  reference_number: string;
  type: string;
  date: string;
  due_date: string | null;
  status: string;
  amount: number;
  balance: number;
  description: string | null;
  color_status: string | null;
  days_overdue: number | null;
}

/** Sort/order alone don't narrow anything, so they don't count as "active". */
export function hasActiveInvoiceFilters(filters: InvoiceFilters): boolean {
  return !!(
    filters.dateFrom ||
    filters.dateTo ||
    filters.amountMin ||
    filters.amountMax ||
    filters.daysOverdueMin ||
    filters.daysOverdueMax ||
    filters.colorStatus ||
    filters.invoiceStatus
  );
}

const TAB_LABEL: Record<InvoiceTab, string> = {
  'open-invoices': 'Open',
  'balanced-invoices': 'Balanced',
  'paid-invoices': 'Paid',
  payments: 'Payments',
};

const money = (v: string) => `$${Number(v).toLocaleString('en-US')}`;

/**
 * Short human summary, e.g. "Open · 90+ days overdue · $5,000+".
 * Used on ticket cards and the catch-up banner.
 */
export function describeInvoiceFilters(filters: InvoiceFilters, tab: InvoiceTab): string {
  const parts: string[] = [];

  if (filters.invoiceStatus) parts.push(filters.invoiceStatus);
  else if (tab !== 'payments') parts.push(TAB_LABEL[tab]);

  const { daysOverdueMin: dMin, daysOverdueMax: dMax } = filters;
  if (dMin && dMax) parts.push(`${dMin}–${dMax} days overdue`);
  else if (dMin) parts.push(`${dMin}+ days overdue`);
  else if (dMax) parts.push(`up to ${dMax} days overdue`);

  const { amountMin: aMin, amountMax: aMax } = filters;
  if (aMin && aMax) parts.push(`${money(aMin)}–${money(aMax)}`);
  else if (aMin) parts.push(`${money(aMin)}+`);
  else if (aMax) parts.push(`under ${money(aMax)}`);

  if (filters.dateFrom && filters.dateTo) parts.push(`dated ${filters.dateFrom} to ${filters.dateTo}`);
  else if (filters.dateFrom) parts.push(`dated from ${filters.dateFrom}`);
  else if (filters.dateTo) parts.push(`dated up to ${filters.dateTo}`);

  if (filters.colorStatus) parts.push(`${filters.colorStatus} status`);

  return parts.join(' · ') || 'All invoices';
}

/**
 * Build the argument object for get_customer_invoices_advanced /
 * get_customer_invoices_advanced_count. An explicit Invoice Status always wins
 * over the tab, which is how the Customer page has always behaved.
 */
export function invoiceFilterRpcParams(
  customerId: string,
  filters: InvoiceFilters,
  tab: InvoiceTab,
  excludeCreditMemos: boolean
) {
  const tabFilter =
    tab === 'open-invoices' ? 'open'
    : tab === 'balanced-invoices' ? 'balanced'
    : tab === 'paid-invoices' ? 'paid'
    : 'all';

  return {
    p_customer_id: customerId,
    p_filter: filters.invoiceStatus ? 'all' : tabFilter,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_amount_min: filters.amountMin ? parseFloat(filters.amountMin) : null,
    p_amount_max: filters.amountMax ? parseFloat(filters.amountMax) : null,
    p_color_status: filters.colorStatus || null,
    p_invoice_status: filters.invoiceStatus || null,
    p_exclude_credit_memos: excludeCreditMemos,
    p_min_days_overdue: filters.daysOverdueMin ? parseInt(filters.daysOverdueMin) : null,
    p_max_days_overdue: filters.daysOverdueMax ? parseInt(filters.daysOverdueMax) : null,
  };
}

const PAGE = 500;
/** Guard against a runaway "no filters at all" pull on a huge customer. */
const MAX_INVOICES = 5000;

/**
 * Every invoice matching the filters — not just the page the user has scrolled
 * into view. The Customer page lazy-loads 50 at a time, so "make a ticket from
 * what I'm looking at" has to go back to the server for the whole set.
 */
export async function fetchFilteredInvoices(
  customerId: string,
  filters: InvoiceFilters,
  tab: InvoiceTab,
  excludeCreditMemos: boolean
): Promise<FilteredInvoice[]> {
  const base = invoiceFilterRpcParams(customerId, filters, tab, excludeCreditMemos);
  const all: FilteredInvoice[] = [];

  for (let offset = 0; offset < MAX_INVOICES; offset += PAGE) {
    const { data, error } = await supabase.rpc('get_customer_invoices_advanced', {
      ...base,
      p_sort_by: filters.sortBy,
      p_sort_order: filters.sortOrder,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) throw error;

    const batch = (data || []) as FilteredInvoice[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }

  return all;
}

/** Count + totals for the same criteria, without pulling the rows. */
export async function fetchFilteredInvoiceTotals(
  customerId: string,
  filters: InvoiceFilters,
  tab: InvoiceTab,
  excludeCreditMemos: boolean
): Promise<{ total_count: number; total_amount: number; total_balance: number }> {
  const { data, error } = await supabase.rpc(
    'get_customer_invoices_advanced_count',
    invoiceFilterRpcParams(customerId, filters, tab, excludeCreditMemos)
  );
  if (error) throw error;
  return data?.[0] ?? { total_count: 0, total_amount: 0, total_balance: 0 };
}

/**
 * What a re-run of the stored filter would change: invoices that match now but
 * aren't on the ticket, and invoices on the ticket that have since been paid
 * off. Nothing is written — the caller shows this and waits for a click.
 */
export async function diffAgainstSourceFilter(
  customerId: string,
  source: TicketSourceFilter,
  currentRefs: string[]
): Promise<{ toAdd: FilteredInvoice[]; settled: string[]; matched: FilteredInvoice[] }> {
  const matched = await fetchFilteredInvoices(
    customerId,
    source.filters,
    source.tab,
    source.excludeCreditMemos
  );

  const onTicket = new Set(currentRefs);
  const stillMatching = new Set(matched.map(i => i.reference_number));

  return {
    matched,
    toAdd: matched.filter(i => !onTicket.has(i.reference_number)),
    // On the ticket but no longer in the filtered set — for an "Open" filter
    // that means it got paid, which is the case worth surfacing.
    settled: currentRefs.filter(ref => !stillMatching.has(ref)),
  };
}

/**
 * invoice_assignments.invoice_reference_number is globally UNIQUE, so an
 * invoice lives on at most one ticket. Before adding any, find which of these
 * refs are already spoken for and by which ticket — adding them would move them
 * off that ticket, which should never happen without the user knowing.
 */
export async function findExistingAssignments(
  refs: string[]
): Promise<Map<string, { ticketId: string | null; ticketNumber: string | null }>> {
  const out = new Map<string, { ticketId: string | null; ticketNumber: string | null }>();
  if (refs.length === 0) return out;

  const CHUNK = 200;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('invoice_assignments')
      .select('invoice_reference_number, ticket_id, collection_tickets(ticket_number)')
      .in('invoice_reference_number', refs.slice(i, i + CHUNK));
    if (error) throw error;

    (data || []).forEach((row: any) => {
      out.set(row.invoice_reference_number, {
        ticketId: row.ticket_id,
        ticketNumber: row.collection_tickets?.ticket_number ?? null,
      });
    });
  }
  return out;
}

/** Narrow an unknown jsonb value into a TicketSourceFilter, or null. */
export function parseSourceFilter(value: unknown): TicketSourceFilter | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<TicketSourceFilter>;
  if (!v.filters || typeof v.filters !== 'object' || !v.tab) return null;
  return {
    tab: v.tab as InvoiceTab,
    excludeCreditMemos: !!v.excludeCreditMemos,
    capturedAt: v.capturedAt || '',
    filters: { ...DEFAULT_INVOICE_FILTERS, ...v.filters },
  };
}
