import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAGE = 500;
const TIME_BUDGET_MS = 110_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── AuthZ: admin only ───────────────────────────────────────────────
    // This rebuilds every payment-to-invoice link for an organization. It ran
    // with no caller check at all, so an unauthenticated POST could wipe the
    // table (see the per-payment delete below for why it no longer can).
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data: { user: caller } } = await anonClient.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: callerProfile } = await supabase
      .from("user_profiles").select("role, organization_id, account_status").eq("id", caller.id).maybeSingle();
    if (!callerProfile || callerProfile.account_status !== "approved" || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Forbidden: admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const organizationId = (callerProfile as any).organization_id as string | null;
    if (!organizationId) {
      return new Response(JSON.stringify({ success: false, error: "Caller has no organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const skip: number = Number.isFinite(body?.skip) ? Math.max(0, Math.trunc(body.skip)) : 0;
    // `limit` caps how many payments one call touches. Used for smoke-testing
    // the rebuild on a handful of payments before turning it loose on all of them.
    const limit: number = Number.isFinite(body?.limit) ? Math.max(1, Math.trunc(body.limit)) : Infinity;

    const { count: totalPayments } = await supabase
      .from("acumatica_payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("application_history", "is", null);

    let processedPayments = 0;
    let totalLinks = 0;
    let cursor = skip;
    let timedOut = false;
    const errors: string[] = [];

    // Paged. The old code did one unpaged select, which PostgREST capped at
    // max_rows (1000) out of 27,295 payments, and then reported success.
    while (true) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { timedOut = true; break; }
      if (processedPayments >= limit) { timedOut = true; break; }

      const { data: payments, error: fetchError } = await supabase
        .from("acumatica_payments")
        .select("id, reference_number, customer_id, application_history")
        .eq("organization_id", organizationId)
        .not("application_history", "is", null)
        .order("id", { ascending: true })   // stable unique key, or range() skips rows
        .range(cursor, cursor + Math.min(PAGE, limit) - 1);

      if (fetchError) {
        throw new Error(`Failed to fetch payments: ${fetchError.message}`);
      }

      const batch = payments || [];
      if (batch.length === 0) break;

      for (const payment of batch) {
        if (processedPayments >= limit) { timedOut = true; break; }
        cursor++;

        const applicationHistory = payment.application_history;
        if (!Array.isArray(applicationHistory) || applicationHistory.length === 0) {
          processedPayments++;
          continue;
        }

        const seen = new Set<string>();
        const linksToInsert = [];
        for (const app of applicationHistory as any[]) {
          const rawRef = app.DisplayRefNbr?.value || app.AdjustedRefNbr?.value || "Unknown";
          // Pad, do NOT strip. The old code wrote 96026 for 096026, while
          // acumatica_invoices stores 93,710 of its 134,449 refs zero-padded,
          // so those links matched no invoice at all.
          const invoiceRef = /^[0-9]+$/.test(rawRef) && rawRef.length < 6
            ? rawRef.padStart(6, "0")
            : rawRef;

          // The table is UNIQUE (payment_id, invoice_reference_number); a
          // history with two rows for one invoice would abort the whole insert.
          if (seen.has(invoiceRef)) continue;
          seen.add(invoiceRef);

          linksToInsert.push({
            payment_id: payment.id,
            payment_reference_number: payment.reference_number,
            invoice_reference_number: invoiceRef,
            customer_id: app.Customer?.value || payment.customer_id,
            organization_id: organizationId,
            application_date: app.Date?.value || null,
            amount_paid: app.AmountPaid?.value !== undefined ? parseFloat(app.AmountPaid.value) : 0,
            balance: app.Balance?.value !== undefined ? parseFloat(app.Balance.value) : 0,
            cash_discount_taken: app.CashDiscountTaken?.value !== undefined ? parseFloat(app.CashDiscountTaken.value) : 0,
            post_period: app.PostPeriod?.value || null,
            application_period: app.ApplicationPeriod?.value || null,
            due_date: app.DueDate?.value || null,
            customer_order: app.CustomerOrder?.value || null,
            description: app.Description?.value || null,
            invoice_date: app.Date?.value || null,
            doc_type: app.DisplayDocType?.value || app.AdjustedDocType?.value || "Invoice",
          });
        }

        if (linksToInsert.length === 0) {
          processedPayments++;
          continue;
        }

        // Scoped to this one payment, immediately before its own insert. The
        // old code deleted the WHOLE table up front and then rebuilt only the
        // first 1,000 payments, so one click destroyed ~96% of the links.
        await supabase
          .from("payment_invoice_applications")
          .delete()
          .eq("payment_id", payment.id);

        const { error: insertError } = await supabase
          .from("payment_invoice_applications")
          .insert(linksToInsert);

        if (insertError) {
          errors.push(`${payment.reference_number}: ${insertError.message}`);
        } else {
          totalLinks += linksToInsert.length;
        }
        processedPayments++;
      }

      if (batch.length < PAGE) break;
    }

    const complete = !timedOut && cursor >= (totalPayments ?? 0);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Extracted ${totalLinks} payment-to-invoice links from ${processedPayments} payments`,
        total_payments_processed: processedPayments,
        total_links_created: totalLinks,
        total_payments: totalPayments ?? null,
        next_skip: cursor,
        complete,
        duration_ms: Date.now() - startedAt,
        errors: errors.length ? errors.slice(0, 10) : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in payment-invoice-links-sync:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
