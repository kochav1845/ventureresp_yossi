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

const tools = [
  {
    type: "function",
    function: {
      name: "get_top_customers_by_balance",
      description:
        "Get the top customers ranked by outstanding balance (highest first). Uses server-side aggregation so it is always accurate. Use this for questions like 'who owes the most', 'highest balance', 'top debtors', etc.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Optional search term to filter customer name or ID" },
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
        "Get full details for a specific customer including balance breakdown, recent invoices, payments, and tickets.",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "The customer ID" },
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
          search: { type: "string", description: "Search term for reference number or customer" },
          status: { type: "string", enum: ["Open", "Closed", "Voided"] },
          type: { type: "string", enum: ["Invoice", "Credit Memo", "Debit Memo"] },
          customer_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          min_balance: { type: "number" },
          min_amount: { type: "number" },
          sort_by: { type: "string", enum: ["date", "amount", "balance", "due_date"] },
          sort_order: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "number", description: "Max results (default 25)" },
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
          type: { type: "string", enum: ["Payment", "Prepayment", "Credit Memo", "Voided Check"] },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          min_amount: { type: "number" },
          sort_by: { type: "string", enum: ["application_date", "payment_amount"] },
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
      description: "Get high-level dashboard metrics: total customers, outstanding balances, open tickets, payments this month.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_aging_report",
      description: "Get AR aging report with buckets (current, 1-30, 31-60, 61-90, 91-120, 121-365, 365+ days) and top customers. Uses SQL aggregation for accuracy.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_summary",
      description: "Get payment totals for a date range. For 'how much did we collect' type questions.",
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
      description: "Get performance metrics for all collectors: assigned customers, open/closed tickets.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_customers",
      description: "Find customers with the oldest unpaid invoices. Uses SQL aggregation for accuracy over all invoices.",
      parameters: {
        type: "object",
        properties: {
          min_days_overdue: { type: "number", description: "Minimum days overdue (default 365)" },
          min_balance: { type: "number", description: "Minimum outstanding balance (default 500000)" },
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
          status: { type: "string" },
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
      description: "Get month-by-month summary of invoices or payments.",
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
      name: "run_sql_query",
      description:
        "Run a read-only SQL query for advanced questions. Only SELECT statements allowed. Key tables: acumatica_invoices (customer, customer_name, reference_number, type, status, amount, balance, date, due_date), acumatica_payments (customer_id, customer_name, reference_number, type, status, payment_amount, application_date, doc_date), acumatica_customers (customer_id, customer_name, customer_class, general_email, credit_limit, terms), collection_tickets (ticket_number, customer_id, customer_name, status, priority, ticket_type, assigned_collector_id), payment_invoice_applications (payment_reference_number, invoice_reference_number, amount_paid). Join acumatica_customers ON customer_id = acumatica_invoices.customer for real customer names.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "SELECT SQL query" },
          explanation: { type: "string" },
        },
        required: ["query", "explanation"],
      },
    },
  },
];

async function executeTool(
  supabase: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case "get_top_customers_by_balance": {
      const limit = Math.min(args.limit || 10, 50);
      const search = args.search || "";

      const { data, error } = await supabase.rpc("get_api_customer_balances", {
        p_search: search,
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
        total: (data || []).length,
      };
    }

    case "get_customer_detail": {
      const { data: customer } = await supabase
        .from("acumatica_customers")
        .select("*")
        .eq("customer_id", args.customer_id)
        .maybeSingle();

      if (!customer) return { error: "Customer not found" };

      // Get balance via RPC for accuracy
      const { data: balanceData } = await supabase.rpc("get_api_customer_balances", {
        p_search: args.customer_id,
        p_sort_by: "balance",
        p_sort_asc: false,
        p_limit: 1,
        p_offset: 0,
      });

      const balance = balanceData?.[0];

      const [invoicesRes, paymentsRes, ticketsRes] = await Promise.all([
        supabase
          .from("acumatica_invoices")
          .select("reference_number, type, status, amount, balance, date, due_date")
          .eq("customer", args.customer_id)
          .order("date", { ascending: false })
          .limit(50),
        supabase
          .from("acumatica_payments")
          .select("reference_number, type, payment_amount, application_date, status")
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

      return {
        customer: {
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          customer_class: customer.customer_class,
          general_email: customer.general_email,
          billing_email: customer.billing_email,
          credit_limit: customer.credit_limit,
          terms: customer.terms,
          customer_status: customer.customer_status,
        },
        outstanding_balance: balance ? parseFloat(balance.invoice_balance) : 0,
        open_invoice_count: balance ? parseInt(balance.open_invoice_count) : 0,
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
      const ascending = args.sort_order === "asc";

      const { data, count } = await query.order(sortBy, { ascending }).limit(limit);
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
      if (args.date_from) query = query.gte("application_date", args.date_from);
      if (args.date_to) query = query.lte("application_date", args.date_to);
      if (args.min_amount) query = query.gte("payment_amount", args.min_amount);

      const sortBy = args.sort_by || "application_date";
      const ascending = args.sort_order === "asc";

      const { data, count } = await query.order(sortBy, { ascending }).limit(limit);
      return { payments: data || [], total: count };
    }

    case "get_analytics_overview": {
      const { count: customerCount } = await supabase
        .from("acumatica_customers")
        .select("id", { count: "exact", head: true });

      const { data: openStats } = await supabase.rpc("get_open_invoice_stats");

      const { count: openTicketCount } = await supabase
        .from("collection_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);

      // Get total outstanding via RPC
      const { data: totals } = await supabase.rpc("get_api_total_outstanding");
      const outstanding = totals?.[0] || { total_balance: 0, customer_count: 0, invoice_count: 0 };

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split("T")[0];

      const { data: recentPayments } = await supabase
        .from("acumatica_payments")
        .select("payment_amount")
        .eq("type", "Payment")
        .gte("application_date", monthStart);

      const paymentsThisMonth = recentPayments?.reduce((s: number, p: any) => s + (p.payment_amount || 0), 0) || 0;

      return {
        total_customers: customerCount || 0,
        total_outstanding_balance: parseFloat(outstanding.total_balance) || 0,
        customers_with_balance: outstanding.customer_count || 0,
        total_open_invoices: outstanding.invoice_count || 0,
        open_tickets: openTicketCount || 0,
        payments_collected_this_month: Math.round(paymentsThisMonth * 100) / 100,
        payment_count_this_month: recentPayments?.length || 0,
      };
    }

    case "get_aging_report": {
      // Use SQL for accurate aggregation across all invoices
      const { data, error } = await supabase.rpc("get_open_invoice_stats");

      // Also get top customers by balance
      const { data: topCustomers } = await supabase.rpc("get_api_customer_balances", {
        p_search: "",
        p_sort_by: "balance",
        p_sort_asc: false,
        p_limit: 15,
        p_offset: 0,
      });

      // Get aging via direct SQL
      const { data: agingData } = await supabase.rpc("get_customers_unpaid_summary", {
        p_search: "",
        p_sort_by: "balance",
        p_sort_asc: false,
        p_limit: 500,
        p_offset: 0,
      });

      // Build aging buckets from the unpaid summary
      const buckets: Record<string, { count: number; balance: number }> = {
        "current": { count: 0, balance: 0 },
        "1-30 days": { count: 0, balance: 0 },
        "31-60 days": { count: 0, balance: 0 },
        "61-90 days": { count: 0, balance: 0 },
        "91-120 days": { count: 0, balance: 0 },
        "121-365 days": { count: 0, balance: 0 },
        "365+ days": { count: 0, balance: 0 },
      };

      for (const cust of agingData || []) {
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

      for (const b of Object.values(buckets))
        b.balance = Math.round(b.balance * 100) / 100;

      return {
        aging_buckets: buckets,
        top_customers_by_balance: (topCustomers || []).map((c: any) => ({
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          outstanding_balance: parseFloat(c.invoice_balance) || 0,
          open_invoices: parseInt(c.open_invoice_count) || 0,
        })),
      };
    }

    case "get_payment_summary": {
      // Use SQL aggregation for accuracy
      const { data, error } = await supabase.rpc("get_filtered_payment_aggregates", {
        p_start_date: args.date_from,
        p_end_date: args.date_to,
        p_type_filter: null,
        p_has_applications: null,
        p_included_customers: null,
      });

      if (error) {
        // Fallback: direct query with limit
        const { data: payments } = await supabase
          .from("acumatica_payments")
          .select("type, payment_amount")
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
          if (t === "Payment" || t === "Prepayment") grandTotal += p.payment_amount || 0;
        }
        for (const v of Object.values(byType)) v.total = Math.round(v.total * 100) / 100;

        return {
          period: `${args.date_from} to ${args.date_to}`,
          total_collected: Math.round(grandTotal * 100) / 100,
          by_type: byType,
        };
      }

      return {
        period: `${args.date_from} to ${args.date_to}`,
        summary: data,
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
      const minBalance = args.min_balance || 500000;
      const limit = Math.min(args.limit || 25, 100);

      // Use the unpaid summary RPC for accuracy
      const { data: customers } = await supabase.rpc("get_customers_unpaid_summary", {
        p_search: "",
        p_sort_by: "balance",
        p_sort_asc: false,
        p_limit: 200,
        p_offset: 0,
      });

      const filtered = (customers || [])
        .filter((c: any) => {
          const days = parseInt(c.max_days_overdue) || 0;
          const bal = parseFloat(c.total_balance) || 0;
          return days >= minDays || bal >= minBalance;
        })
        .slice(0, limit)
        .map((c: any) => ({
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          outstanding_balance: parseFloat(c.total_balance) || 0,
          oldest_invoice_days_overdue: parseInt(c.max_days_overdue) || 0,
          open_invoice_count: parseInt(c.open_invoice_count) || 0,
        }));

      return {
        criteria: `Overdue >= ${minDays} days OR balance >= $${minBalance.toLocaleString()}`,
        customers: filtered,
        total_found: filtered.length,
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

      const { data, count } = await query.order("created_at", { ascending: false }).limit(limit);
      return { tickets: data || [], total: count };
    }

    case "create_ticket": {
      const { data: customer } = await supabase
        .from("acumatica_customers")
        .select("customer_id, customer_name")
        .eq("customer_id", args.customer_id)
        .maybeSingle();

      if (!customer) return { error: `Customer '${args.customer_id}' not found` };

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

      if (error) return { error: `Failed to create ticket: ${error.message}` };
      return { message: "Ticket created successfully", ticket_number: ticketNumber, ticket };
    }

    case "get_monthly_summary": {
      const rpcName = args.entity === "payments" ? "get_payment_month_summary" : "get_invoice_month_summary";
      const { data, error } = await supabase.rpc(rpcName);
      if (error) return { error: error.message };
      return { entity: args.entity, monthly_data: data };
    }

    case "run_sql_query": {
      const query = args.query?.trim() || "";
      if (!query.toUpperCase().startsWith("SELECT")) {
        return { error: "Only SELECT queries are allowed." };
      }
      const forbidden = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke"];
      const lower = query.toLowerCase();
      for (const word of forbidden) {
        if (lower.includes(` ${word} `) || lower.startsWith(`${word} `)) {
          return { error: `Forbidden keyword '${word}'.` };
        }
      }

      const limited = query.toUpperCase().includes("LIMIT") ? query : `${query} LIMIT 100`;

      // Execute via Supabase SQL
      const { data, error } = await supabase.from("acumatica_invoices").select("reference_number").limit(0);

      // We can't run raw SQL through the JS client without an RPC.
      // Return guidance instead.
      return {
        note: "Direct SQL execution is not available through this tool. Please use the other specialized tools (get_top_customers_by_balance, search_invoices, search_payments, get_aging_report, etc.) to answer this question, or rephrase your question so I can use the right tool.",
        attempted_query: args.query,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

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

    const systemPrompt = `You are an AI assistant for a collections management application (Venture Respiratory). You help users analyze accounts receivable data, find customer information, track payments, manage collection tickets, and generate reports.

Today's date is ${today} (${currentMonth}).

IMPORTANT RULES:
- For "who has the highest balance" or "top customers by balance" questions, ALWAYS use get_top_customers_by_balance. This uses server-side SQL aggregation and is always accurate.
- For "how much did we collect" questions, use get_payment_summary with the correct date range.
- For "bad customers" or "delinquent accounts", use get_overdue_customers which finds customers overdue by 1+ year or owing $500k+.
- For "best collector" questions, use get_collector_performance.
- For aging analysis, use get_aging_report.
- NEVER compute balances yourself by summing individual invoice rows - always use the tools which use server-side aggregation.

Key terminology:
- "Balance" = remaining unpaid amount on an invoice
- "Open" invoices = unpaid invoices
- "Closed" invoices = fully paid
- Color statuses (Red, Yellow, Green, Blue) indicate collection priority

When answering:
- Format currency with $ and commas (e.g., $1,234,567.89)
- Be specific with numbers
- List results in a clear, readable format
- Offer to create tickets or drill deeper when relevant`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: message });

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

    let rounds = 0;
    while (assistantMessage?.tool_calls?.length > 0 && rounds < 5) {
      rounds++;
      messages.push(assistantMessage);

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
