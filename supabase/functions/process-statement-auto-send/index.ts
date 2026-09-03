import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
            const invoices = (invRows || []).map((inv: any) => {
              const isCredit = inv.type === "Credit Memo" || inv.type === "Credit WO";
              const amt = Number(inv.amount) || Number(inv.dac_total) || 0;
              const bal = Number(inv.balance) || 0;
              return {
                reference_number: inv.reference_number,
                invoice_date: inv.date,
                due_date: inv.due_date,
                amount: isCredit ? -Math.abs(amt) : amt,
                balance: isCredit ? -Math.abs(bal) : bal,
                description: inv.description || "",
              };
            });
            if (invoices.length === 0) { await finalize("skipped", null, "no open invoices"); skipped++; continue; }

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
