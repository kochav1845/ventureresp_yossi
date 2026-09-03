import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
// Style-capable SheetJS build — same library the frontend uses, so automatic
// statements get the same styled Excel attachment as manual sends.
import * as XLSX from "npm:xlsx-js-style@1.2.0";

// Scheduled statement sender. Runs off a cron every few minutes. It only does
// anything for organizations that have explicitly switched automation ON
// (statement_auto_send_config.enabled = true) — so it is inert by default.
// It reuses the existing send-customer-invoice-email function as the actual sender
// and dedups per (rule, customer, month) so a customer gets at most one automatic
// statement per rule per calendar month.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function nowInTz(tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")) };
}

function effectiveDay(day: number, year: number, month1: number) {
  const lastDay = new Date(year, month1, 0).getDate(); // month1 is 1-based; day 0 of next month = last day
  return Math.min(day || 1, lastDay);
}

// ── Excel statement attachment (mirrors src/lib/statementExport.ts) ────────
const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  customer_name: "Customer", customer_id: "Customer ID", email: "Email",
  terms: "Terms", statement_date: "Statement Date", total_balance: "Total Open Balance",
};
const COLUMN_WIDTHS: Record<string, number> = {
  reference_number: 18, date: 14, due_date: 14, description: 35, amount: 14,
  balance: 14, days_overdue: 10, aging: 10, type: 14, status: 12,
};
const DEFAULT_LAYOUT = {
  title: "Account Statement",
  sheet_name: "Statement",
  customer_fields: ["customer_name", "customer_id", "email", "terms", "statement_date", "total_balance"],
  show_aging_summary: true,
  columns: [
    { key: "reference_number", label: "Invoice #", enabled: true },
    { key: "date", label: "Date", enabled: true },
    { key: "due_date", label: "Due Date", enabled: true },
    { key: "description", label: "Description", enabled: true },
    { key: "amount", label: "Amount", enabled: true },
    { key: "balance", label: "Balance", enabled: true },
    { key: "days_overdue", label: "Days Overdue", enabled: true },
    { key: "aging", label: "Aging", enabled: true },
  ],
  show_total_row: true,
};

const BORDER = { style: "thin", color: { rgb: "CBD5E1" } };
const ST = {
  title: { font: { bold: true, sz: 16, color: { rgb: "1E293B" } } },
  section: { font: { bold: true, sz: 12, color: { rgb: "1E293B" } } },
  label: { font: { bold: true, sz: 10, color: { rgb: "64748B" } } },
  value: { font: { sz: 10, color: { rgb: "1E293B" } } },
  thead: { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "334155" } }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } },
  agingHead: { font: { bold: true, sz: 10, color: { rgb: "334155" } }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } },
  cell: { font: { sz: 10, color: { rgb: "1E293B" } }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER } },
  cellRight: { font: { sz: 10, color: { rgb: "1E293B" } }, border: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }, alignment: { horizontal: "right" } },
  total: { font: { bold: true, sz: 11, color: { rgb: "1E293B" } }, border: { top: { style: "medium", color: { rgb: "334155" } } }, alignment: { horizontal: "right" } },
};
const RIGHT_COLS = new Set(["amount", "balance", "days_overdue"]);
const styled = (v: unknown, s: unknown) => ({ v: v ?? "", t: typeof v === "number" ? "n" : "s", s });
const money = (n: number) => n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
const shortDate = (s: string) => s ? new Date(s).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";
const bucket = (d: number) => d <= 0 ? "Current" : d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+";

interface StatementInv {
  reference_number: string; date: string; due_date: string; amount: number;
  balance: number; description: string; days_overdue: number; type: string; status: string;
}

function buildStatementExcelBase64(
  cust: { customer_id: string; customer_name: string; email: string; terms: string },
  invoices: StatementInv[],
  layout: any,
): string {
  const l = {
    ...DEFAULT_LAYOUT, ...(layout || {}),
    columns: Array.isArray(layout?.columns) && layout.columns.length ? layout.columns : DEFAULT_LAYOUT.columns,
    customer_fields: Array.isArray(layout?.customer_fields) ? layout.customer_fields : DEFAULT_LAYOUT.customer_fields,
  };
  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const sorted = [...invoices].filter(i => i.balance !== 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const total = sorted.reduce((s, i) => s + i.balance, 0);

  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  sorted.forEach(i => {
    if (i.balance <= 0) return;
    const d = i.days_overdue;
    if (d <= 0) buckets.current += i.balance;
    else if (d <= 30) buckets.d30 += i.balance;
    else if (d <= 60) buckets.d60 += i.balance;
    else if (d <= 90) buckets.d90 += i.balance;
    else buckets.d90p += i.balance;
  });

  const fieldVal = (key: string) => key === "customer_name" ? cust.customer_name
    : key === "customer_id" ? cust.customer_id
    : key === "email" ? (cust.email || "N/A")
    : key === "terms" ? (cust.terms || "N/A")
    : key === "statement_date" ? today
    : key === "total_balance" ? money(total) : "";

  const colVal = (inv: StatementInv, key: string): unknown => {
    switch (key) {
      case "reference_number": return inv.reference_number;
      case "date": return shortDate(inv.date);
      case "due_date": return shortDate(inv.due_date);
      case "description": return inv.description || "";
      case "amount": return money(inv.amount);
      case "balance": return money(inv.balance);
      case "days_overdue": return inv.balance < 0 ? "" : inv.days_overdue;
      case "aging": return inv.balance < 0 ? "Credit" : bucket(inv.days_overdue);
      case "type": return inv.type || "Invoice";
      case "status": return inv.status || "";
      default: return "";
    }
  };

  const rows: unknown[][] = [];
  const title = String(l.title || "").replace(/\{\{customer_name\}\}/g, cust.customer_name)
    .replace(/\{\{customer_id\}\}/g, cust.customer_id).replace(/\{\{date\}\}/g, today);
  if (title.trim()) { rows.push([styled(title, ST.title)]); rows.push([]); }
  (l.customer_fields as string[]).forEach(key => {
    const label = CUSTOMER_FIELD_LABELS[key];
    if (label) rows.push([styled(`${label}:`, ST.label), styled(fieldVal(key), ST.value)]);
  });
  if ((l.customer_fields as string[]).length) rows.push([]);
  if (l.show_aging_summary !== false) {
    rows.push([styled("Aging Summary", ST.section)]);
    rows.push(["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Total"].map(h => styled(h, ST.agingHead)));
    rows.push([buckets.current, buckets.d30, buckets.d60, buckets.d90, buckets.d90p, total].map(v => styled(money(v), ST.cellRight)));
    rows.push([]);
  }
  const cols = (l.columns as any[]).filter(c => c.enabled !== false);
  rows.push([styled("Open Invoices", ST.section)]);
  rows.push(cols.map(c => styled(c.label, ST.thead)));
  sorted.forEach(inv => rows.push(cols.map(c => styled(colVal(inv, c.key), RIGHT_COLS.has(c.key) ? ST.cellRight : ST.cell))));
  if (l.show_total_row !== false) {
    rows.push([]);
    const totalRow: unknown[] = new Array(cols.length).fill("");
    const bIdx = cols.findIndex(c => c.key === "balance");
    const vIdx = bIdx >= 0 ? bIdx : Math.max(cols.length - 1, 1);
    totalRow[vIdx] = money(total);
    totalRow[Math.max(vIdx - 1, 0)] = "TOTAL:";
    rows.push(totalRow.map(v => styled(v, ST.total)));
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = cols.map(c => ({ wch: COLUMN_WIDTHS[c.key] || 14 }));
  XLSX.utils.book_append_sheet(wb, ws, String(l.sheet_name || "Statement").slice(0, 31) || "Statement");
  const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Orgs that have switched automation ON.
    const { data: cfg } = await supabase.from("statement_auto_send_config").select("organization_id").eq("enabled", true);
    const enabledOrgs = new Set((cfg || []).map((c: any) => c.organization_id));
    if (enabledOrgs.size === 0) return json({ ok: true, sent: 0, note: "no organizations have automation enabled" });

    const { data: allRules } = await supabase.from("statement_auto_send_rules").select("*").eq("is_active", true);
    const rules = (allRules || []).filter((r: any) => enabledOrgs.has(r.organization_id));
    if (rules.length === 0) return json({ ok: true, sent: 0, note: "no active rules" });

    // Manual per-customer email overrides take precedence over synced emails.
    const { data: ovRows } = await supabase.from("statement_email_overrides").select("customer_id, email");
    const emailOverrides = new Map<string, string>((ovRows || []).map((o: any) => [o.customer_id, o.email]));

    // Default Excel statement layout (from the Statements settings drawer).
    let excelLayout: any = null;
    try {
      const { data: xt } = await supabase.from("statement_excel_templates").select("layout").eq("is_default", true).maybeSingle();
      excelLayout = xt?.layout || null;
    } catch (_) { /* table may not exist yet — the built-in default is used */ }

    const byOrg = new Map<string, any[]>();
    for (const r of rules) {
      if (!byOrg.has(r.organization_id)) byOrg.set(r.organization_id, []);
      byOrg.get(r.organization_id)!.push(r);
    }

    let sent = 0, failed = 0, skipped = 0;

    for (const [orgId, orgRules] of byOrg) {
      // Customers with their own per-customer rule override the "all" rule.
      const specificCustomers = new Set<string>();
      for (const r of orgRules) if (r.scope === "specific") (r.customer_ids || []).forEach((c: string) => specificCustomers.add(c));

      for (const rule of orgRules) {
        const t = nowInTz(rule.timezone || "America/New_York");
        const eff = effectiveDay(rule.day_of_month, t.year, t.month);
        if (t.day !== eff) continue;
        const [hh, mm] = String(rule.time_of_day || "09:00").split(":").map(Number);
        if (t.hour * 60 + t.minute < hh * 60 + (mm || 0)) continue; // not time yet today
        const period = `${t.year}-${String(t.month).padStart(2, "0")}`;

        // Resolve targets.
        let targets: string[] = [];
        if (rule.scope === "specific") {
          targets = (rule.customer_ids || []);
        } else {
          const excluded = new Set<string>([...(rule.excluded_customer_ids || []), ...specificCustomers]);
          const PAGE = 1000;
          for (let from = 0; ; from += PAGE) {
            const { data: bal } = await supabase.from("cached_customer_balances")
              .select("customer_id, calculated_balance")
              .eq("organization_id", orgId).eq("is_test_customer", false)
              .gt("calculated_balance", 0).gte("calculated_balance", rule.min_balance || 0)
              .range(from, from + PAGE - 1);
            const batch = bal || [];
            batch.forEach((b: any) => { if (!excluded.has(b.customer_id)) targets.push(b.customer_id); });
            if (batch.length < PAGE) break;
          }
        }

        // Resolve template (rule's, else org/global default).
        let template: any = null;
        if (rule.template_id) {
          const { data } = await supabase.from("customer_report_templates").select("*").eq("id", rule.template_id).maybeSingle();
          template = data;
        }
        if (!template) {
          const { data } = await supabase.from("customer_report_templates").select("*").eq("is_default", true).maybeSingle();
          template = data;
        }
        if (!template) { continue; }

        for (const cid of targets) {
          // Dedup claim — one send per (rule, customer, month).
          const { error: claimErr } = await supabase.from("statement_auto_send_logs")
            .insert({ rule_id: rule.id, organization_id: orgId, customer_id: cid, period, status: "pending" });
          if (claimErr) { skipped++; continue; }

          const finalize = (status: string, messageId: string | null, error: string | null) =>
            supabase.from("statement_auto_send_logs").update({ status, message_id: messageId, error, sent_at: new Date().toISOString() })
              .eq("rule_id", rule.id).eq("customer_id", cid).eq("period", period);

          try {
            const { data: cust } = await supabase.from("acumatica_customers")
              .select("customer_id, customer_name, email_address, billing_email, general_email, terms")
              .eq("customer_id", cid).eq("organization_id", orgId).maybeSingle();
            const email = emailOverrides.get(cid) || cust?.email_address || cust?.billing_email || cust?.general_email || "";
            if (!email) { await finalize("failed", null, "no email on file"); failed++; continue; }

            const { data: invRows } = await supabase.from("acumatica_invoices")
              .select("reference_number, date, due_date, amount, dac_total, balance, status, description, type")
              .eq("customer", cid).eq("organization_id", orgId)
              .gt("balance", 0).neq("status", "On Hold").neq("status", "Voided").neq("status", "Draft")
              .order("due_date", { ascending: true });

            const today = new Date();
            const statementInvoices: StatementInv[] = (invRows || []).map((inv: any) => {
              const isCredit = inv.type === "Credit Memo" || inv.type === "Credit WO";
              const amt = Number(inv.amount) || Number(inv.dac_total) || 0;
              const bal = Number(inv.balance) || 0;
              const due = inv.due_date ? new Date(inv.due_date) : today;
              const overdue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
              return {
                reference_number: inv.reference_number,
                date: inv.date,
                due_date: inv.due_date,
                amount: isCredit ? -Math.abs(amt) : amt,
                balance: isCredit ? -Math.abs(bal) : bal,
                description: inv.description || "",
                days_overdue: isCredit ? 0 : overdue,
                type: inv.type || "Invoice",
                status: inv.status || "",
              };
            });
            const invoices = statementInvoices.map((inv) => ({
              reference_number: inv.reference_number,
              invoice_date: inv.date,
              due_date: inv.due_date,
              amount: inv.amount,
              balance: inv.balance,
              description: inv.description,
            }));
            if (invoices.length === 0) { await finalize("skipped", null, "no open invoices"); skipped++; continue; }

            // Same styled Excel attachment manual sends produce.
            let excelBase64: string | null = null;
            try {
              excelBase64 = buildStatementExcelBase64(
                { customer_id: cid, customer_name: cust?.customer_name || cid, email, terms: cust?.terms || "" },
                statementInvoices,
                excelLayout,
              );
            } catch (e) {
              console.error("excel generation failed for", cid, e);
            }

            const balance = invoices.reduce((s, i) => s + i.balance, 0);
            const dueDates = (invRows || []).map((i: any) => i.due_date).filter(Boolean).sort();
            const oldest = dueDates[0] || null;
            const daysOverdue = oldest ? Math.max(0, Math.floor((today.getTime() - new Date(oldest).getTime()) / 86400000)) : 0;

            const resp = await fetch(`${supabaseUrl}/functions/v1/send-customer-invoice-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                templateId: rule.template_id,
                templateName: template.name,
                template: { subject: template.subject, body: template.body, include_invoice_table: true },
                customerData: {
                  customer_name: cust?.customer_name || cid,
                  customer_id: cid,
                  customer_email: email,
                  balance,
                  total_invoices: invoices.length,
                  invoices,
                  oldest_invoice_date: oldest,
                  days_overdue: daysOverdue,
                },
                excelBase64,
                department: "ar",
                organizationId: orgId,
              }),
            });
            const result = await resp.json().catch(() => ({}));
            if (resp.ok && result.success) { await finalize("sent", result.messageId || null, null); sent++; }
            else { await finalize("failed", null, result.error || `HTTP ${resp.status}`); failed++; }
          } catch (e) {
            await finalize("failed", null, String(e)); failed++;
          }
        }

        await supabase.from("statement_auto_send_rules").update({ last_sent_at: new Date().toISOString() }).eq("id", rule.id);
      }
    }

    return json({ ok: true, sent, failed, skipped });
  } catch (e: any) {
    console.error("process-statement-auto-send error:", e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
