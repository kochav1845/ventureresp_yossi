// xlsx-js-style is a drop-in SheetJS build that actually writes cell styles
// (fonts, fills, borders) — the community 'xlsx' build silently drops them.
import * as XLSX from 'xlsx-js-style';

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

export interface StatementCustomerData {
  customer_id: string;
  customer_name: string;
  email: string;
  terms: string;
  total_balance: number;
  credit_memo_balance: number;
  open_invoice_count: number;
  max_days_overdue: number;
  invoices: StatementInvoice[];
}

// ── Excel statement template (layout) ─────────────────────────────────────
// Controls how the per-customer statement sheet looks. Stored as jsonb in
// `statement_excel_templates.layout` and edited from the Statements page
// settings drawer. `DEFAULT_EXCEL_LAYOUT` reproduces the original hardcoded
// sheet, and is used whenever no template is configured.

export interface StatementExcelColumn {
  key: string;
  label: string;
  enabled: boolean;
}

export interface StatementExcelLayout {
  title: string; // supports {{customer_name}}, {{customer_id}}, {{date}}
  sheet_name: string;
  customer_fields: string[]; // ordered keys from CUSTOMER_FIELD_DEFS
  show_aging_summary: boolean;
  columns: StatementExcelColumn[];
  show_total_row: boolean;
}

export const CUSTOMER_FIELD_DEFS: { key: string; label: string }[] = [
  { key: 'customer_name', label: 'Customer' },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'email', label: 'Email' },
  { key: 'terms', label: 'Terms' },
  { key: 'statement_date', label: 'Statement Date' },
  { key: 'total_balance', label: 'Total Open Balance' },
];

export const INVOICE_COLUMN_DEFS: { key: string; label: string; width: number }[] = [
  { key: 'reference_number', label: 'Invoice #', width: 18 },
  { key: 'date', label: 'Date', width: 14 },
  { key: 'due_date', label: 'Due Date', width: 14 },
  { key: 'description', label: 'Description', width: 35 },
  { key: 'amount', label: 'Amount', width: 14 },
  { key: 'balance', label: 'Balance', width: 14 },
  { key: 'days_overdue', label: 'Days Overdue', width: 10 },
  { key: 'aging', label: 'Aging', width: 10 },
  { key: 'type', label: 'Type', width: 14 },
  { key: 'status', label: 'Status', width: 12 },
];

export const DEFAULT_EXCEL_LAYOUT: StatementExcelLayout = {
  title: 'Account Statement',
  sheet_name: 'Statement',
  customer_fields: ['customer_name', 'customer_id', 'email', 'terms', 'statement_date', 'total_balance'],
  show_aging_summary: true,
  columns: INVOICE_COLUMN_DEFS.map(c => ({
    key: c.key,
    label: c.label,
    enabled: c.key !== 'type' && c.key !== 'status',
  })),
  show_total_row: true,
};

// Merge a stored layout with defaults so older/partial layouts never break.
export function normalizeExcelLayout(raw: any): StatementExcelLayout {
  if (!raw || typeof raw !== 'object') return DEFAULT_EXCEL_LAYOUT;
  const validCols = new Set(INVOICE_COLUMN_DEFS.map(c => c.key));
  const columns: StatementExcelColumn[] = Array.isArray(raw.columns)
    ? raw.columns.filter((c: any) => c && validCols.has(c.key)).map((c: any) => ({
        key: c.key,
        label: typeof c.label === 'string' && c.label.trim()
          ? c.label
          : (INVOICE_COLUMN_DEFS.find(d => d.key === c.key)?.label || c.key),
        enabled: c.enabled !== false,
      }))
    : DEFAULT_EXCEL_LAYOUT.columns;
  // Append any columns the stored layout doesn't know about yet (disabled).
  INVOICE_COLUMN_DEFS.forEach(def => {
    if (!columns.some(c => c.key === def.key)) {
      columns.push({ key: def.key, label: def.label, enabled: false });
    }
  });
  return {
    title: typeof raw.title === 'string' ? raw.title : DEFAULT_EXCEL_LAYOUT.title,
    sheet_name: typeof raw.sheet_name === 'string' && raw.sheet_name.trim()
      ? raw.sheet_name.trim().slice(0, 31)
      : DEFAULT_EXCEL_LAYOUT.sheet_name,
    customer_fields: Array.isArray(raw.customer_fields)
      ? raw.customer_fields.filter((f: any) => CUSTOMER_FIELD_DEFS.some(d => d.key === f))
      : DEFAULT_EXCEL_LAYOUT.customer_fields,
    show_aging_summary: raw.show_aging_summary !== false,
    columns: columns.some(c => c.enabled) ? columns : DEFAULT_EXCEL_LAYOUT.columns,
    show_total_row: raw.show_total_row !== false,
  };
}

const fmtCurrency = (n: number) => n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
const fmtDate = (s: string) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

function getAgingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

function calculateAging(invoices: StatementInvoice[]) {
  const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  invoices.forEach(inv => {
    if (inv.balance <= 0) return;
    const d = inv.days_overdue;
    if (d <= 0) buckets.current += inv.balance;
    else if (d <= 30) buckets['1_30'] += inv.balance;
    else if (d <= 60) buckets['31_60'] += inv.balance;
    else if (d <= 90) buckets['61_90'] += inv.balance;
    else buckets['90_plus'] += inv.balance;
  });
  return buckets;
}

// ── Cell styles for the statement sheet ───────────────────────────────────
const BORDER = { style: 'thin', color: { rgb: 'CBD5E1' } };
const CELL_STYLES = {
  title: { font: { bold: true, sz: 16, color: { rgb: '1E293B' } } },
  section: { font: { bold: true, sz: 12, color: { rgb: '1E293B' } } },
  label: { font: { bold: true, sz: 10, color: { rgb: '64748B' } } },
  value: { font: { sz: 10, color: { rgb: '1E293B' } } },
  thead: {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '334155' } },
    border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  },
  agingHead: {
    font: { bold: true, sz: 10, color: { rgb: '334155' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  },
  cell: {
    font: { sz: 10, color: { rgb: '1E293B' } },
    border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
  },
  cellRight: {
    font: { sz: 10, color: { rgb: '1E293B' } },
    border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    alignment: { horizontal: 'right' },
  },
  total: {
    font: { bold: true, sz: 11, color: { rgb: '1E293B' } },
    border: { top: { style: 'medium', color: { rgb: '334155' } } },
    alignment: { horizontal: 'right' },
  },
} as const;

const RIGHT_ALIGNED_COLUMNS = new Set(['amount', 'balance', 'days_overdue']);

// Wrap a value as a styled SheetJS cell object.
function styled(v: any, s: any) {
  return { v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s };
}

function invoiceCellValue(inv: StatementInvoice, key: string): any {
  switch (key) {
    case 'reference_number': return inv.reference_number;
    case 'date': return fmtDate(inv.date);
    case 'due_date': return fmtDate(inv.due_date);
    case 'description': return inv.description || '';
    case 'amount': return fmtCurrency(inv.amount);
    case 'balance': return fmtCurrency(inv.balance);
    case 'days_overdue': return inv.balance < 0 ? '' : inv.days_overdue;
    case 'aging': return inv.balance < 0 ? 'Credit' : getAgingBucket(inv.days_overdue);
    case 'type': return inv.type || 'Invoice';
    case 'status': return inv.status || '';
    default: return '';
  }
}

function substituteTitle(title: string, customer: StatementCustomerData, today: string): string {
  return title
    .replace(/\{\{customer_name\}\}/g, customer.customer_name)
    .replace(/\{\{customer_id\}\}/g, customer.customer_id)
    .replace(/\{\{date\}\}/g, today);
}

export function generateCustomerStatementExcel(
  customer: StatementCustomerData,
  layout: StatementExcelLayout = DEFAULT_EXCEL_LAYOUT,
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const aging = calculateAging(customer.invoices);
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const customerFieldValue = (key: string): string => {
    switch (key) {
      case 'customer_name': return customer.customer_name;
      case 'customer_id': return customer.customer_id;
      case 'email': return customer.email || 'N/A';
      case 'terms': return customer.terms || 'N/A';
      case 'statement_date': return today;
      case 'total_balance': return fmtCurrency(customer.total_balance);
      default: return '';
    }
  };

  const rows: any[][] = [];
  if (layout.title.trim()) {
    rows.push([styled(substituteTitle(layout.title, customer, today), CELL_STYLES.title)]);
    rows.push([]);
  }

  if (layout.customer_fields.length > 0) {
    layout.customer_fields.forEach(key => {
      const def = CUSTOMER_FIELD_DEFS.find(d => d.key === key);
      if (def) rows.push([styled(`${def.label}:`, CELL_STYLES.label), styled(customerFieldValue(key), CELL_STYLES.value)]);
    });
    rows.push([]);
  }

  if (layout.show_aging_summary) {
    rows.push([styled('Aging Summary', CELL_STYLES.section)]);
    rows.push(['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'].map(h => styled(h, CELL_STYLES.agingHead)));
    rows.push([
      fmtCurrency(aging.current),
      fmtCurrency(aging['1_30']),
      fmtCurrency(aging['31_60']),
      fmtCurrency(aging['61_90']),
      fmtCurrency(aging['90_plus']),
      fmtCurrency(customer.total_balance),
    ].map(v => styled(v, CELL_STYLES.cellRight)));
    rows.push([]);
  }

  const enabledCols = layout.columns.filter(c => c.enabled);
  rows.push([styled('Open Invoices', CELL_STYLES.section)]);
  rows.push(enabledCols.map(c => styled(c.label, CELL_STYLES.thead)));

  const sortedInvoices = [...customer.invoices]
    .filter(inv => inv.balance !== 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedInvoices.forEach(inv => {
    rows.push(enabledCols.map(c => styled(
      invoiceCellValue(inv, c.key),
      RIGHT_ALIGNED_COLUMNS.has(c.key) ? CELL_STYLES.cellRight : CELL_STYLES.cell,
    )));
  });

  if (layout.show_total_row) {
    const netBalance = sortedInvoices.reduce((s, inv) => s + inv.balance, 0);
    rows.push([]);
    const totalRow: any[] = new Array(enabledCols.length).fill('');
    const balanceIdx = enabledCols.findIndex(c => c.key === 'balance');
    const valueIdx = balanceIdx >= 0 ? balanceIdx : Math.max(enabledCols.length - 1, 1);
    totalRow[valueIdx] = fmtCurrency(netBalance);
    totalRow[Math.max(valueIdx - 1, 0)] = 'TOTAL:';
    rows.push(totalRow.map(v => styled(v, CELL_STYLES.total)));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = enabledCols.map(c => ({
    wch: INVOICE_COLUMN_DEFS.find(d => d.key === c.key)?.width || 14,
  }));
  if (ws['!cols'].length < 2) ws['!cols'] = [{ wch: 22 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(wb, ws, layout.sheet_name.trim().slice(0, 31) || 'Statement');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export function generateBatchStatementExcel(customers: StatementCustomerData[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const summaryRows: any[][] = [
    ['Customer Statement Summary'],
    [`Generated: ${today}`],
    [],
    ['Customer ID', 'Customer Name', 'Email', 'Terms', 'Open Invoices', 'Total Balance', 'Max Days Overdue', 'Current', '1-30', '31-60', '61-90', '90+'],
  ];

  const sorted = [...customers].sort((a, b) => b.total_balance - a.total_balance);
  let grandTotal = 0;

  sorted.forEach(c => {
    const aging = calculateAging(c.invoices);
    grandTotal += c.total_balance;
    summaryRows.push([
      c.customer_id,
      c.customer_name,
      c.email || '',
      c.terms || '',
      c.open_invoice_count,
      fmtCurrency(c.total_balance),
      c.max_days_overdue,
      fmtCurrency(aging.current),
      fmtCurrency(aging['1_30']),
      fmtCurrency(aging['31_60']),
      fmtCurrency(aging['61_90']),
      fmtCurrency(aging['90_plus']),
    ]);
  });

  summaryRows.push([]);
  summaryRows.push(['', '', '', 'GRAND TOTAL:', customers.reduce((s, c) => s + c.open_invoice_count, 0), fmtCurrency(grandTotal)]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [
    { wch: 16 }, { wch: 30 }, { wch: 28 }, { wch: 12 },
    { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const detailRows: any[][] = [
    ['Invoice Detail - All Customers'],
    [`Generated: ${today}`],
    [],
    ['Customer ID', 'Customer Name', 'Invoice #', 'Date', 'Due Date', 'Description', 'Amount', 'Balance', 'Days Overdue', 'Aging'],
  ];

  sorted.forEach(c => {
    const sortedInv = [...c.invoices]
      .filter(inv => inv.balance !== 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedInv.forEach(inv => {
      detailRows.push([
        c.customer_id,
        c.customer_name,
        inv.reference_number,
        fmtDate(inv.date),
        fmtDate(inv.due_date),
        inv.description || '',
        fmtCurrency(inv.amount),
        fmtCurrency(inv.balance),
        inv.balance < 0 ? '' : inv.days_overdue,
        inv.balance < 0 ? 'Credit' : getAgingBucket(inv.days_overdue),
      ]);
    });
  });

  detailRows.push([]);
  detailRows.push(['', '', '', '', '', 'GRAND TOTAL:', '', fmtCurrency(grandTotal)]);

  const detailWs = XLSX.utils.aoa_to_sheet(detailRows);
  detailWs['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 14 },
    { wch: 14 }, { wch: 35 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, detailWs, 'Invoice Detail');

  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function downloadExcelFile(data: Uint8Array, filename: string): void {
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
