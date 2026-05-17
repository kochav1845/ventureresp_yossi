import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ── Tool definitions ────────────────────────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "get_top_customers_by_balance",
      description:
        "Get top customers ranked by outstanding balance. Uses server-side aggregation so it is always accurate.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional search term" },
          limit: { type: "number", description: "Max results (default 10, max 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_detail",
      description:
        "Full details for a specific customer: balance breakdown, recent invoices, payments, tickets, invoice stats (highest/lowest/oldest/most overdue invoice).",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "The customer ID (e.g. 'C000123')" },
        },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_timeline",
      description:
        "Get a historical balance/payments/invoices timeline for a specific customer, grouped by day/week/month.",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          grouping: { type: "string", enum: ["day", "week", "month"], description: "Default: month" },
        },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_invoices",
      description:
        "Search invoices by reference number, customer, status, type, date range, or amount range.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Reference number or customer name" },
          status: { type: "string", enum: ["Open", "Closed", "Voided", "Balanced"] },
          type: { type: "string", enum: ["Invoice", "Credit Memo", "Debit Memo", "Credit WO"] },
          customer_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          min_balance: { type: "number" },
          min_amount: { type: "number" },
          color_status: { type: "string", enum: ["red", "yellow", "orange", "green", "blue", "none"] },
          sort_by: { type: "string", enum: ["date", "amount", "balance", "due_date"] },
          sort_order: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "number", description: "Max results (default 25, max 100)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_payments",
      description: "Search payments by reference, customer, date range, type, or amount.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          customer_id: { type: "string" },
          type: { type: "string", enum: ["Payment", "Prepayment", "Credit Memo", "Voided Check", "Refund"] },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          min_amount: { type: "number" },
          sort_by: { type: "string", enum: ["application_date", "payment_amount", "doc_date"] },
          sort_order: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics_overview",
      description: "High-level dashboard metrics: total customers, outstanding balances, open tickets, payments this month, open invoice stats.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_aging_report",
      description: "AR aging report with buckets (current, 1-30, 31-60, 61-90, 91-120, 121-365, 365+) and top customers by balance.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_summary",
      description: "Payment totals and monthly breakdown for a date range. For 'how much collected' questions.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["date_from", "date_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_collector_performance",
      description: "Performance metrics for all collectors: assigned customers, open/closed tickets, total collected, invoices paid, avg days to close.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_customers",
      description: "Find customers with the oldest unpaid invoices or highest balances. Uses SQL aggregation.",
      parameters: {
        type: "object",
        properties: {
          min_days_overdue: { type: "number", description: "Minimum days overdue (default 90)" },
          min_balance: { type: "number", description: "Minimum outstanding balance (default 0)" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tickets",
      description: "Search collection tickets by status, priority, customer, or collector.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string" },
          status: { type: "string", enum: ["open", "in_progress", "closed", "on_hold"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          customer_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_ticket",
      description: "Create a new collection ticket for a customer.",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          notes: { type: "string" },
          ticket_type: { type: "string" },
        },
        required: ["customer_id", "notes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_monthly_summary",
      description: "Month-by-month summary of invoices or payments. Pre-aggregated and accurate.",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string", enum: ["invoices", "payments"] },
        },
        required: ["entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_level_analytics",
      description:
        "Per-customer performance breakdown: total invoiced, total paid, current balance, invoice/payment counts, last invoice/payment dates, avg days to pay. Great for comparing customers.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_counts_by_type",
      description: "Count of invoices grouped by type (Invoice, Credit Memo, Debit Memo, etc.) within a date range.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "global_search",
      description:
        "Search across ALL categories at once: customers, invoices, payments, tickets, and collectors. Returns ranked results with routes to each item. Use for broad searches.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term" },
          max_per_category: { type: "number", description: "Max results per category (default 6)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_sql_query",
      description:
        "Run a read-only SQL query for advanced analysis not covered by other tools. Only SELECT allowed. Key tables: acumatica_invoices (customer, customer_name, reference_number, type, status, amount, balance, date, due_date, color_status, description, terms), acumatica_payments (customer_id, customer_name, reference_number, type, status, payment_amount, application_date, doc_date, payment_method, payment_ref), acumatica_customers (customer_id, customer_name, customer_class, email_address, credit_limit, terms, customer_status, country, city, is_test_customer), collection_tickets (ticket_number, customer_id, customer_name, status, priority, ticket_type, notes, due_date, assigned_collector_id, created_at, resolved_at), payment_invoice_applications (payment_reference_number, invoice_reference_number, amount_paid, doc_type), collector_customer_assignments (customer_id, assigned_collector_id), user_profiles (id, full_name, email, role, account_status), invoice_color_status_history (invoice_id, old_status, new_status, changed_at, changed_by_user_id), invoice_memos (invoice_reference_number, memo_text, created_by_user_id, created_at).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "SELECT SQL query (max 200 rows returned)" },
          explanation: { type: "string", description: "Brief explanation of what this query does" },
        },
        required: ["query", "explanation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_report",
      description:
        "Generate a downloadable report (Excel/PDF). Use when user asks to export, download, generate a spreadsheet/PDF/report. Returns structured data the frontend converts to files. Report types: customer_balances, invoices, payments, aging_report, payment_trend, collector_performance, overdue_customers, customer_analytics.",
      parameters: {
        type: "object",
        properties: {
          report_type: {
            type: "string",
            enum: ["customer_balances", "invoices", "payments", "aging_report", "payment_trend", "collector_performance", "overdue_customers", "customer_analytics"],
          },
          title: { type: "string", description: "Report title for the file" },
          filters: {
            type: "object",
            description: "Optional filters: date_from, date_to, customer_id, status, type, min_balance, limit",
          },
        },
        required: ["report_type", "title"],
      },
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────
async function executeTool(
  sb: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case "get_top_customers_by_balance": {
      const limit = Math.min(args.limit || 10, 50);
      const { data, error } = await sb.rpc("get_api_customer_balances", {
        p_search: args.search || "",
        p_sort_by: "balance",
        p_sort_asc: false,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) return { error: error.message };
      return {
        customers: (data || []).map((c: any) => ({
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          customer_class: c.customer_class,
          outstanding_balance: parseFloat(c.invoice_balance) || 0,
          open_invoice_count: parseInt(c.open_invoice_count) || 0,
          terms: c.terms,
        })),
        count: (data || []).length,
      };
    }

    case "get_customer_detail": {
      const cid = args.customer_id;
      const [custRes, balRes, invStatsRes, invoicesRes, paymentsRes, ticketsRes] = await Promise.all([
        sb.from("acumatica_customers").select("customer_id, customer_name, customer_class, email_address, billing_email, general_email, credit_limit, terms, customer_status, country, city, customer_color_status, days_from_invoice_threshold").eq("customer_id", cid).maybeSingle(),
        sb.rpc("get_api_customer_balances", { p_search: cid, p_sort_by: "balance", p_sort_asc: false, p_limit: 1, p_offset: 0 }),
        sb.rpc("get_customer_invoice_stats", { p_customer_id: cid }),
        sb.from("acumatica_invoices").select("reference_number, type, status, amount, balance, date, due_date, color_status").eq("customer", cid).neq("status", "On Hold").order("date", { ascending: false }).limit(30),
        sb.from("acumatica_payments").select("reference_number, type, payment_amount, application_date, doc_date, status, payment_method").eq("customer_id", cid).order("application_date", { ascending: false }).limit(20),
        sb.from("collection_tickets").select("ticket_number, status, priority, ticket_type, notes, due_date, created_at, resolved_at").eq("customer_id", cid).order("created_at", { ascending: false }).limit(10),
      ]);

      if (!custRes.data) return { error: `Customer '${cid}' not found` };
      const bal = balRes.data?.[0];
      const invStats = invStatsRes.data?.[0];

      return {
        customer: custRes.data,
        balance: {
          outstanding: bal ? parseFloat(bal.invoice_balance) : 0,
          open_invoices: bal ? parseInt(bal.open_invoice_count) : 0,
        },
        invoice_stats: invStats || null,
        recent_invoices: invoicesRes.data || [],
        recent_payments: paymentsRes.data || [],
        tickets: ticketsRes.data || [],
      };
    }

    case "get_customer_timeline": {
      const { data, error } = await sb.rpc("get_single_customer_timeline", {
        p_customer_id: args.customer_id,
        p_date_from: args.date_from || null,
        p_date_to: args.date_to || null,
        p_grouping: args.grouping || "month",
      });
      if (error) return { error: error.message };
      return { timeline: data || [] };
    }

    case "search_invoices": {
      const limit = Math.min(args.limit || 25, 100);
      let query = sb
        .from("acumatica_invoices")
        .select("reference_number, type, status, customer, customer_name, date, due_date, amount, balance, color_status, description", { count: "exact" })
        .neq("status", "On Hold");

      if (args.search) query = query.or(`reference_number.ilike.%${args.search}%,customer_name.ilike.%${args.search}%,customer.ilike.%${args.search}%`);
      if (args.status) query = query.eq("status", args.status);
      if (args.type) query = query.eq("type", args.type);
      if (args.customer_id) query = query.eq("customer", args.customer_id);
      if (args.date_from) query = query.gte("date", args.date_from);
      if (args.date_to) query = query.lte("date", args.date_to);
      if (args.min_balance) query = query.gte("balance", args.min_balance);
      if (args.min_amount) query = query.gte("amount", args.min_amount);
      if (args.color_status) query = query.eq("color_status", args.color_status);

      const sortBy = args.sort_by || "date";
      const ascending = args.sort_order === "asc";
      const { data, count } = await query.order(sortBy, { ascending }).limit(limit);
      return { invoices: data || [], total: count };
    }

    case "search_payments": {
      const limit = Math.min(args.limit || 25, 100);
      let query = sb
        .from("acumatica_payments")
        .select("reference_number, type, status, customer_id, customer_name, payment_amount, application_date, doc_date, payment_ref, payment_method", { count: "exact" });

      if (args.search) query = query.or(`reference_number.ilike.%${args.search}%,customer_name.ilike.%${args.search}%,customer_id.ilike.%${args.search}%`);
      if (args.customer_id) query = query.eq("customer_id", args.customer_id);
      if (args.type) query = query.eq("type", args.type);
      if (args.date_from) query = query.gte("application_date", args.date_from);
      if (args.date_to) query = query.lte("application_date", args.date_to);
      if (args.min_amount) query = query.gte("payment_amount", args.min_amount);

      const sortBy = args.sort_by || "application_date";
      const ascending = args.sort_order === "asc";
      const { data, count } = await query.order(sortBy, { ascending }).limit(limit);
      return { payments: data || [], total: count };
    }

    case "get_analytics_overview": {
      const [customerRes, openStats, ticketRes, totalsRes, monthRes] = await Promise.all([
        sb.from("acumatica_customers").select("id", { count: "exact", head: true }).eq("is_test_customer", false),
        sb.rpc("get_open_invoice_stats"),
        sb.from("collection_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
        sb.rpc("get_api_total_outstanding"),
        (() => {
          const now = new Date();
          const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          return sb.from("payment_month_summary").select("total_amount, payment_count").eq("month_key", key).maybeSingle();
        })(),
      ]);

      const outstanding = totalsRes.data?.[0] || { total_balance: 0, customer_count: 0, invoice_count: 0 };
      return {
        total_customers: customerRes.count || 0,
        total_outstanding_balance: parseFloat(outstanding.total_balance) || 0,
        customers_with_balance: outstanding.customer_count || 0,
        total_open_invoices: outstanding.invoice_count || 0,
        open_invoice_stats: openStats.data || {},
        open_tickets: ticketRes.count || 0,
        payments_collected_this_month: parseFloat(monthRes.data?.total_amount) || 0,
        payment_count_this_month: parseInt(monthRes.data?.payment_count) || 0,
      };
    }

    case "get_aging_report": {
      const [topCustRes, agingRes] = await Promise.all([
        sb.rpc("get_api_customer_balances", { p_search: "", p_sort_by: "balance", p_sort_asc: false, p_limit: 15, p_offset: 0 }),
        sb.rpc("get_customers_unpaid_summary", { p_search: "", p_sort_by: "balance", p_sort_order: "desc", p_limit: 2000, p_offset: 0 }),
      ]);

      const buckets: Record<string, { count: number; balance: number }> = {
        "current": { count: 0, balance: 0 },
        "1-30 days": { count: 0, balance: 0 },
        "31-60 days": { count: 0, balance: 0 },
        "61-90 days": { count: 0, balance: 0 },
        "91-120 days": { count: 0, balance: 0 },
        "121-365 days": { count: 0, balance: 0 },
        "365+ days": { count: 0, balance: 0 },
      };

      for (const cust of agingRes.data || []) {
        const days = parseInt(cust.max_days_overdue) || 0;
        const bal = parseFloat(cust.total_balance) || 0;
        let bucket: string;
        if (days <= 0) bucket = "current";
        else if (days <= 30) bucket = "1-30 days";
        else if (days <= 60) bucket = "31-60 days";
        else if (days <= 90) bucket = "61-90 days";
        else if (days <= 120) bucket = "91-120 days";
        else if (days <= 365) bucket = "121-365 days";
        else bucket = "365+ days";
        buckets[bucket].count++;
        buckets[bucket].balance += bal;
      }

      for (const b of Object.values(buckets)) b.balance = Math.round(b.balance * 100) / 100;

      return {
        aging_buckets: buckets,
        total_ar: Object.values(buckets).reduce((s, b) => s + b.balance, 0),
        total_customers: Object.values(buckets).reduce((s, b) => s + b.count, 0),
        top_customers_by_balance: (topCustRes.data || []).map((c: any) => ({
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          outstanding_balance: parseFloat(c.invoice_balance) || 0,
          open_invoices: parseInt(c.open_invoice_count) || 0,
        })),
      };
    }

    case "get_payment_summary": {
      const startDate = new Date(args.date_from);
      const endDate = new Date(args.date_to);
      const monthKeys: string[] = [];
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (d <= endDate) {
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        d.setMonth(d.getMonth() + 1);
      }

      const { data: months, error } = await sb.from("payment_month_summary").select("*").in("month_key", monthKeys).order("month_key", { ascending: true });
      if (error) return { error: error.message };

      let totalCollected = 0, totalPaymentAmt = 0, totalPrepaymentAmt = 0, totalVoidedAmt = 0, totalRefundAmt = 0, totalCount = 0;
      const monthlyBreakdown = (months || []).map((m: any) => {
        const payAmt = parseFloat(m.payment_amount) || 0;
        const preAmt = parseFloat(m.prepayment_amount) || 0;
        const voidAmt = parseFloat(m.voided_amount) || 0;
        const refAmt = parseFloat(m.refund_amount) || 0;
        const totAmt = parseFloat(m.total_amount) || 0;
        const cnt = parseInt(m.total_payments) || 0;
        totalCollected += totAmt;
        totalPaymentAmt += payAmt;
        totalPrepaymentAmt += preAmt;
        totalVoidedAmt += voidAmt;
        totalRefundAmt += refAmt;
        totalCount += cnt;
        return { month: m.month_label, total: totAmt, payments: payAmt, prepayments: preAmt, voided: voidAmt, refunds: refAmt, count: cnt };
      });

      return {
        period: `${args.date_from} to ${args.date_to}`,
        total_collected: Math.round(totalCollected * 100) / 100,
        total_payments: Math.round(totalPaymentAmt * 100) / 100,
        total_prepayments: Math.round(totalPrepaymentAmt * 100) / 100,
        total_voided: Math.round(totalVoidedAmt * 100) / 100,
        total_refunds: Math.round(totalRefundAmt * 100) / 100,
        total_count: totalCount,
        monthly_breakdown: monthlyBreakdown,
      };
    }

    case "get_collector_performance": {
      const { data: collectors } = await sb
        .from("user_profiles")
        .select("id, full_name, email, role")
        .in("role", ["collector", "admin", "manager"])
        .eq("account_status", "approved");

      const { data: collSummary } = await sb.rpc("get_all_collectors_collection_summary");

      const summaryMap = new Map<string, any>();
      for (const s of collSummary || []) summaryMap.set(s.collector_id, s);

      const results = await Promise.all(
        (collectors || []).map(async (c: any) => {
          const [assignRes, openRes, closedRes] = await Promise.all([
            sb.from("collector_customer_assignments").select("customer_id", { count: "exact", head: true }).eq("assigned_collector_id", c.id),
            sb.from("collection_tickets").select("id", { count: "exact", head: true }).eq("assigned_collector_id", c.id).in("status", ["open", "in_progress"]),
            sb.from("collection_tickets").select("id", { count: "exact", head: true }).eq("assigned_collector_id", c.id).eq("status", "closed"),
          ]);

          const sm = summaryMap.get(c.id);
          return {
            name: c.full_name || c.email,
            role: c.role,
            assigned_customers: assignRes.count || 0,
            open_tickets: openRes.count || 0,
            closed_tickets: closedRes.count || 0,
            total_collected: sm ? parseFloat(sm.total_collected) || 0 : 0,
            invoices_paid: sm ? parseInt(sm.invoices_paid_count) || 0 : 0,
            avg_days_to_close: sm ? parseFloat(sm.avg_days_to_close) || 0 : 0,
          };
        })
      );

      results.sort((a, b) => b.total_collected - a.total_collected);
      return { collectors: results };
    }

    case "get_overdue_customers": {
      const minDays = args.min_days_overdue ?? 90;
      const minBalance = args.min_balance ?? 0;
      const limit = Math.min(args.limit || 50, 200);

      const { data } = await sb.rpc("get_customers_unpaid_summary", {
        p_search: "",
        p_sort_by: "balance",
        p_sort_order: "desc",
        p_limit: 500,
        p_offset: 0,
      });

      const filtered = (data || [])
        .filter((c: any) => {
          const days = parseInt(c.max_days_overdue) || 0;
          const bal = parseFloat(c.total_balance) || 0;
          return days >= minDays || (minBalance > 0 && bal >= minBalance);
        })
        .slice(0, limit)
        .map((c: any) => ({
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          outstanding_balance: parseFloat(c.total_balance) || 0,
          days_overdue: parseInt(c.max_days_overdue) || 0,
          open_invoices: parseInt(c.invoice_count) || 0,
        }));

      return { criteria: `Overdue >= ${minDays} days${minBalance > 0 ? ` OR balance >= $${minBalance.toLocaleString()}` : ""}`, customers: filtered, total: filtered.length };
    }

    case "search_tickets": {
      const limit = Math.min(args.limit || 25, 50);
      let query = sb
        .from("collection_tickets")
        .select("id, ticket_number, customer_id, customer_name, status, priority, ticket_type, notes, due_date, created_at, resolved_at", { count: "exact" });

      if (args.search) query = query.or(`ticket_number.ilike.%${args.search}%,customer_name.ilike.%${args.search}%,notes.ilike.%${args.search}%`);
      if (args.status) query = query.eq("status", args.status);
      if (args.priority) query = query.eq("priority", args.priority);
      if (args.customer_id) query = query.eq("customer_id", args.customer_id);

      const { data, count } = await query.order("created_at", { ascending: false }).limit(limit);
      return { tickets: data || [], total: count };
    }

    case "create_ticket": {
      const { data: customer } = await sb.from("acumatica_customers").select("customer_id, customer_name").eq("customer_id", args.customer_id).maybeSingle();
      if (!customer) return { error: `Customer '${args.customer_id}' not found` };

      const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
      const { data: ticket, error } = await sb
        .from("collection_tickets")
        .insert({ ticket_number: ticketNumber, customer_id: customer.customer_id, customer_name: customer.customer_name, status: "open", priority: args.priority || "medium", ticket_type: args.ticket_type || "Collection", notes: args.notes })
        .select()
        .single();

      if (error) return { error: `Failed: ${error.message}` };
      return { message: "Ticket created", ticket_number: ticketNumber, ticket };
    }

    case "get_monthly_summary": {
      if (args.entity === "payments") {
        const { data, error } = await sb.rpc("get_payment_month_summary");
        if (error) return { error: error.message };
        return {
          entity: "payments",
          months: (data || []).map((r: any) => ({
            month: r.month_label,
            total: parseFloat(r.total_amount) || 0,
            payments: parseFloat(r.payment_amount) || 0,
            prepayments: parseFloat(r.prepayment_amount) || 0,
            voided: parseFloat(r.voided_amount) || 0,
            refunds: parseFloat(r.refund_amount) || 0,
            credit_memos: parseFloat(r.credit_memo_amount) || 0,
            count: parseInt(r.total_payments) || 0,
          })),
        };
      } else {
        const { data, error } = await sb.rpc("get_invoice_month_summary");
        if (error) return { error: error.message };
        return {
          entity: "invoices",
          months: (data || []).map((r: any) => ({
            month: r.month_label,
            total_invoiced: parseFloat(r.total_amount) || 0,
            count: parseInt(r.invoice_count) || 0,
            open_balance: parseFloat(r.open_balance) || 0,
          })),
        };
      }
    }

    case "get_customer_level_analytics": {
      const { data, error } = await sb.rpc("get_customer_level_analytics", {
        p_date_from: args.date_from || null,
        p_date_to: args.date_to || null,
        p_limit: Math.min(args.limit || 50, 100),
      });
      if (error) return { error: error.message };
      return { customers: data || [] };
    }

    case "get_invoice_counts_by_type": {
      const { data, error } = await sb.rpc("get_invoice_counts_by_type", {
        p_start_date: args.start_date,
        p_end_date: args.end_date,
      });
      if (error) return { error: error.message };
      return { counts: data || [] };
    }

    case "global_search": {
      const { data, error } = await sb.rpc("global_search", {
        search_query: args.query,
        max_per_category: args.max_per_category || 6,
      });
      if (error) return { error: error.message };

      const grouped: Record<string, any[]> = {};
      for (const row of data || []) {
        if (!grouped[row.category]) grouped[row.category] = [];
        grouped[row.category].push({ id: row.item_id, title: row.title, subtitle: row.subtitle, meta: row.meta_line });
      }
      return { results: grouped, total: (data || []).length };
    }

    case "run_sql_query": {
      const query = (args.query || "").trim();
      if (!query.toUpperCase().startsWith("SELECT")) return { error: "Only SELECT queries are allowed." };
      const forbidden = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke"];
      const lower = query.toLowerCase();
      for (const word of forbidden) {
        if (lower.includes(` ${word} `) || lower.startsWith(`${word} `)) return { error: `Forbidden keyword: ${word}` };
      }

      const limited = query.match(/\blimit\b/i) ? query : `${query} LIMIT 200`;

      const { data, error } = await sb.rpc("execute_readonly_sql", { sql_query: limited });
      if (error) return { error: error.message, query: limited };
      return { rows: data, row_count: Array.isArray(data) ? data.length : 0, query: limited };
    }

    case "generate_report": {
      const filters = args.filters || {};
      const limit = Math.min(filters.limit || 500, 2000);
      let columns: string[] = [];
      let rows: any[][] = [];
      const seen = new Set<string>();

      function dedup(rowArr: any[][], keyIndex: number): any[][] {
        const out: any[][] = [];
        for (const row of rowArr) {
          const key = String(row[keyIndex] ?? "");
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          out.push(row);
        }
        return out;
      }

      switch (args.report_type) {
        case "customer_balances": {
          const { data } = await sb.rpc("get_api_customer_balances", { p_search: filters.search || "", p_sort_by: "balance", p_sort_asc: false, p_limit: limit, p_offset: 0 });
          columns = ["Customer ID", "Customer Name", "Class", "Outstanding Balance", "Open Invoices", "Terms"];
          rows = dedup((data || []).map((c: any) => [c.customer_id, c.customer_name, c.customer_class || "", parseFloat(c.invoice_balance) || 0, parseInt(c.open_invoice_count) || 0, c.terms || ""]), 0);
          break;
        }
        case "invoices": {
          let q = sb.from("acumatica_invoices").select("reference_number, type, status, customer, customer_name, date, due_date, amount, balance").neq("status", "On Hold");
          if (filters.status) q = q.eq("status", filters.status);
          if (filters.type) q = q.eq("type", filters.type);
          if (filters.customer_id) q = q.eq("customer", filters.customer_id);
          if (filters.date_from) q = q.gte("date", filters.date_from);
          if (filters.date_to) q = q.lte("date", filters.date_to);
          if (filters.min_balance) q = q.gte("balance", filters.min_balance);
          const { data } = await q.order("date", { ascending: false }).limit(limit);
          columns = ["Reference #", "Type", "Status", "Customer ID", "Customer Name", "Date", "Due Date", "Amount", "Balance"];
          rows = dedup((data || []).map((i: any) => [i.reference_number, i.type, i.status, i.customer, i.customer_name, i.date, i.due_date, parseFloat(i.amount) || 0, parseFloat(i.balance) || 0]), 0);
          break;
        }
        case "payments": {
          let q = sb.from("acumatica_payments").select("reference_number, type, status, customer_id, customer_name, payment_amount, application_date, payment_method, payment_ref");
          if (filters.type) q = q.eq("type", filters.type);
          if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
          if (filters.date_from) q = q.gte("application_date", filters.date_from);
          if (filters.date_to) q = q.lte("application_date", filters.date_to);
          const { data } = await q.order("application_date", { ascending: false }).limit(limit);
          columns = ["Reference #", "Type", "Status", "Customer ID", "Customer Name", "Amount", "Date", "Method", "Payment Ref"];
          rows = dedup((data || []).map((p: any) => [p.reference_number, p.type, p.status, p.customer_id, p.customer_name, parseFloat(p.payment_amount) || 0, p.application_date, p.payment_method || "", p.payment_ref || ""]), 0);
          break;
        }
        case "aging_report": {
          const { data } = await sb.rpc("get_customers_unpaid_summary", { p_search: "", p_sort_by: "balance", p_sort_order: "desc", p_limit: limit, p_offset: 0 });
          columns = ["Customer ID", "Customer Name", "Outstanding Balance", "Open Invoices", "Max Days Overdue", "Aging Bucket"];
          rows = dedup((data || []).map((c: any) => {
            const days = parseInt(c.max_days_overdue) || 0;
            let bucket = "Current";
            if (days > 365) bucket = "365+ Days"; else if (days > 120) bucket = "121-365 Days"; else if (days > 90) bucket = "91-120 Days"; else if (days > 60) bucket = "61-90 Days"; else if (days > 30) bucket = "31-60 Days"; else if (days > 0) bucket = "1-30 Days";
            return [c.customer_id, c.customer_name, parseFloat(c.total_balance) || 0, parseInt(c.invoice_count) || 0, days, bucket];
          }), 0);
          break;
        }
        case "payment_trend": {
          const { data } = await sb.rpc("get_payment_month_summary");
          columns = ["Month", "Total Collected", "Payments", "Prepayments", "Voided", "Refunds", "Count"];
          rows = (data || []).map((m: any) => [m.month_label, parseFloat(m.total_amount) || 0, parseFloat(m.payment_amount) || 0, parseFloat(m.prepayment_amount) || 0, parseFloat(m.voided_amount) || 0, parseFloat(m.refund_amount) || 0, parseInt(m.total_payments) || 0]);
          break;
        }
        case "collector_performance": {
          const perfResult = await executeTool(sb, "get_collector_performance", {});
          columns = ["Name", "Role", "Assigned Customers", "Open Tickets", "Closed Tickets", "Total Collected", "Invoices Paid", "Avg Days to Close"];
          rows = (perfResult.collectors || []).map((c: any) => [c.name, c.role, c.assigned_customers, c.open_tickets, c.closed_tickets, c.total_collected, c.invoices_paid, c.avg_days_to_close]);
          break;
        }
        case "overdue_customers": {
          const overdueResult = await executeTool(sb, "get_overdue_customers", { min_days_overdue: filters.min_days_overdue || 30, min_balance: filters.min_balance || 0, limit });
          columns = ["Customer ID", "Customer Name", "Outstanding Balance", "Days Overdue", "Open Invoices"];
          rows = (overdueResult.customers || []).map((c: any) => [c.customer_id, c.customer_name, c.outstanding_balance, c.days_overdue, c.open_invoices]);
          break;
        }
        case "customer_analytics": {
          const analyticsResult = await executeTool(sb, "get_customer_level_analytics", { date_from: filters.date_from, date_to: filters.date_to, limit });
          columns = ["Customer ID", "Customer Name", "Total Invoiced", "Total Paid", "Current Balance", "Invoice Count", "Payment Count", "Avg Days to Pay"];
          rows = (analyticsResult.customers || []).map((c: any) => [c.customer_id, c.customer_name, parseFloat(c.total_invoice_amount) || 0, parseFloat(c.total_payment_amount) || 0, parseFloat(c.current_balance) || 0, parseInt(c.invoice_count) || 0, parseInt(c.payment_count) || 0, parseFloat(c.avg_days_to_pay) || 0]);
          break;
        }
      }

      return {
        __report: true,
        title: args.title,
        report_type: args.report_type,
        columns,
        rows,
        row_count: rows.length,
        generated_at: new Date().toISOString(),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) return errorResponse("OpenAI API key not configured", 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization required", 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return errorResponse("Invalid session", 401);

    const body = await req.json();
    const { message, conversation_history } = body;
    if (!message) return errorResponse("Message is required");

    const today = new Date().toISOString().split("T")[0];
    const currentMonth = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

    const systemPrompt = `You are an AI assistant for a collections management application (Venture Respiratory). You help users analyze AR data, find customer information, track payments, and manage collection tickets.

Today: ${today} (${currentMonth}).

RULES:
- ALWAYS use tools to query data. Never guess or make up numbers.
- For "who owes the most" use get_top_customers_by_balance.
- For "how much collected" use get_payment_summary with date range.
- For overdue/delinquent accounts use get_overdue_customers.
- For collector/rep performance use get_collector_performance.
- For aging analysis use get_aging_report.
- For monthly trends use get_monthly_summary.
- For broad searches use global_search.
- For deep customer analysis use get_customer_detail then get_customer_timeline.
- For customer comparisons use get_customer_level_analytics.
- For complex queries not covered by other tools, use run_sql_query.
- When asked to export/download/generate a report, use generate_report.
- NEVER compute balances by summing rows yourself.
- Format currency as $1,234.56. Be specific with numbers.
- List results clearly. Offer follow-up actions when relevant.`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: message });

    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 4096 }),
    });

    let result = await response.json();
    if (result.error) return errorResponse(`OpenAI error: ${result.error.message}`, 500);

    let assistantMessage = result.choices?.[0]?.message;
    let rounds = 0;

    while (assistantMessage?.tool_calls?.length > 0 && rounds < 8) {
      rounds++;
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc: any) => {
          const args = JSON.parse(tc.function.arguments || "{}");
          const result = await executeTool(supabase, tc.function.name, args);
          return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
        })
      );

      messages.push(...toolResults);

      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", messages, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 4096 }),
      });

      result = await response.json();
      if (result.error) return errorResponse(`OpenAI error: ${result.error.message}`, 500);
      assistantMessage = result.choices?.[0]?.message;
    }

    let reportData = null;
    for (const msg of messages) {
      if (msg.role === "tool" && msg.content) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.__report) { reportData = parsed; break; }
        } catch {}
      }
    }

    return jsonResponse({
      reply: assistantMessage?.content || "I could not generate a response.",
      tools_used: rounds > 0,
      report: reportData,
    });
  } catch (error: any) {
    console.error("AI Chat error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
