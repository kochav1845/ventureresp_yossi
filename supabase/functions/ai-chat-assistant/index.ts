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

// ── Tool definitions for OpenAI function calling ────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "search_customers",
      description:
        "Search customers by name, ID, or email. Returns customer details and outstanding balances.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search term for customer name, ID, or email",
          },
          min_balance: {
            type: "number",
            description: "Minimum outstanding balance filter",
          },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_detail",
      description:
        "Get full details for a specific customer including balance breakdown, tickets, invoices, and payment history.",
      parameters: {
        type: "object",
        properties: {
          customer_id: {
            type: "string",
            description: "The customer ID (e.g. 'C000123')",
          },
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
          search: {
            type: "string",
            description: "Search term for reference number or customer name",
          },
          status: {
            type: "string",
            enum: ["Open", "Closed", "Voided"],
            description: "Invoice status filter",
          },
          type: {
            type: "string",
            enum: ["Invoice", "Credit Memo", "Debit Memo"],
            description: "Invoice type filter",
          },
          customer_id: { type: "string", description: "Filter by customer ID" },
          date_from: {
            type: "string",
            description: "Start date (YYYY-MM-DD)",
          },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          min_balance: { type: "number", description: "Minimum balance" },
          min_amount: { type: "number", description: "Minimum amount" },
          sort_by: {
            type: "string",
            enum: ["date", "amount", "balance", "due_date"],
            description: "Sort field",
          },
          sort_order: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Sort direction",
          },
          limit: { type: "number", description: "Max results (default 25)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_payments",
      description:
        "Search payments by reference number, customer, date range, type, or amount.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Search term for reference number, customer name, or payment ref",
          },
          customer_id: { type: "string", description: "Filter by customer ID" },
          type: {
            type: "string",
            enum: ["Payment", "Prepayment", "Credit Memo", "Voided Check"],
            description: "Payment type",
          },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          min_amount: { type: "number", description: "Minimum payment amount" },
          sort_by: {
            type: "string",
            enum: ["application_date", "payment_amount"],
          },
          sort_order: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "number", description: "Max results (default 25)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics_overview",
      description:
        "Get high-level dashboard metrics: total customers, outstanding balances, open tickets, payments this month, aging summary.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_aging_report",
      description:
        "Get accounts receivable aging report with buckets (current, 1-30, 31-60, 61-90, 91-120, 121+ days overdue) and top customers by balance.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_summary",
      description:
        "Get payment totals for a specific date range. Useful for 'how much did we collect last month' type questions.",
      parameters: {
        type: "object",
        properties: {
          date_from: {
            type: "string",
            description: "Start date (YYYY-MM-DD)",
          },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["date_from", "date_to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_collector_performance",
      description:
        "Get performance metrics for all collectors: assigned customers, open/closed tickets, collection amounts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_customers",
      description:
        "Find customers with the oldest unpaid invoices or highest balances. Great for identifying 'bad' customers or high-risk accounts.",
      parameters: {
        type: "object",
        properties: {
          min_days_overdue: {
            type: "number",
            description:
              "Minimum days overdue (e.g. 365 for 1+ year overdue)",
          },
          min_balance: {
            type: "number",
            description: "Minimum outstanding balance",
          },
          limit: { type: "number", description: "Max results (default 25)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tickets",
      description:
        "Search collection tickets by status, priority, customer, or collector.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term" },
          status: {
            type: "string",
            description: "Ticket status (e.g. open, in_progress, closed)",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
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
      description:
        "Create a new collection ticket for a customer. Use this when user asks to create a ticket or report an issue.",
      parameters: {
        type: "object",
        properties: {
          customer_id: {
            type: "string",
            description: "Customer ID to create ticket for",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
            description: "Ticket priority",
          },
          notes: {
            type: "string",
            description: "Notes/description for the ticket",
          },
          ticket_type: {
            type: "string",
            description: "Type of ticket (e.g. 'Collection', 'Follow-up')",
          },
        },
        required: ["customer_id", "notes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_monthly_summary",
      description:
        "Get month-by-month summary of invoices or payments with totals and counts.",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: ["invoices", "payments"],
            description: "Whether to get invoice or payment monthly summary",
          },
        },
        required: ["entity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_custom_query",
      description:
        "Run a custom read-only SQL query against the database for advanced questions. Only use SELECT statements. Available tables: acumatica_invoices, acumatica_payments, acumatica_customers, collection_tickets, ticket_invoices, payment_invoice_applications, collector_customer_assignments, user_profiles, invoice_memos, ticket_notes, customer_email_logs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A SELECT SQL query. Must be read-only (no INSERT/UPDATE/DELETE).",
          },
          explanation: {
            type: "string",
            description: "Brief explanation of what this query does",
          },
        },
        required: ["query", "explanation"],
      },
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────
async function executeTool(
  supabase: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case "search_customers": {
      const limit = Math.min(args.limit || 20, 50);
      let query = supabase
        .from("acumatica_customers")
        .select(
          "customer_id, customer_name, customer_class, general_email, billing_email, credit_limit, customer_status, terms"
        );

      if (args.search) {
        query = query.or(
          `customer_name.ilike.%${args.search}%,customer_id.ilike.%${args.search}%,general_email.ilike.%${args.search}%`
        );
      }

      const { data: customers } = await query
        .order("customer_name")
        .limit(limit);

      // Get balances for these customers
      const customerIds = (customers || []).map((c: any) => c.customer_id);
      if (customerIds.length === 0) return { customers: [], total: 0 };

      const { data: invoices } = await supabase
        .from("acumatica_invoices")
        .select("customer, balance, type, status")
        .in("customer", customerIds)
        .eq("status", "Open");

      const balanceMap: Record<string, number> = {};
      for (const inv of invoices || []) {
        if (!balanceMap[inv.customer]) balanceMap[inv.customer] = 0;
        if (inv.type === "Credit Memo") {
          balanceMap[inv.customer] -= inv.balance || 0;
        } else {
          balanceMap[inv.customer] += inv.balance || 0;
        }
      }

      let results = (customers || []).map((c: any) => ({
        ...c,
        outstanding_balance:
          Math.round((balanceMap[c.customer_id] || 0) * 100) / 100,
      }));

      if (args.min_balance) {
        results = results.filter(
          (c: any) => c.outstanding_balance >= args.min_balance
        );
      }

      results.sort(
        (a: any, b: any) => b.outstanding_balance - a.outstanding_balance
      );

      return { customers: results, total: results.length };
    }

    case "get_customer_detail": {
      const { data: customer } = await supabase
        .from("acumatica_customers")
        .select("*")
        .eq("customer_id", args.customer_id)
        .maybeSingle();

      if (!customer) return { error: "Customer not found" };

      const [invoicesRes, paymentsRes, ticketsRes] = await Promise.all([
        supabase
          .from("acumatica_invoices")
          .select(
            "reference_number, type, status, amount, balance, date, due_date"
          )
          .eq("customer", args.customer_id)
          .order("date", { ascending: false })
          .limit(50),
        supabase
          .from("acumatica_payments")
          .select(
            "reference_number, type, payment_amount, application_date, status"
          )
          .eq("customer_id", args.customer_id)
          .order("application_date", { ascending: false })
          .limit(20),
        supabase
          .from("collection_tickets")
          .select("ticket_number, status, priority, ticket_type, created_at")
          .eq("customer_id", args.customer_id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const openInvoices = (invoicesRes.data || []).filter(
        (i: any) => i.status === "Open" && i.type !== "Credit Memo"
      );
      const creditMemos = (invoicesRes.data || []).filter(
        (i: any) => i.status === "Open" && i.type === "Credit Memo"
      );
      const totalBalance =
        openInvoices.reduce((s: number, i: any) => s + (i.balance || 0), 0) -
        creditMemos.reduce((s: number, i: any) => s + (i.balance || 0), 0);

      return {
        customer,
        outstanding_balance: Math.round(totalBalance * 100) / 100,
        open_invoice_count: openInvoices.length,
        credit_memo_count: creditMemos.length,
        invoices: invoicesRes.data || [],
        recent_payments: paymentsRes.data || [],
        tickets: ticketsRes.data || [],
      };
    }

    case "search_invoices": {
      const limit = Math.min(args.limit || 25, 100);
      let query = supabase
        .from("acumatica_invoices")
        .select(
          "reference_number, type, status, customer, customer_name, date, due_date, amount, balance, color_status",
          { count: "exact" }
        );

      if (args.search)
        query = query.or(
          `reference_number.ilike.%${args.search}%,customer_name.ilike.%${args.search}%,customer.ilike.%${args.search}%`
        );
      if (args.status) query = query.eq("status", args.status);
      if (args.type) query = query.eq("type", args.type);
      if (args.customer_id) query = query.eq("customer", args.customer_id);
      if (args.date_from) query = query.gte("date", args.date_from);
      if (args.date_to) query = query.lte("date", args.date_to);
      if (args.min_balance) query = query.gte("balance", args.min_balance);
      if (args.min_amount) query = query.gte("amount", args.min_amount);

      const sortBy = args.sort_by || "date";
      const sortOrder = args.sort_order === "asc";

      const { data, count } = await query
        .order(sortBy, { ascending: sortOrder })
        .limit(limit);

      return { invoices: data || [], total: count };
    }

    case "search_payments": {
      const limit = Math.min(args.limit || 25, 100);
      let query = supabase
        .from("acumatica_payments")
        .select(
          "reference_number, type, status, customer_id, customer_name, payment_amount, application_date, doc_date, payment_ref, payment_method",
          { count: "exact" }
        );

      if (args.search)
        query = query.or(
          `reference_number.ilike.%${args.search}%,customer_name.ilike.%${args.search}%,customer_id.ilike.%${args.search}%`
        );
      if (args.customer_id) query = query.eq("customer_id", args.customer_id);
      if (args.type) query = query.eq("type", args.type);
      if (args.date_from)
        query = query.gte("application_date", args.date_from);
      if (args.date_to) query = query.lte("application_date", args.date_to);
      if (args.min_amount)
        query = query.gte("payment_amount", args.min_amount);

      const sortBy = args.sort_by || "application_date";
      const sortOrder = args.sort_order !== "asc";

      const { data, count } = await query
        .order(sortBy, { ascending: !sortOrder })
        .limit(limit);

      return { payments: data || [], total: count };
    }

    case "get_analytics_overview": {
      const { count: customerCount } = await supabase
        .from("acumatica_customers")
        .select("id", { count: "exact", head: true });

      const { data: openInvoiceStats } = await supabase.rpc(
        "get_open_invoice_stats"
      );

      const { count: openTicketCount } = await supabase
        .from("collection_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);

      const monthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      )
        .toISOString()
        .split("T")[0];

      const { data: recentPayments } = await supabase
        .from("acumatica_payments")
        .select("payment_amount")
        .eq("type", "Payment")
        .gte("application_date", monthStart);

      const paymentsThisMonth =
        recentPayments?.reduce(
          (s: number, p: any) => s + (p.payment_amount || 0),
          0
        ) || 0;

      return {
        total_customers: customerCount || 0,
        open_invoice_stats: openInvoiceStats,
        open_tickets: openTicketCount || 0,
        payments_collected_this_month:
          Math.round(paymentsThisMonth * 100) / 100,
        payment_count_this_month: recentPayments?.length || 0,
      };
    }

    case "get_aging_report": {
      const today = new Date();
      const { data: openInvoices } = await supabase
        .from("acumatica_invoices")
        .select(
          "reference_number, customer, customer_name, date, due_date, amount, balance, type"
        )
        .eq("status", "Open")
        .gt("balance", 0);

      const buckets: Record<string, { count: number; balance: number }> = {
        current: { count: 0, balance: 0 },
        "1-30": { count: 0, balance: 0 },
        "31-60": { count: 0, balance: 0 },
        "61-90": { count: 0, balance: 0 },
        "91-120": { count: 0, balance: 0 },
        "121-365": { count: 0, balance: 0 },
        "365+": { count: 0, balance: 0 },
      };

      const customerTotals: Record<
        string,
        { name: string; balance: number; oldest_days: number }
      > = {};

      for (const inv of openInvoices || []) {
        if (inv.type === "Credit Memo") continue;
        const dueDate = inv.due_date
          ? new Date(inv.due_date)
          : inv.date
          ? new Date(inv.date)
          : today;
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / 86400000
        );

        let bucket: string;
        if (daysOverdue <= 0) bucket = "current";
        else if (daysOverdue <= 30) bucket = "1-30";
        else if (daysOverdue <= 60) bucket = "31-60";
        else if (daysOverdue <= 90) bucket = "61-90";
        else if (daysOverdue <= 120) bucket = "91-120";
        else if (daysOverdue <= 365) bucket = "121-365";
        else bucket = "365+";

        buckets[bucket].count++;
        buckets[bucket].balance += inv.balance || 0;

        const cid = inv.customer || "Unknown";
        if (!customerTotals[cid])
          customerTotals[cid] = {
            name: inv.customer_name || cid,
            balance: 0,
            oldest_days: 0,
          };
        customerTotals[cid].balance += inv.balance || 0;
        customerTotals[cid].oldest_days = Math.max(
          customerTotals[cid].oldest_days,
          daysOverdue
        );
      }

      for (const b of Object.values(buckets))
        b.balance = Math.round(b.balance * 100) / 100;

      const topCustomers = Object.entries(customerTotals)
        .map(([id, data]) => ({
          customer_id: id,
          customer_name: data.name,
          total_balance: Math.round(data.balance * 100) / 100,
          oldest_invoice_days: data.oldest_days,
        }))
        .sort((a, b) => b.total_balance - a.total_balance)
        .slice(0, 25);

      return { aging_buckets: buckets, top_customers: topCustomers };
    }

    case "get_payment_summary": {
      const { data: payments } = await supabase
        .from("acumatica_payments")
        .select("type, payment_amount, application_date, customer_name")
        .gte("application_date", args.date_from)
        .lte("application_date", args.date_to)
        .eq("status", "Released");

      const byType: Record<string, { count: number; total: number }> = {};
      let grandTotal = 0;

      for (const p of payments || []) {
        const t = p.type || "Unknown";
        if (!byType[t]) byType[t] = { count: 0, total: 0 };
        byType[t].count++;
        byType[t].total += p.payment_amount || 0;
        if (t === "Payment" || t === "Prepayment")
          grandTotal += p.payment_amount || 0;
      }

      for (const v of Object.values(byType))
        v.total = Math.round(v.total * 100) / 100;

      return {
        period: `${args.date_from} to ${args.date_to}`,
        total_collected: Math.round(grandTotal * 100) / 100,
        total_transactions: payments?.length || 0,
        by_type: byType,
      };
    }

    case "get_collector_performance": {
      const { data: collectors } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, role")
        .in("role", ["collector", "admin", "manager"])
        .eq("account_status", "approved");

      const results = [];
      for (const c of collectors || []) {
        const [assignmentsRes, openRes, closedRes] = await Promise.all([
          supabase
            .from("collector_customer_assignments")
            .select("customer_id", { count: "exact", head: true })
            .eq("assigned_collector_id", c.id),
          supabase
            .from("collection_tickets")
            .select("id", { count: "exact", head: true })
            .eq("assigned_collector_id", c.id)
            .in("status", ["open", "in_progress"]),
          supabase
            .from("collection_tickets")
            .select("id", { count: "exact", head: true })
            .eq("assigned_collector_id", c.id)
            .eq("status", "closed"),
        ]);

        results.push({
          name: c.full_name || c.email,
          role: c.role,
          assigned_customers: assignmentsRes.count || 0,
          open_tickets: openRes.count || 0,
          closed_tickets: closedRes.count || 0,
        });
      }

      results.sort((a, b) => b.closed_tickets - a.closed_tickets);
      return { collectors: results };
    }

    case "get_overdue_customers": {
      const minDays = args.min_days_overdue || 365;
      const minBalance = args.min_balance || 0;
      const limit = Math.min(args.limit || 25, 100);
      const today = new Date();

      const { data: openInvoices } = await supabase
        .from("acumatica_invoices")
        .select(
          "customer, customer_name, date, due_date, balance, type, reference_number"
        )
        .eq("status", "Open")
        .gt("balance", 0)
        .neq("type", "Credit Memo");

      const customerData: Record<
        string,
        {
          name: string;
          balance: number;
          oldest_days: number;
          invoice_count: number;
          oldest_invoice: string;
        }
      > = {};

      for (const inv of openInvoices || []) {
        const dueDate = inv.due_date
          ? new Date(inv.due_date)
          : inv.date
          ? new Date(inv.date)
          : today;
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / 86400000
        );
        const cid = inv.customer || "Unknown";

        if (!customerData[cid])
          customerData[cid] = {
            name: inv.customer_name || cid,
            balance: 0,
            oldest_days: 0,
            invoice_count: 0,
            oldest_invoice: "",
          };
        customerData[cid].balance += inv.balance || 0;
        customerData[cid].invoice_count++;
        if (daysOverdue > customerData[cid].oldest_days) {
          customerData[cid].oldest_days = daysOverdue;
          customerData[cid].oldest_invoice = inv.reference_number;
        }
      }

      let results = Object.entries(customerData)
        .map(([id, d]) => ({
          customer_id: id,
          customer_name: d.name,
          outstanding_balance: Math.round(d.balance * 100) / 100,
          oldest_invoice_days_overdue: d.oldest_days,
          open_invoice_count: d.invoice_count,
          oldest_invoice_ref: d.oldest_invoice,
        }))
        .filter(
          (c) =>
            c.oldest_invoice_days_overdue >= minDays ||
            c.outstanding_balance >= minBalance
        )
        .sort((a, b) => b.outstanding_balance - a.outstanding_balance)
        .slice(0, limit);

      return {
        criteria: `Overdue >= ${minDays} days OR balance >= $${minBalance.toLocaleString()}`,
        customers: results,
        total_found: results.length,
      };
    }

    case "search_tickets": {
      const limit = Math.min(args.limit || 25, 50);
      let query = supabase
        .from("collection_tickets")
        .select(
          "id, ticket_number, customer_id, customer_name, status, priority, ticket_type, notes, due_date, created_at, resolved_at",
          { count: "exact" }
        );

      if (args.search)
        query = query.or(
          `ticket_number.ilike.%${args.search}%,customer_name.ilike.%${args.search}%,notes.ilike.%${args.search}%`
        );
      if (args.status) query = query.eq("status", args.status);
      if (args.priority) query = query.eq("priority", args.priority);
      if (args.customer_id) query = query.eq("customer_id", args.customer_id);

      const { data, count } = await query
        .order("created_at", { ascending: false })
        .limit(limit);

      return { tickets: data || [], total: count };
    }

    case "create_ticket": {
      const { data: customer } = await supabase
        .from("acumatica_customers")
        .select("customer_id, customer_name")
        .eq("customer_id", args.customer_id)
        .maybeSingle();

      if (!customer)
        return { error: `Customer '${args.customer_id}' not found` };

      const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
      const { data: ticket, error } = await supabase
        .from("collection_tickets")
        .insert({
          ticket_number: ticketNumber,
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          status: "open",
          priority: args.priority || "medium",
          ticket_type: args.ticket_type || "Collection",
          notes: args.notes,
        })
        .select()
        .single();

      if (error)
        return { error: `Failed to create ticket: ${error.message}` };
      return {
        message: "Ticket created successfully",
        ticket_number: ticketNumber,
        ticket,
      };
    }

    case "get_monthly_summary": {
      const rpcName =
        args.entity === "payments"
          ? "get_payment_month_summary"
          : "get_invoice_month_summary";
      const { data, error } = await supabase.rpc(rpcName);
      if (error) return { error: error.message };
      return { entity: args.entity, monthly_data: data };
    }

    case "run_custom_query": {
      const query = args.query?.trim() || "";
      if (!query.toLowerCase().startsWith("select")) {
        return { error: "Only SELECT queries are allowed for safety." };
      }
      const forbidden = [
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "create",
        "truncate",
        "grant",
        "revoke",
      ];
      const lowerQuery = query.toLowerCase();
      for (const word of forbidden) {
        if (
          lowerQuery.includes(` ${word} `) ||
          lowerQuery.startsWith(`${word} `)
        ) {
          return {
            error: `Query contains forbidden keyword '${word}'. Only SELECT queries are allowed.`,
          };
        }
      }

      const limitedQuery = query.includes("LIMIT")
        ? query
        : `${query} LIMIT 100`;

      const { data, error } = await supabase.rpc("execute_readonly_query", {
        query_text: limitedQuery,
      });

      if (error) {
        // Fall back to direct query if RPC doesn't exist
        const { data: directData, error: directError } = await supabase
          .from("acumatica_invoices")
          .select("reference_number")
          .limit(1);
        return {
          error: `Query failed: ${error.message}. Note: custom SQL requires the execute_readonly_query RPC function.`,
        };
      }

      return { explanation: args.explanation, results: data };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Main handler ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return errorResponse("OpenAI API key not configured", 500);
    }

    // Auth: require a valid Supabase session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization required", 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await anonClient.auth.getUser(token);
    if (!user) return errorResponse("Invalid session", 401);

    const body = await req.json();
    const { message, conversation_history } = body;

    if (!message) return errorResponse("Message is required");

    const today = new Date().toISOString().split("T")[0];
    const currentMonth = new Date().toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    const systemPrompt = `You are an AI assistant for a collections management application (Venture Respiratory). You help users analyze accounts receivable data, find customer information, track payments, manage collection tickets, and generate reports.

Today's date is ${today} (${currentMonth}).

You have access to tools that query the company's database containing:
- Customers (from Acumatica ERP)
- Invoices (types: Invoice, Credit Memo, Debit Memo)
- Payments (types: Payment, Prepayment, Credit Memo, Voided Check)
- Collection tickets (for tracking collection efforts)
- Collector assignments and performance data

Key terminology:
- "Balance" = remaining unpaid amount on an invoice
- "Open" invoices = unpaid invoices
- "Closed" invoices = fully paid
- "Days overdue" = days past the due date
- Color statuses (Red, Yellow, Green, Blue) indicate collection priority
- Collectors are team members assigned to collect from customers

When answering:
- Be specific with numbers and format currency with $ and commas
- When listing customers or invoices, use clear formatting
- If asked about "bad customers", look for those with high balances or very old unpaid invoices
- When asked about payments in a period, use get_payment_summary with the correct date range
- For "last two months", calculate from today's date
- Always round dollar amounts to 2 decimal places
- If you can create a ticket for the user, offer to do so
- Be concise but thorough`;

    // Build messages array
    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-10)) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    messages.push({ role: "user", content: message });

    // Call OpenAI with tool calling
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    let result = await response.json();

    if (result.error) {
      return errorResponse(`OpenAI error: ${result.error.message}`, 500);
    }

    let assistantMessage = result.choices?.[0]?.message;

    // Handle tool calls (up to 3 rounds)
    let rounds = 0;
    while (
      assistantMessage?.tool_calls &&
      assistantMessage.tool_calls.length > 0 &&
      rounds < 5
    ) {
      rounds++;
      messages.push(assistantMessage);

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc: any) => {
          const args = JSON.parse(tc.function.arguments || "{}");
          const result = await executeTool(supabase, tc.function.name, args);
          return {
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      messages.push(...toolResults);

      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });

      result = await response.json();
      if (result.error) {
        return errorResponse(`OpenAI error: ${result.error.message}`, 500);
      }
      assistantMessage = result.choices?.[0]?.message;
    }

    return jsonResponse({
      reply: assistantMessage?.content || "I could not generate a response.",
      tools_used: rounds > 0,
    });
  } catch (error: any) {
    console.error("AI Chat error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
