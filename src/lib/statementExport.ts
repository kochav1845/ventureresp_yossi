import * as XLSX from 'xlsx';

export interface StatementInvoice {
  reference_number: string;
  date: string;
  due_date: string;
  amount: number;
  balance: number;
  status: string;
  description: string;
  days_overdue: number;
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

const fmtCurrency = (n: number) => `$${Math.abs(n).toFixed(2)}`;
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

export function generateCustomerStatementExcel(customer: StatementCustomerData): Uint8Array {
  const wb = XLSX.utils.book_new();
  const aging = calculateAging(customer.invoices);
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const headerRows: any[][] = [
    ['Account Statement'],
    [],
    ['Customer:', customer.customer_name],
    ['Customer ID:', customer.customer_id],
    ['Email:', customer.email || 'N/A'],
    ['Terms:', customer.terms || 'N/A'],
    ['Statement Date:', today],
    ['Total Open Balance:', fmtCurrency(customer.total_balance)],
    [],
    ['Aging Summary'],
    ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'],
    [
      fmtCurrency(aging.current),
      fmtCurrency(aging['1_30']),
      fmtCurrency(aging['31_60']),
      fmtCurrency(aging['61_90']),
      fmtCurrency(aging['90_plus']),
      fmtCurrency(customer.total_balance),
    ],
    [],
    ['Open Invoices'],
    ['Invoice #', 'Date', 'Due Date', 'Description', 'Amount', 'Balance', 'Days Overdue', 'Aging'],
  ];

  const sortedInvoices = [...customer.invoices]
    .filter(inv => inv.balance > 0)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  sortedInvoices.forEach(inv => {
    headerRows.push([
      inv.reference_number,
      fmtDate(inv.date),
      fmtDate(inv.due_date),
      inv.description || '',
      fmtCurrency(inv.amount),
      fmtCurrency(inv.balance),
      inv.days_overdue,
      getAgingBucket(inv.days_overdue),
    ]);
  });

  headerRows.push([]);
  headerRows.push(['', '', '', 'TOTAL:', '', fmtCurrency(customer.total_balance), '', '']);

  const ws = XLSX.utils.aoa_to_sheet(headerRows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 35 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Statement');
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
      .filter(inv => inv.balance > 0)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

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
        inv.days_overdue,
        getAgingBucket(inv.days_overdue),
      ]);
    });
  });

  detailRows.push([]);
  detailRows.push(['', '', '', '', '', 'GRAND TOTAL:', '', fmtCurrency(grandTotal)]);

  const detailWs = XLSX.utils.aoa_to_sheet(detailRows);
  detailWs['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 14 },
    { wch: 14 }, { wch: 35 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 12 },
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
