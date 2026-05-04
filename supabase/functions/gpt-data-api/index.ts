import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Api-Key",
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

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "sk_live_";
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function validateApiKey(
  supabase: ReturnType<typeof createClient>,
  apiKey: string
): Promise<boolean> {
  const hash = await hashKey(apiKey);
  const { data } = await supabase
    .from("api_keys")
    .select("id, is_active, expires_at, usage_count")
    .eq("key_hash", hash)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;

  await supabase
    .from("api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      usage_count: (data.usage_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  return true;
}

function parseParams(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  url.searchParams.forEach((val, key) => {
    params[key] = val;
  });
  return params;
}

// ── Route: GET /customers ───────────────────────────────────────────────
async function handleCustomers(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const search = params.search || "";
  const limit = Math.min(parseInt(params.limit || "50"), 200);
  const offset = parseInt(params.offset || "0");
  const sortBy = params.sort_by || "customer_name";
  const sortOrder = params.sort_order === "desc" ? false : true;

  // For balance sorting, use the dedicated customer-balances endpoint
  if (sortBy === "balance" || sortBy === "open_invoice_count") {
    return handleCustomerBalances(supabase, params);
  }

  let query = supabase
    .from("acumatica_customers")
    .select(
      "customer_id, customer_name, customer_class, credit_limit, general_email, billing_email, country, city, billing_state, terms, customer_status, parent_account, account_name",
      { count: "exact" }
    );

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,customer_id.ilike.%${search}%,general_email.ilike.%${search}%`
    );
  }

  if (params.status) query = query.eq("customer_status", params.status);
  if (params.customer_class)
    query = query.eq("customer_class", params.customer_class);
  if (params.country) query = query.eq("country", params.country);

  const { data, error, count } = await query
    .order(sortBy, { ascending: sortOrder })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({
    data,
    total: count,
    limit,
    offset,
    note: "Use sort_by=balance to see computed balances from open invoices, or use /analytics/customer-balances for balance-focused queries.",
  });
}

// ── Route: GET /customers/:id ───────────────────────────────────────────
async function handleCustomerDetail(
  supabase: ReturnType<typeof createClient>,
  customerId: string
) {
  const { data: customer, error } = await supabase
    .from("acumatica_customers")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  if (!customer) return errorResponse("Customer not found", 404);

  // Invoices use "customer" column, not "customer_id"
  const { data: invoiceSummary } = await supabase
    .from("acumatica_invoices")
    .select("status, type, amount, balance")
    .eq("customer", customerId);

  const { data: assignments } = await supabase
    .from("collector_customer_assignments")
    .select("assigned_collector_id, assigned_at, notes")
    .eq("customer_id", customerId);

  const { data: tickets } = await supabase
    .from("collection_tickets")
    .select("id, ticket_number, status, priority, ticket_type, due_date, created_at, updated_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: emailLogs } = await supabase
    .from("customer_email_logs")
    .select("id, subject, status, sent_at, open_count, template_name")
    .eq("customer_id", customerId)
    .order("sent_at", { ascending: false })
    .limit(10);

  const invoiceStats = {
    total_invoices: invoiceSummary?.length || 0,
    total_amount: 0,
    total_balance: 0,
    by_status: {} as Record<string, { count: number; amount: number; balance: number }>,
    by_type: {} as Record<string, { count: number; amount: number; balance: number }>,
  };

  for (const inv of invoiceSummary || []) {
    invoiceStats.total_amount += inv.amount || 0;
    invoiceStats.total_balance += inv.balance || 0;

    const s = inv.status || "Unknown";
    if (!invoiceStats.by_status[s])
      invoiceStats.by_status[s] = { count: 0, amount: 0, balance: 0 };
    invoiceStats.by_status[s].count++;
    invoiceStats.by_status[s].amount += inv.amount || 0;
    invoiceStats.by_status[s].balance += inv.balance || 0;

    const t = inv.type || "Unknown";
    if (!invoiceStats.by_type[t])
      invoiceStats.by_type[t] = { count: 0, amount: 0, balance: 0 };
    invoiceStats.by_type[t].count++;
    invoiceStats.by_type[t].amount += inv.amount || 0;
    invoiceStats.by_type[t].balance += inv.balance || 0;
  }

  return jsonResponse({
    customer,
    invoice_stats: invoiceStats,
    collector_assignments: assignments || [],
    recent_tickets: tickets || [],
    recent_emails: emailLogs || [],
  });
}

// ── Route: GET /invoices ────────────────────────────────────────────────
async function handleInvoices(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const limit = Math.min(parseInt(params.limit || "50"), 200);
  const offset = parseInt(params.offset || "0");

  // Invoices table uses "customer" column (not "customer_id")
  let query = supabase
    .from("acumatica_invoices")
    .select(
      "reference_number, type, status, customer, customer_name, date, due_date, amount, balance, description, currency, color_status, promise_date, created_at",
      { count: "exact" }
    );

  if (params.search) {
    query = query.or(
      `reference_number.ilike.%${params.search}%,customer_name.ilike.%${params.search}%,customer.ilike.%${params.search}%,description.ilike.%${params.search}%`
    );
  }
  if (params.status) query = query.eq("status", params.status);
  if (params.type) query = query.eq("type", params.type);
  if (params.customer_id) query = query.eq("customer", params.customer_id);
  if (params.color_status) query = query.eq("color_status", params.color_status);
  if (params.date_from) query = query.gte("date", params.date_from);
  if (params.date_to) query = query.lte("date", params.date_to);
  if (params.due_date_from) query = query.gte("due_date", params.due_date_from);
  if (params.due_date_to) query = query.lte("due_date", params.due_date_to);
  if (params.min_amount) query = query.gte("amount", parseFloat(params.min_amount));
  if (params.max_amount) query = query.lte("amount", parseFloat(params.max_amount));
  if (params.min_balance) query = query.gte("balance", parseFloat(params.min_balance));
  if (params.max_balance) query = query.lte("balance", parseFloat(params.max_balance));

  const sortBy = params.sort_by || "date";
  const sortOrder = params.sort_order === "asc";

  const { data, error, count } = await query
    .order(sortBy, { ascending: sortOrder })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ data, total: count, limit, offset });
}

// ── Route: GET /invoices/:ref ───────────────────────────────────────────
async function handleInvoiceDetail(
  supabase: ReturnType<typeof createClient>,
  refNumber: string
) {
  const { data: invoice, error } = await supabase
    .from("acumatica_invoices")
    .select("*")
    .eq("reference_number", refNumber)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  if (!invoice) return errorResponse("Invoice not found", 404);

  const { data: memos } = await supabase
    .from("invoice_memos")
    .select("id, memo_text, image_url, document_urls, document_names, created_by_user_email, created_at")
    .eq("invoice_reference", refNumber)
    .order("created_at", { ascending: false });

  const { data: statusHistory } = await supabase
    .from("invoice_status_changes")
    .select("old_status, new_status, changed_by_email, changed_at, notes")
    .eq("invoice_reference", refNumber)
    .order("changed_at", { ascending: false })
    .limit(20);

  const { data: applications } = await supabase
    .from("payment_invoice_applications")
    .select(
      "payment_reference_number, amount_paid, application_date, cash_discount_taken, balance"
    )
    .eq("invoice_reference_number", refNumber)
    .order("application_date", { ascending: false });

  const { data: reminders } = await supabase
    .from("invoice_reminders")
    .select("id, title, description, reminder_date, notes, status, priority, is_triggered, created_at")
    .eq("invoice_reference_number", refNumber)
    .order("reminder_date", { ascending: false })
    .limit(10);

  return jsonResponse({
    invoice,
    memos: memos || [],
    status_history: statusHistory || [],
    payment_applications: applications || [],
    reminders: reminders || [],
  });
}

// ── Route: GET /payments ────────────────────────────────────────────────
async function handlePayments(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const limit = Math.min(parseInt(params.limit || "50"), 200);
  const offset = parseInt(params.offset || "0");

  let query = supabase
    .from("acumatica_payments")
    .select(
      "reference_number, type, status, customer_id, customer_name, application_date, doc_date, payment_amount, available_balance, currency_id, description, payment_method, payment_ref, cash_account, created_at",
      { count: "exact" }
    );

  if (params.search) {
    query = query.or(
      `reference_number.ilike.%${params.search}%,customer_id.ilike.%${params.search}%,customer_name.ilike.%${params.search}%,description.ilike.%${params.search}%,payment_ref.ilike.%${params.search}%`
    );
  }
  if (params.status) query = query.eq("status", params.status);
  if (params.type) query = query.eq("type", params.type);
  if (params.customer_id) query = query.eq("customer_id", params.customer_id);
  if (params.date_from) query = query.gte("application_date", params.date_from);
  if (params.date_to) query = query.lte("application_date", params.date_to);
  if (params.min_amount)
    query = query.gte("payment_amount", parseFloat(params.min_amount));
  if (params.max_amount)
    query = query.lte("payment_amount", parseFloat(params.max_amount));
  if (params.payment_method)
    query = query.eq("payment_method", params.payment_method);

  const sortBy = params.sort_by || "application_date";
  const sortOrder = params.sort_order === "asc";

  const { data, error, count } = await query
    .order(sortBy, { ascending: sortOrder })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ data, total: count, limit, offset });
}

// ── Route: GET /payments/:ref ───────────────────────────────────────────
async function handlePaymentDetail(
  supabase: ReturnType<typeof createClient>,
  refNumber: string
) {
  const { data: payment, error } = await supabase
    .from("acumatica_payments")
    .select("*")
    .eq("reference_number", refNumber)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  if (!payment) return errorResponse("Payment not found", 404);

  const { data: applications } = await supabase
    .from("payment_invoice_applications")
    .select(
      "invoice_reference_number, amount_paid, application_date, balance, cash_discount_taken, due_date, customer_order, description"
    )
    .eq("payment_reference_number", refNumber)
    .order("application_date", { ascending: false });

  return jsonResponse({
    payment,
    invoice_applications: applications || [],
  });
}

// ── Route: GET /tickets ─────────────────────────────────────────────────
async function handleTickets(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const limit = Math.min(parseInt(params.limit || "50"), 200);
  const offset = parseInt(params.offset || "0");

  let query = supabase
    .from("collection_tickets")
    .select(
      "id, ticket_number, customer_id, customer_name, status, priority, ticket_type, notes, assigned_collector_id, due_date, promise_date, created_at, updated_at, resolved_at",
      { count: "exact" }
    );

  if (params.status) query = query.eq("status", params.status);
  if (params.priority) query = query.eq("priority", params.priority);
  if (params.customer_id) query = query.eq("customer_id", params.customer_id);
  if (params.collector_id)
    query = query.eq("assigned_collector_id", params.collector_id);
  if (params.search) {
    query = query.or(
      `ticket_number.ilike.%${params.search}%,customer_name.ilike.%${params.search}%,customer_id.ilike.%${params.search}%,notes.ilike.%${params.search}%`
    );
  }

  const sortBy = params.sort_by || "created_at";
  const sortOrder = params.sort_order === "asc";

  const { data, error, count } = await query
    .order(sortBy, { ascending: sortOrder })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ data, total: count, limit, offset });
}

// ── Route: GET /tickets/:id ─────────────────────────────────────────────
async function handleTicketDetail(
  supabase: ReturnType<typeof createClient>,
  ticketId: string
) {
  const { data: ticket, error } = await supabase
    .from("collection_tickets")
    .select("*")
    .eq("ticket_number", ticketId)
    .maybeSingle();

  if (error) return errorResponse(error.message, 500);
  if (!ticket) return errorResponse("Ticket not found", 404);

  const { data: invoices } = await supabase
    .from("ticket_invoices")
    .select("invoice_reference_number, added_at")
    .eq("ticket_id", ticket.id);

  // Enrich invoices with actual invoice data
  const enrichedInvoices = [];
  for (const ti of invoices || []) {
    const { data: inv } = await supabase
      .from("acumatica_invoices")
      .select("reference_number, type, status, amount, balance, date, due_date, customer_name, color_status")
      .eq("reference_number", ti.invoice_reference_number)
      .maybeSingle();
    enrichedInvoices.push({
      ...ti,
      invoice: inv || null,
    });
  }

  const { data: notes } = await supabase
    .from("ticket_notes")
    .select("id, note_text, user_id, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: false });

  const { data: activity } = await supabase
    .from("ticket_activity_log")
    .select("activity_type, description, user_id, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: statusHistory } = await supabase
    .from("ticket_status_history")
    .select("old_status, new_status, changed_by, changed_at")
    .eq("ticket_id", ticket.id)
    .order("changed_at", { ascending: false });

  // Get collector info
  let collectorInfo = null;
  if (ticket.assigned_collector_id) {
    const { data: collector } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role")
      .eq("id", ticket.assigned_collector_id)
      .maybeSingle();
    collectorInfo = collector;
  }

  return jsonResponse({
    ticket,
    assigned_collector: collectorInfo,
    invoices: enrichedInvoices,
    notes: notes || [],
    activity: activity || [],
    status_history: statusHistory || [],
  });
}

// ── Route: GET /collectors ──────────────────────────────────────────────
async function handleCollectors(
  supabase: ReturnType<typeof createClient>
) {
  const { data: collectors, error } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, role, account_status")
    .in("role", ["collector", "admin", "manager"])
    .eq("account_status", "approved");

  if (error) return errorResponse(error.message, 500);

  const results = [];
  for (const collector of collectors || []) {
    const { data: assignments } = await supabase
      .from("collector_customer_assignments")
      .select("customer_id, customer_name")
      .eq("assigned_collector_id", collector.id);

    const { count: openTicketCount } = await supabase
      .from("collection_tickets")
      .select("id", { count: "exact", head: true })
      .eq("assigned_collector_id", collector.id)
      .in("status", ["open", "in_progress"]);

    const { count: closedTicketCount } = await supabase
      .from("collection_tickets")
      .select("id", { count: "exact", head: true })
      .eq("assigned_collector_id", collector.id)
      .eq("status", "closed");

    results.push({
      ...collector,
      assigned_customers: assignments?.length || 0,
      customer_list: assignments || [],
      open_tickets: openTicketCount || 0,
      closed_tickets: closedTicketCount || 0,
    });
  }

  return jsonResponse({ data: results });
}

// ── Route: GET /analytics/overview ──────────────────────────────────────
async function handleAnalyticsOverview(
  supabase: ReturnType<typeof createClient>
) {
  const { count: customerCount } = await supabase
    .from("acumatica_customers")
    .select("id", { count: "exact", head: true });

  const { data: invoiceCountsByType } = await supabase.rpc(
    "get_invoice_counts_by_type",
    { p_start_date: "2020-01-01", p_end_date: "2099-12-31" }
  );

  // Use SQL aggregation function to avoid 1000-row limit
  const { data: openInvoiceStats } = await supabase.rpc("get_open_invoice_stats");

  const { count: openTicketCount } = await supabase
    .from("collection_tickets")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"]);

  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString();

  const { count: closedTicketsThisMonth } = await supabase
    .from("collection_tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "closed")
    .gte("resolved_at", monthStart);

  const [{ data: recentPayments }, { data: totals }] = await Promise.all([
    supabase
      .from("acumatica_payments")
      .select("payment_amount, type")
      .eq("type", "Payment")
      .gte("application_date", monthStart),
    supabase.rpc("get_api_total_outstanding"),
  ]);

  const paymentsThisMonth =
    recentPayments?.reduce((s, p) => s + (p.payment_amount || 0), 0) || 0;

  const outstanding = totals?.[0] || { total_balance: 0, customer_count: 0, invoice_count: 0 };

  return jsonResponse({
    total_customers: customerCount || 0,
    total_outstanding_balance: parseFloat(outstanding.total_balance) || 0,
    customers_with_outstanding_balance: outstanding.customer_count,
    invoice_counts_by_type: invoiceCountsByType || [],
    open_invoices: openInvoiceStats || {},
    open_tickets: openTicketCount || 0,
    closed_tickets_this_month: closedTicketsThisMonth || 0,
    payments_collected_this_month: Math.round(paymentsThisMonth * 100) / 100,
    payment_count_this_month: recentPayments?.length || 0,
  });
}

// ── Route: GET /analytics/aging ─────────────────────────────────────────
async function handleAnalyticsAging(
  supabase: ReturnType<typeof createClient>
) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const { data: openInvoices } = await supabase
    .from("acumatica_invoices")
    .select(
      "reference_number, customer, customer_name, date, due_date, amount, balance, type"
    )
    .eq("status", "Open")
    .gt("balance", 0);

  const buckets = {
    current: { count: 0, amount: 0, balance: 0 },
    "1-30": { count: 0, amount: 0, balance: 0 },
    "31-60": { count: 0, amount: 0, balance: 0 },
    "61-90": { count: 0, amount: 0, balance: 0 },
    "91-120": { count: 0, amount: 0, balance: 0 },
    "121+": { count: 0, amount: 0, balance: 0 },
  };

  const customerAging: Record<
    string,
    {
      customer_id: string;
      customer_name: string;
      buckets: typeof buckets;
    }
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

    let bucket: keyof typeof buckets;
    if (daysOverdue <= 0) bucket = "current";
    else if (daysOverdue <= 30) bucket = "1-30";
    else if (daysOverdue <= 60) bucket = "31-60";
    else if (daysOverdue <= 90) bucket = "61-90";
    else if (daysOverdue <= 120) bucket = "91-120";
    else bucket = "121+";

    buckets[bucket].count++;
    buckets[bucket].amount += inv.amount || 0;
    buckets[bucket].balance += inv.balance || 0;

    const cid = inv.customer || "Unknown";
    if (!customerAging[cid]) {
      customerAging[cid] = {
        customer_id: cid,
        customer_name: inv.customer_name || cid,
        buckets: {
          current: { count: 0, amount: 0, balance: 0 },
          "1-30": { count: 0, amount: 0, balance: 0 },
          "31-60": { count: 0, amount: 0, balance: 0 },
          "61-90": { count: 0, amount: 0, balance: 0 },
          "91-120": { count: 0, amount: 0, balance: 0 },
          "121+": { count: 0, amount: 0, balance: 0 },
        },
      };
    }
    customerAging[cid].buckets[bucket].count++;
    customerAging[cid].buckets[bucket].amount += inv.amount || 0;
    customerAging[cid].buckets[bucket].balance += inv.balance || 0;
  }

  // Round all values
  for (const b of Object.values(buckets)) {
    b.amount = Math.round(b.amount * 100) / 100;
    b.balance = Math.round(b.balance * 100) / 100;
  }

  const topCustomers = Object.values(customerAging)
    .map((c) => ({
      ...c,
      total_balance: Math.round(
        Object.values(c.buckets).reduce((s, b) => s + b.balance, 0) * 100
      ) / 100,
    }))
    .sort((a, b) => b.total_balance - a.total_balance)
    .slice(0, 25);

  return jsonResponse({
    as_of: todayStr,
    summary: buckets,
    top_customers_by_balance: topCustomers,
  });
}

// ── Route: GET /analytics/monthly-summary ───────────────────────────────
async function handleMonthlySummary(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const entityType = params.entity || "invoices";

  if (entityType === "payments") {
    const { data, error } = await supabase.rpc("get_payment_month_summary");
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ entity: "payments", data });
  }

  const { data, error } = await supabase.rpc("get_invoice_month_summary");
  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ entity: "invoices", data });
}

// ── Route: GET /analytics/customer-balances ─────────────────────────────
async function handleCustomerBalances(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const limit = Math.min(parseInt(params.limit || "50"), 200);
  const offset = parseInt(params.offset || "0");
  const sortBy = params.sort_by || "balance";
  const sortOrder = params.sort_order === "asc";

  const [{ data: customers }, { data: totals }] = await Promise.all([
    supabase.rpc("get_api_customer_balances", {
      p_search: params.search || "",
      p_sort_by: sortBy,
      p_sort_asc: sortOrder,
      p_limit: limit,
      p_offset: offset,
    }),
    supabase.rpc("get_api_total_outstanding"),
  ]);

  const total = totals?.[0] || { total_balance: 0, customer_count: 0, invoice_count: 0 };

  return jsonResponse({
    data: customers || [],
    total_customers_with_balance: total.customer_count,
    total_outstanding_balance: parseFloat(total.total_balance) || 0,
    total_open_invoices: total.invoice_count,
    note: "Balances are computed from open invoices in real-time, not the stale customer balance field.",
    limit,
    offset,
  });
}

// ── Route: GET /emails ──────────────────────────────────────────────────
async function handleEmails(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const limit = Math.min(parseInt(params.limit || "50"), 200);
  const offset = parseInt(params.offset || "0");

  let query = supabase
    .from("customer_email_logs")
    .select(
      "id, customer_id, customer_name, customer_email, template_name, subject, sent_at, delivered_at, opened_at, open_count, status, invoice_count, total_balance, had_pdf_attachment",
      { count: "exact" }
    );

  if (params.customer_id) query = query.eq("customer_id", params.customer_id);
  if (params.status) query = query.eq("status", params.status);
  if (params.date_from) query = query.gte("sent_at", params.date_from);
  if (params.date_to) query = query.lte("sent_at", params.date_to);
  if (params.search) {
    query = query.or(
      `customer_name.ilike.%${params.search}%,customer_email.ilike.%${params.search}%,subject.ilike.%${params.search}%`
    );
  }

  const { data, error, count } = await query
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ data, total: count, limit, offset });
}

// ── Route: GET /search ──────────────────────────────────────────────────
async function handleGlobalSearch(
  supabase: ReturnType<typeof createClient>,
  params: Record<string, string>
) {
  const query = params.q || params.query || "";
  if (!query || query.length < 2)
    return errorResponse("Query must be at least 2 characters");

  const limit = Math.min(parseInt(params.limit || "10"), 25);
  const likePattern = `%${query}%`;

  // Run 4 fast, independent queries in parallel (each individually limited)
  const [customers, invoices, payments, tickets] = await Promise.all([
    supabase
      .from("acumatica_customers")
      .select("customer_id, customer_name, customer_class, balance, general_email, customer_status")
      .or(`customer_name.ilike.${likePattern},customer_id.ilike.${likePattern},general_email.ilike.${likePattern}`)
      .limit(limit),
    supabase
      .from("acumatica_invoices")
      .select("reference_number, type, status, customer, customer_name, amount, balance, date")
      .or(`reference_number.ilike.${likePattern},customer_name.ilike.${likePattern},customer.ilike.${likePattern}`)
      .limit(limit),
    supabase
      .from("acumatica_payments")
      .select("reference_number, type, status, customer_id, customer_name, payment_amount, application_date, payment_ref")
      .or(`reference_number.ilike.${likePattern},customer_name.ilike.${likePattern},customer_id.ilike.${likePattern},payment_ref.ilike.${likePattern}`)
      .limit(limit),
    supabase
      .from("collection_tickets")
      .select("ticket_number, customer_id, customer_name, status, priority, ticket_type")
      .or(`ticket_number.ilike.${likePattern},customer_name.ilike.${likePattern},customer_id.ilike.${likePattern}`)
      .limit(limit),
  ]);

  return jsonResponse({
    query,
    results: {
      customers: customers.data || [],
      invoices: invoices.data || [],
      payments: payments.data || [],
      tickets: tickets.data || [],
    },
  });
}

// ── Route: POST /keys/generate ──────────────────────────────────────────
async function handleGenerateKey(
  supabase: ReturnType<typeof createClient>,
  body: any
) {
  const name = body.name || "GPT API Key";
  const expiresAt = body.expires_at || null;

  const plainKey = generateApiKey();
  const hash = await hashKey(plainKey);
  const prefix = plainKey.substring(0, 16) + "...";

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      name,
      key_hash: hash,
      key_prefix: prefix,
      expires_at: expiresAt,
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  return jsonResponse({
    message:
      "API key created. Save this key - it will NOT be shown again.",
    api_key: plainKey,
    key_id: data.id,
    key_prefix: prefix,
    name,
    expires_at: expiresAt,
  });
}

// ── Route: GET /endpoints ───────────────────────────────────────────────
function handleListEndpoints() {
  return jsonResponse({
    endpoints: [
      {
        method: "GET",
        path: "/customers",
        description:
          "List/search customers with filtering and pagination",
        params:
          "search, status, customer_class, country, sort_by, sort_order, limit, offset",
      },
      {
        method: "GET",
        path: "/customers/{customer_id}",
        description:
          "Get full customer detail with invoice stats, collector assignments, recent tickets, and recent emails",
      },
      {
        method: "GET",
        path: "/invoices",
        description:
          "List/search invoices with comprehensive filtering",
        params:
          "search, status, type, customer_id, color_status, date_from, date_to, due_date_from, due_date_to, min_amount, max_amount, min_balance, max_balance, sort_by, sort_order, limit, offset",
      },
      {
        method: "GET",
        path: "/invoices/{reference_number}",
        description:
          "Get full invoice detail with memos, status history, payment applications, and reminders",
      },
      {
        method: "GET",
        path: "/payments",
        description: "List/search payments with filtering",
        params:
          "search, status, type, customer_id, date_from, date_to, min_amount, max_amount, payment_method, sort_by, sort_order, limit, offset",
      },
      {
        method: "GET",
        path: "/payments/{reference_number}",
        description: "Get full payment detail with invoice applications",
      },
      {
        method: "GET",
        path: "/tickets",
        description: "List/search collection tickets",
        params:
          "search, status, priority, customer_id, collector_id, sort_by, sort_order, limit, offset",
      },
      {
        method: "GET",
        path: "/tickets/{ticket_number}",
        description:
          "Get full ticket detail with enriched invoices, notes, activity log, status history, and collector info",
      },
      {
        method: "GET",
        path: "/collectors",
        description:
          "List all active collectors with their assignments, open ticket counts, and closed ticket counts",
      },
      {
        method: "GET",
        path: "/analytics/overview",
        description:
          "High-level dashboard metrics: customer count, open balances by type, tickets, payments this month",
      },
      {
        method: "GET",
        path: "/analytics/aging",
        description:
          "AR aging report with buckets (current, 1-30, 31-60, 61-90, 91-120, 121+) and top 25 customers",
      },
      {
        method: "GET",
        path: "/analytics/monthly-summary",
        description:
          "Month-by-month summary of invoices or payments",
        params: "entity (invoices|payments)",
      },
      {
        method: "GET",
        path: "/analytics/customer-balances",
        description: "Customers ranked by outstanding balance",
        params: "sort_by, sort_order, limit, offset",
      },
      {
        method: "GET",
        path: "/emails",
        description:
          "Email sending history with delivery/open tracking",
        params: "search, customer_id, status, date_from, date_to, limit, offset",
      },
      {
        method: "GET",
        path: "/search",
        description:
          "Global search across customers, invoices, and payments",
        params: "q (query string, min 2 chars)",
      },
      {
        method: "GET",
        path: "/endpoints",
        description: "List all available API endpoints (this endpoint)",
      },
    ],
    authentication:
      "Include header: X-Api-Key: your_api_key",
  });
}

// ── Main router ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const pathParts = url.pathname
      .replace(/^\/gpt-data-api\/?/, "")
      .split("/")
      .filter(Boolean);

    const route = pathParts[0] || "";
    const subRoute = pathParts[1] || "";
    const params = parseParams(url);

    // /endpoints route is public
    if (route === "endpoints" && req.method === "GET") {
      return handleListEndpoints();
    }

    // Key generation requires Supabase auth (admin only) - not API key
    if (route === "keys" && subRoute === "generate" && req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader)
        return errorResponse("Authorization required", 401);
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (!user) return errorResponse("Invalid token", 401);

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (
        !profile ||
        !["admin", "developer"].includes(profile.role)
      ) {
        return errorResponse(
          "Only admins can generate API keys",
          403
        );
      }

      const body = await req.json().catch(() => ({}));
      return handleGenerateKey(supabase, {
        ...body,
        created_by: user.id,
      });
    }

    // All data routes require API key auth
    const apiKey =
      req.headers.get("X-Api-Key") ||
      req.headers.get("x-api-key") ||
      params.api_key ||
      "";
    if (!apiKey) {
      return errorResponse(
        "API key required. Include header X-Api-Key or query param api_key",
        401
      );
    }

    const isValid = await validateApiKey(supabase, apiKey);
    if (!isValid) {
      return errorResponse("Invalid or expired API key", 401);
    }

    // Route dispatch
    switch (route) {
      case "customers":
        if (subRoute)
          return handleCustomerDetail(supabase, decodeURIComponent(subRoute));
        return handleCustomers(supabase, params);

      case "invoices":
        if (subRoute)
          return handleInvoiceDetail(supabase, decodeURIComponent(subRoute));
        return handleInvoices(supabase, params);

      case "payments":
        if (subRoute)
          return handlePaymentDetail(supabase, decodeURIComponent(subRoute));
        return handlePayments(supabase, params);

      case "tickets":
        if (subRoute)
          return handleTicketDetail(supabase, decodeURIComponent(subRoute));
        return handleTickets(supabase, params);

      case "collectors":
        return handleCollectors(supabase);

      case "analytics":
        switch (subRoute) {
          case "overview":
            return handleAnalyticsOverview(supabase);
          case "aging":
            return handleAnalyticsAging(supabase);
          case "monthly-summary":
            return handleMonthlySummary(supabase, params);
          case "customer-balances":
            return handleCustomerBalances(supabase, params);
          default:
            return errorResponse(
              "Unknown analytics route. Try: overview, aging, monthly-summary, customer-balances"
            );
        }

      case "emails":
        return handleEmails(supabase, params);

      case "search":
        return handleGlobalSearch(supabase, params);

      default:
        return errorResponse(
          "Unknown route. GET /endpoints to see all available routes.",
          404
        );
    }
  } catch (error: any) {
    console.error("GPT Data API error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
