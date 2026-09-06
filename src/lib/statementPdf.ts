// PDF rendering of a customer statement. Follows the same Excel template
// layout (title, customer fields, aging summary, columns, total row) so the
// PDF and the spreadsheet always match. The actual PDF is drawn directly with
// jsPDF (vector text/tables); `buildStatementHtml` below is only the on-screen
// preview. We moved off html2canvas rasterization because it produced blank
// pages when the tab lost focus mid batch-send.
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

export function buildStatementHtml(customer: StatementCustomerData, layout: StatementExcelLayout): string {
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

export function statementPdfFilename(customer: StatementCustomerData): string {
  const safeName = customer.customer_name.replace(/[^a-zA-Z0-9]/g, '_');
  return `Statement_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`;
}

// ─────────────────────────────────────────────────────────────────────────
// Direct vector rendering with jsPDF. We build the statement as real PDF text
// and tables rather than rasterizing HTML with html2canvas — the latter
// produced blank pages when the tab lost focus during a batch send and was
// heavier. jsPDF output is crisp, tiny, text-selectable, and never blank.
// ─────────────────────────────────────────────────────────────────────────

type Align = 'left' | 'right';
type RGB = [number, number, number];

// Trim a string with an ellipsis until it fits `maxW` at the current font.
function fitText(doc: any, text: string, maxW: number): string {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}

interface RowStyle {
  h: number;
  fontSize: number;
  fontStyle: 'normal' | 'bold';
  textColor: RGB;
  fill?: RGB;
  border?: boolean;
  borderColor?: RGB;
}

function drawRow(
  doc: any, x: number, y: number, widths: number[],
  cells: { text: string; align: Align }[], style: RowStyle,
): number {
  const { h, fontSize, fontStyle, textColor, fill, border = true, borderColor = [226, 232, 240] } = style;
  doc.setFont('helvetica', fontStyle);
  doc.setFontSize(fontSize);
  let cx = x;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    if (fill) { doc.setFillColor(fill[0], fill[1], fill[2]); doc.rect(cx, y, w, h, 'F'); }
    if (border) { doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]); doc.rect(cx, y, w, h, 'S'); }
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    const pad = 4;
    const txt = fitText(doc, cells[i]?.text || '', w - pad * 2);
    const ty = y + h / 2 + fontSize * 0.35;
    if (cells[i]?.align === 'right') doc.text(txt, cx + w - pad, ty, { align: 'right' });
    else doc.text(txt, cx + pad, ty, { align: 'left' });
    cx += w;
  }
  return y + h;
}

// Relative column widths for the invoice table (scaled to fit the page).
const COLUMN_WEIGHTS: Record<string, number> = {
  reference_number: 1.3, date: 1, due_date: 1, description: 2.4,
  amount: 1.1, balance: 1.1, days_overdue: 0.9, aging: 0.9, type: 1, status: 1,
};

async function renderStatementDoc(customer: StatementCustomerData, layout: StatementExcelLayout): Promise<any> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const contentW = pageW - M * 2;
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  let y = M;

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

  // Title
  const title = layout.title
    .replace(/\{\{customer_name\}\}/g, customer.customer_name)
    .replace(/\{\{customer_id\}\}/g, customer.customer_id)
    .replace(/\{\{date\}\}/g, today);
  if (layout.title.trim()) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(30, 41, 59);
    doc.text(title, M, y + 12); y += 34;
  }

  // Customer info block
  if (layout.customer_fields.length > 0) {
    doc.setFontSize(10);
    for (const key of layout.customer_fields) {
      const def = CUSTOMER_FIELD_DEFS.find(d => d.key === key);
      if (!def) continue;
      doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
      doc.text(`${def.label}:`, M, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
      doc.text(fieldValue(key), M + 120, y);
      y += 15;
    }
    y += 10;
  }

  const invoices = [...customer.invoices]
    .filter(inv => inv.balance !== 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const total = invoices.reduce((s, inv) => s + inv.balance, 0);

  // Aging summary
  if (layout.show_aging_summary) {
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
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 41, 59);
    doc.text('Aging Summary', M, y); y += 8;
    const agHeaders = ['Current', '1-30', '31-60', '61-90', '90+', 'Total'];
    const agVals = [buckets.current, buckets.d30, buckets.d60, buckets.d90, buckets.d90plus, customer.total_balance];
    const agW = agHeaders.map(() => contentW / 6);
    y = drawRow(doc, M, y, agW, agHeaders.map(h => ({ text: h, align: 'left' as Align })),
      { h: 18, fontSize: 9, fontStyle: 'bold', textColor: [30, 41, 59], fill: [226, 232, 240], borderColor: [203, 213, 225] });
    y = drawRow(doc, M, y, agW, agVals.map(v => ({ text: fmtCurrency(v), align: 'right' as Align })),
      { h: 18, fontSize: 9, fontStyle: 'normal', textColor: [30, 41, 59] });
    y += 18;
  }

  // Open invoices
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 41, 59);
  doc.text('Open Invoices', M, y); y += 8;

  const cols = layout.columns.filter(c => c.enabled);
  const weights = cols.map(c => COLUMN_WEIGHTS[c.key] ?? 1);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map(w => (w / wsum) * contentW);

  const headerCells = cols.map(c => ({ text: c.label, align: (RIGHT_COLS.has(c.key) ? 'right' : 'left') as Align }));
  const headerStyle: RowStyle = { h: 18, fontSize: 9, fontStyle: 'bold', textColor: [255, 255, 255], fill: [51, 65, 85], borderColor: [51, 65, 85] };
  const rowH = 16;

  y = drawRow(doc, M, y, widths, headerCells, headerStyle);
  for (const inv of invoices) {
    if (y + rowH > pageH - M) {
      doc.addPage(); y = M;
      y = drawRow(doc, M, y, widths, headerCells, headerStyle); // repeat header on new page
    }
    const cells = cols.map(c => ({ text: cellValue(inv, c.key), align: (RIGHT_COLS.has(c.key) ? 'right' : 'left') as Align }));
    y = drawRow(doc, M, y, widths, cells, { h: rowH, fontSize: 9, fontStyle: 'normal', textColor: [30, 41, 59] });
  }

  // Total row
  if (layout.show_total_row && cols.length > 0) {
    const balanceIdx = cols.findIndex(c => c.key === 'balance');
    const valueIdx = balanceIdx >= 0 ? balanceIdx : Math.max(cols.length - 1, 1);
    const labelIdx = Math.max(valueIdx - 1, 0);
    if (y + rowH > pageH - M) { doc.addPage(); y = M; }
    const totalCells = cols.map((_, i) => ({
      text: i === valueIdx ? fmtCurrency(total) : i === labelIdx ? 'TOTAL:' : '',
      align: 'right' as Align,
    }));
    // Heavy top border to set the total apart.
    doc.setDrawColor(51, 65, 85); doc.setLineWidth(1.2);
    doc.line(M, y, M + contentW, y); doc.setLineWidth(1);
    y = drawRow(doc, M, y, widths, totalCells,
      { h: rowH + 2, fontSize: 10, fontStyle: 'bold', textColor: [30, 41, 59], border: false });
  }

  return doc;
}

// Returns the PDF as a base64 string (no data: prefix) for email attachment.
export async function generateCustomerStatementPdf(
  customer: StatementCustomerData,
  layout: StatementExcelLayout = DEFAULT_EXCEL_LAYOUT,
): Promise<string> {
  const doc = await renderStatementDoc(customer, layout);
  // `datauristring` → "data:application/pdf;...;base64,XXXX"; take the base64.
  const dataUri: string = doc.output('datauristring');
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  return base64 || '';
}

export async function downloadCustomerStatementPdf(
  customer: StatementCustomerData,
  layout: StatementExcelLayout = DEFAULT_EXCEL_LAYOUT,
): Promise<void> {
  const doc = await renderStatementDoc(customer, layout);
  doc.save(statementPdfFilename(customer));
}
