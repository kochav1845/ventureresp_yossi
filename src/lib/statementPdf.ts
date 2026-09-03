// PDF rendering of a customer statement. Follows the same Excel template
// layout (title, customer fields, aging summary, columns, total row) so the
// PDF and the spreadsheet always match. Uses html2pdf.js (already a dep).
import {
  CUSTOMER_FIELD_DEFS,
  DEFAULT_EXCEL_LAYOUT,
  type StatementExcelLayout,
  type StatementCustomerData,
  type StatementInvoice,
} from './statementExport';

const fmtCurrency = (n: number) => n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
const fmtDate = (s: string) => {
  if (!s) return '';
  return new Date(s).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cellValue(inv: StatementInvoice, key: string): string {
  switch (key) {
    case 'reference_number': return inv.reference_number;
    case 'date': return fmtDate(inv.date);
    case 'due_date': return fmtDate(inv.due_date);
    case 'description': return inv.description || '';
    case 'amount': return fmtCurrency(inv.amount);
    case 'balance': return fmtCurrency(inv.balance);
    case 'days_overdue': return inv.balance < 0 ? '' : String(inv.days_overdue);
    case 'aging': return inv.balance < 0 ? 'Credit' : agingBucket(inv.days_overdue);
    case 'type': return inv.type || 'Invoice';
    case 'status': return inv.status || '';
    default: return '';
  }
}

const RIGHT_COLS = new Set(['amount', 'balance', 'days_overdue']);

function buildStatementHtml(customer: StatementCustomerData, layout: StatementExcelLayout): string {
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const title = layout.title
    .replace(/\{\{customer_name\}\}/g, customer.customer_name)
    .replace(/\{\{customer_id\}\}/g, customer.customer_id)
    .replace(/\{\{date\}\}/g, today);

  const fieldValue = (key: string): string => {
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

  const invoices = [...customer.invoices]
    .filter(inv => inv.balance !== 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const total = invoices.reduce((s, inv) => s + inv.balance, 0);

  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  invoices.forEach(inv => {
    if (inv.balance <= 0) return;
    const d = inv.days_overdue;
    if (d <= 0) buckets.current += inv.balance;
    else if (d <= 30) buckets.d30 += inv.balance;
    else if (d <= 60) buckets.d60 += inv.balance;
    else if (d <= 90) buckets.d90 += inv.balance;
    else buckets.d90plus += inv.balance;
  });

  const cols = layout.columns.filter(c => c.enabled);
  const th = 'padding:6px 8px;border:1px solid #cbd5e1;background:#334155;color:#fff;font-weight:600;text-align:left;font-size:10px;';
  const td = 'padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;color:#1e293b;';

  let html = `<div style="font-family:Helvetica,Arial,sans-serif;padding:24px;color:#1e293b;">`;
  if (layout.title.trim()) {
    html += `<h1 style="font-size:20px;margin:0 0 16px;color:#1e293b;">${esc(title)}</h1>`;
  }
  if (layout.customer_fields.length > 0) {
    html += `<table style="border-collapse:collapse;margin-bottom:16px;">`;
    layout.customer_fields.forEach(key => {
      const def = CUSTOMER_FIELD_DEFS.find(d => d.key === key);
      if (!def) return;
      html += `<tr><td style="padding:2px 16px 2px 0;font-size:10px;font-weight:600;color:#64748b;">${esc(def.label)}:</td><td style="padding:2px 0;font-size:10px;">${esc(fieldValue(key))}</td></tr>`;
    });
    html += `</table>`;
  }
  if (layout.show_aging_summary) {
    html += `<h2 style="font-size:13px;margin:0 0 6px;">Aging Summary</h2>`;
    html += `<table style="border-collapse:collapse;margin-bottom:16px;width:100%;"><tr>`;
    ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'].forEach(h => {
      html += `<td style="padding:5px 8px;border:1px solid #cbd5e1;background:#e2e8f0;font-weight:600;font-size:10px;">${h}</td>`;
    });
    html += `</tr><tr>`;
    [buckets.current, buckets.d30, buckets.d60, buckets.d90, buckets.d90plus, customer.total_balance].forEach(v => {
      html += `<td style="${td}text-align:right;">${fmtCurrency(v)}</td>`;
    });
    html += `</tr></table>`;
  }
  html += `<h2 style="font-size:13px;margin:0 0 6px;">Open Invoices</h2>`;
  html += `<table style="border-collapse:collapse;width:100%;"><thead><tr>`;
  cols.forEach(c => { html += `<th style="${th}">${esc(c.label)}</th>`; });
  html += `</tr></thead><tbody>`;
  invoices.forEach(inv => {
    html += `<tr>`;
    cols.forEach(c => {
      html += `<td style="${td}${RIGHT_COLS.has(c.key) ? 'text-align:right;' : ''}">${esc(cellValue(inv, c.key))}</td>`;
    });
    html += `</tr>`;
  });
  if (layout.show_total_row && cols.length > 0) {
    const balanceIdx = cols.findIndex(c => c.key === 'balance');
    const valueIdx = balanceIdx >= 0 ? balanceIdx : Math.max(cols.length - 1, 1);
    const labelIdx = Math.max(valueIdx - 1, 0);
    html += `<tr>`;
    cols.forEach((_, i) => {
      const v = i === valueIdx ? fmtCurrency(total) : i === labelIdx ? 'TOTAL:' : '';
      html += `<td style="padding:6px 8px;border-top:2px solid #334155;font-weight:700;font-size:11px;text-align:right;">${v}</td>`;
    });
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;
  return html;
}

const PDF_OPTIONS = (filename: string) => ({
  margin: [8, 8, 12, 8],
  filename,
  image: { type: 'jpeg', quality: 0.95 },
  html2canvas: { scale: 2, useCORS: true },
  jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
  pagebreak: { mode: ['avoid-all', 'css'] },
});

export function statementPdfFilename(customer: StatementCustomerData): string {
  const safeName = customer.customer_name.replace(/[^a-zA-Z0-9]/g, '_');
  return `Statement_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`;
}

// Returns the PDF as a base64 string (no data: prefix) for email attachment.
export async function generateCustomerStatementPdf(
  customer: StatementCustomerData,
  layout: StatementExcelLayout = DEFAULT_EXCEL_LAYOUT,
): Promise<string> {
  const { default: html2pdf } = await import('html2pdf.js');
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;background:#fff;';
  container.innerHTML = buildStatementHtml(customer, layout);
  document.body.appendChild(container);
  try {
    const dataUri: string = await html2pdf().set(PDF_OPTIONS(statementPdfFilename(customer)))
      .from(container).outputPdf('datauristring');
    return dataUri.split(',')[1] || '';
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadCustomerStatementPdf(
  customer: StatementCustomerData,
  layout: StatementExcelLayout = DEFAULT_EXCEL_LAYOUT,
): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js');
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:816px;background:#fff;';
  container.innerHTML = buildStatementHtml(customer, layout);
  document.body.appendChild(container);
  try {
    await html2pdf().set(PDF_OPTIONS(statementPdfFilename(customer))).from(container).save();
  } finally {
    document.body.removeChild(container);
  }
}
