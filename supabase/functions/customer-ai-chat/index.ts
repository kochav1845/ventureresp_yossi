import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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
      name: "get_customer_overview",
      description: "Get the customer's full profile: balance breakdown, invoice stats, aging, credit info, and contact details.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_invoices",
      description: "Get this customer's invoices. Filter by status, type, date range, amount, or days overdue.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["Open", "Closed", "Balanced", "Voided"] },
          type: { type: "string", enum: ["Invoice", "Credit Memo", "Debit Memo"] },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          min_balance: { type: "number" },
          min_amount: { type: "number" },
          min_days_overdue: { type: "number" },
          sort_by: { type: "string", enum: ["date", "amount", "balance", "due_date"] },
          sort_order: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_payments",
      description: "Get this customer's payment history. Filter by date range, type, or amount.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          type: { type: "string", enum: ["Payment", "Prepayment", "Voided Check", "Credit Memo", "Refund"] },
          min_amount: { type: "number" },
          limit: { type: "number", description: "Max results (default 50)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_behavior_stats",
      description: "Calculate this customer's payment behavior: average days to pay, payment frequency, payment patterns by month/year, and historical trends.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "YYYY-MM-DD for analysis period start" },
          date_to: { type: "string", description: "YYYY-MM-DD for analysis period end" },
          year: { type: "number", description: "Specific year to analyze" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_timeline",
      description: "Get historical balance/payment timeline for this customer grouped by day/week/month.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          grouping: { type: "string", enum: ["day", "week", "month"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_tickets",
      description: "Get collection tickets for this customer. Optionally filter by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by ticket status" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_ticket",
      description: "Create a new collection ticket for this customer. Can optionally include specific invoices.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Ticket title" },
          description: { type: "string", description: "Ticket description" },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          invoice_references: {
            type: "array",
            items: { type: "string" },
            description: "Array of invoice reference numbers to include in the ticket",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a reminder for this customer. Set a future date and title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Reminder title" },
          reminder_date: { type: "string", description: "YYYY-MM-DD date for the reminder" },
          notes: { type: "string", description: "Additional notes" },
        },
        required: ["title", "reminder_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_customer_query",
      description: "Run a custom read-only SQL query scoped to this customer for advanced analysis. Only SELECT statements allowed.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL SELECT query. Use '{customer_id}' as placeholder for the customer ID." },
        },
        required: ["query"],
      },
    },
  },
];

async function executeTool(sb: any, name: string, args: any, customerId: string, userId: string): Promise<any> {
  switch (name) {
    case "get_customer_overview": {
      const { data: customer } = await sb
        .from("acumatica_customers")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();

      const { data: invoiceStats } = await sb.rpc("execute_readonly_sql", {
        sql_query: `SELECT
          COUNT(*) FILTER (WHERE status = 'Open' AND type = 'Invoice') AS open_invoices,
          COUNT(*) FILTER (WHERE status = 'Balanced' AND type = 'Invoice') AS balanced_invoices,
          COUNT(*) FILTER (WHERE status = 'Closed' AND type = 'Invoice') AS closed_invoices,
          COALESCE(SUM(balance) FILTER (WHERE status = 'Open' AND type = 'Invoice'), 0) AS open_balance,
          COALESCE(SUM(balance) FILTER (WHERE status = 'Balanced' AND type = 'Invoice'), 0) AS balanced_balance,
          COALESCE(SUM(amount) FILTER (WHERE status = 'Open' AND type = 'Credit Memo'), 0) AS credit_memo_total,
          COUNT(*) FILTER (WHERE status = 'Open' AND type = 'Credit Memo') AS open_credit_memos,
          COALESCE(MAX(CURRENT_DATE - date::date) FILTER (WHERE status = 'Open' AND type = 'Invoice'), 0) AS max_days_overdue,
          COALESCE(AVG(amount) FILTER (WHERE type = 'Invoice'), 0) AS avg_invoice_amount,
          COALESCE(MAX(amount) FILTER (WHERE type = 'Invoice'), 0) AS max_invoice_amount
        FROM acumatica_invoices WHERE customer = '${customerId}' AND status != 'On Hold'`
      });

      const { data: paymentStats } = await sb.rpc("execute_readonly_sql", {
        sql_query: `SELECT
          COUNT(*) AS total_payments,
          COALESCE(SUM(payment_amount) FILTER (WHERE type = 'Payment'), 0) AS total_paid,
          MAX(application_date) AS last_payment_date,
          COALESCE(AVG(payment_amount) FILTER (WHERE type = 'Payment' AND payment_amount > 0), 0) AS avg_payment_amount
        FROM acumatica_payments WHERE customer_id = '${customerId}' AND type IN ('Payment', 'Prepayment')`
      });

      return {
        customer: customer || { customer_id: customerId },
        invoice_stats: invoiceStats?.[0] || {},
        payment_stats: paymentStats?.[0] || {},
      };
    }

    case "get_customer_invoices": {
      let q = sb.from("acumatica_invoices")
        .select("reference_number, type, status, date, due_date, amount, balance, color_status, description")
        .eq("customer", customerId)
        .neq("status", "On Hold");

      if (args.status) q = q.eq("status", args.status);
      if (args.type) q = q.eq("type", args.type);
      if (args.date_from) q = q.gte("date", args.date_from);
      if (args.date_to) q = q.lte("date", args.date_to);
      if (args.min_balance) q = q.gte("balance", args.min_balance);
      if (args.min_amount) q = q.gte("amount", args.min_amount);

      const sortCol = args.sort_by === "amount" ? "amount" : args.sort_by === "balance" ? "balance" : args.sort_by === "due_date" ? "due_date" : "date";
      q = q.order(sortCol, { ascending: args.sort_order === "asc" });

      const limit = Math.min(args.limit || 50, 200);
      const { data, error } = await q.limit(limit);
      if (error) return { error: error.message };

      let invoices = data || [];

      if (args.min_days_overdue) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - args.min_days_overdue);
        const cutoffStr = cutoff.toISOString().split("T")[0];
        invoices = invoices.filter((i: any) => i.date && i.date <= cutoffStr);
      }

      return {
        invoices: invoices.map((i: any) => ({
          ...i,
          days_overdue: i.date ? Math.floor((Date.now() - new Date(i.date).getTime()) / 86400000) : 0,
        })),
        count: invoices.length,
      };
    }

    case "get_customer_payments": {
      let q = sb.from("acumatica_payments")
        .select("reference_number, type, status, payment_amount, application_date, payment_method, payment_ref, doc_date")
        .eq("customer_id", customerId);

      if (args.type) q = q.eq("type", args.type);
      if (args.date_from) q = q.gte("application_date", args.date_from);
      if (args.date_to) q = q.lte("application_date", args.date_to);
      if (args.min_amount) q = q.gte("payment_amount", args.min_amount);

      const limit = Math.min(args.limit || 50, 200);
      const { data, error } = await q.order("application_date", { ascending: false }).limit(limit);
      if (error) return { error: error.message };

      const totalAmount = (data || []).reduce((sum: number, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);
      return { payments: data || [], count: (data || []).length, total_amount: totalAmount };
    }

    case "get_payment_behavior_stats": {
      let dateFilter = "";
      if (args.date_from) dateFilter += ` AND p.application_date >= '${args.date_from}'`;
      if (args.date_to) dateFilter += ` AND p.application_date <= '${args.date_to}'`;
      if (args.year) dateFilter += ` AND EXTRACT(YEAR FROM p.application_date::date) = ${args.year}`;

      const { data } = await sb.rpc("execute_readonly_sql", {
        sql_query: `WITH payment_gaps AS (
          SELECT
            p.application_date::date AS pay_date,
            p.payment_amount,
            LAG(p.application_date::date) OVER (ORDER BY p.application_date) AS prev_pay_date
          FROM acumatica_payments p
          WHERE p.customer_id = '${customerId}'
            AND p.type IN ('Payment', 'Prepayment')
            AND p.payment_amount > 0
            ${dateFilter}
          ORDER BY p.application_date
        ),
        invoice_payment_matches AS (
          SELECT
            i.date::date AS invoice_date,
            pia.application_date::date AS payment_date,
            pia.amount_paid,
            (pia.application_date::date - i.date::date) AS days_to_pay
          FROM payment_invoice_applications pia
          JOIN acumatica_invoices i ON i.reference_number = pia.invoice_reference_number
            AND i.customer = '${customerId}'
          WHERE pia.customer_id = '${customerId}'
            AND pia.doc_type = 'Invoice'
            AND pia.amount_paid > 0
            ${args.date_from ? `AND pia.application_date >= '${args.date_from}'` : ''}
            ${args.date_to ? `AND pia.application_date <= '${args.date_to}'` : ''}
            ${args.year ? `AND EXTRACT(YEAR FROM pia.application_date::date) = ${args.year}` : ''}
        ),
        monthly_payments AS (
          SELECT
            TO_CHAR(p.application_date::date, 'YYYY-MM') AS month,
            SUM(p.payment_amount) AS total_paid,
            COUNT(*) AS payment_count
          FROM acumatica_payments p
          WHERE p.customer_id = '${customerId}'
            AND p.type IN ('Payment', 'Prepayment')
            AND p.payment_amount > 0
            ${dateFilter}
          GROUP BY TO_CHAR(p.application_date::date, 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 24
        )
        SELECT json_build_object(
          'avg_days_to_pay', (SELECT COALESCE(AVG(days_to_pay), 0) FROM invoice_payment_matches WHERE days_to_pay >= 0),
          'median_days_to_pay', (SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_pay), 0) FROM invoice_payment_matches WHERE days_to_pay >= 0),
          'min_days_to_pay', (SELECT COALESCE(MIN(days_to_pay), 0) FROM invoice_payment_matches WHERE days_to_pay >= 0),
          'max_days_to_pay', (SELECT COALESCE(MAX(days_to_pay), 0) FROM invoice_payment_matches WHERE days_to_pay >= 0),
          'total_invoices_matched', (SELECT COUNT(*) FROM invoice_payment_matches),
          'avg_gap_between_payments', (SELECT COALESCE(AVG(pay_date - prev_pay_date), 0) FROM payment_gaps WHERE prev_pay_date IS NOT NULL),
          'total_payments', (SELECT COUNT(*) FROM payment_gaps),
          'total_amount_paid', (SELECT COALESCE(SUM(payment_amount), 0) FROM payment_gaps),
          'monthly_breakdown', (SELECT COALESCE(json_agg(row_to_json(mp)), '[]'::json) FROM monthly_payments mp)
        ) AS result`
      });

      if (data?.[0]?.result) return data[0].result;
      return { error: "Could not compute payment behavior stats" };
    }

    case "get_customer_timeline": {
      const { data, error } = await sb.rpc("get_single_customer_timeline", {
        p_customer_id: customerId,
        p_date_from: args.date_from || null,
        p_date_to: args.date_to || null,
        p_grouping: args.grouping || "month",
      });
      if (error) return { error: error.message };
      return { timeline: data || [] };
    }

    case "get_customer_tickets": {
      let q = sb.from("collection_tickets")
        .select("id, ticket_number, title, status, priority, created_at, due_date, assigned_collector_id")
        .eq("customer_id", customerId);

      if (args.status) q = q.eq("status", args.status);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(args.limit || 20);
      if (error) return { error: error.message };
      return { tickets: data || [], count: (data || []).length };
    }

    case "create_ticket": {
      const { data: customer } = await sb
        .from("acumatica_customers")
        .select("customer_name")
        .eq("customer_id", customerId)
        .maybeSingle();

      const ticketData: any = {
        customer_id: customerId,
        customer_name: customer?.customer_name || customerId,
        title: args.title,
        description: args.description || "",
        priority: args.priority || "medium",
        status: "open",
        created_by_user_id: userId,
      };

      const { data: ticket, error } = await sb
        .from("collection_tickets")
        .insert(ticketData)
        .select("id, ticket_number")
        .single();

      if (error) return { error: error.message };

      if (args.invoice_references && args.invoice_references.length > 0) {
        const { data: invoices } = await sb
          .from("acumatica_invoices")
          .select("id, reference_number, amount, balance")
          .eq("customer", customerId)
          .in("reference_number", args.invoice_references);

        if (invoices && invoices.length > 0) {
          const assignments = invoices.map((inv: any) => ({
            ticket_id: ticket.id,
            invoice_id: inv.id,
          }));
          await sb.from("collection_ticket_invoices").insert(assignments);
        }
      }

      return { success: true, ticket_id: ticket.id, ticket_number: ticket.ticket_number };
    }

    case "create_reminder": {
      const { data: customer } = await sb
        .from("acumatica_customers")
        .select("customer_name")
        .eq("customer_id", customerId)
        .maybeSingle();

      const { data: reminder, error } = await sb
        .from("invoice_reminders")
        .insert({
          user_id: userId,
          title: args.title,
          reminder_date: args.reminder_date,
          notes: args.notes || `Reminder for customer ${customer?.customer_name || customerId}`,
          customer_id: customerId,
          is_active: true,
        })
        .select("id, title, reminder_date")
        .single();

      if (error) return { error: error.message };
      return { success: true, reminder };
    }

    case "run_customer_query": {
      let query = (args.query || "").trim();
      if (!query.toUpperCase().startsWith("SELECT")) return { error: "Only SELECT queries allowed." };

      const forbidden = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "grant", "revoke"];
      const lower = query.toLowerCase();
      for (const word of forbidden) {
        if (lower.includes(` ${word} `) || lower.startsWith(`${word} `)) return { error: `Forbidden: ${word}` };
      }

      query = query.replace(/\{customer_id\}/g, customerId);
      if (!query.match(/\blimit\b/i)) query += " LIMIT 100";

      const { data, error } = await sb.rpc("execute_readonly_sql", { sql_query: query });
      if (error) return { error: error.message };
      return { rows: data, row_count: Array.isArray(data) ? data.length : 0 };
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

    if (!openaiKey) return errorResponse("OpenAI API key not configured", 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization required", 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return errorResponse("Invalid session", 401);

    const body = await req.json();
    const { message, conversation_history, customer_id } = body;
    if (!message) return errorResponse("Message is required");
    if (!customer_id) return errorResponse("customer_id is required");

    const { data: customerInfo } = await supabase
      .from("acumatica_customers")
      .select("customer_id, customer_name, customer_class, terms, credit_limit, email")
      .eq("customer_id", customer_id)
      .maybeSingle();

    const customerName = customerInfo?.customer_name || customer_id;
    const today = new Date().toISOString().split("T")[0];
    const currentMonth = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

    const systemPrompt = `You are an AI assistant specialized in analyzing customer "${customerName}" (ID: ${customer_id}) for a collections management system (Venture Respiratory).

Today: ${today} (${currentMonth}).
Customer: ${customerName}
Customer ID: ${customer_id}
${customerInfo?.customer_class ? `Class: ${customerInfo.customer_class}` : ''}
${customerInfo?.terms ? `Terms: ${customerInfo.terms}` : ''}
${customerInfo?.credit_limit ? `Credit Limit: $${Number(customerInfo.credit_limit).toLocaleString()}` : ''}

RULES:
- ALWAYS use tools to query data. Never guess or make up numbers.
- All tools are automatically scoped to this customer — no need to specify customer_id.
- For payment behavior (avg days to pay, payment patterns), use get_payment_behavior_stats.
- For invoice queries (open, overdue, by amount), use get_customer_invoices.
- For payment history, use get_customer_payments.
- For balance overview, use get_customer_overview.
- For historical trends, use get_customer_timeline.
- For tickets, use get_customer_tickets.
- To create a collection ticket, use create_ticket. Include invoice references if discussed.
- To set a reminder, use create_reminder.
- For complex analysis not covered by other tools, use run_customer_query.
- Format currency as $1,234.56. Be specific with numbers.
- Keep responses concise but informative. Use bullet points for lists.
- When creating tickets or reminders, confirm what was created.
- Proactively offer to create tickets or reminders when discussing overdue invoices.`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-12)) {
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

    while (assistantMessage?.tool_calls?.length > 0 && rounds < 6) {
      rounds++;
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (tc: any) => {
          const args = JSON.parse(tc.function.arguments || "{}");
          const toolResult = await executeTool(supabase, tc.function.name, args, customer_id, user.id);
          return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) };
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

    return jsonResponse({
      reply: assistantMessage?.content || "I could not generate a response.",
      tools_used: rounds > 0,
    });
  } catch (error: any) {
    console.error("Customer AI Chat error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
