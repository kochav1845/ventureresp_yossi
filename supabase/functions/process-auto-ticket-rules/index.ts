import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AutoTicketRule {
  id: string;
  customer_id: string;
  rule_type: 'invoice_age' | 'payment_recency';
  min_days_old: number | null;
  max_days_old: number | null;
  check_payment_within_days_min: number | null;
  check_payment_within_days_max: number | null;
  assigned_collector_id: string;
}

interface Invoice {
  reference_number: string;
  customer: string;
  balance: number;
  status: string;
  date: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const results = {
      processed: 0,
      tickets_created: 0,
      tickets_updated: 0,
      invoices_added: 0,
      errors: [] as string[],
    };

    const { data: rules, error: rulesError } = await supabase
      .from("auto_ticket_rules")
      .select("*")
      .eq("active", true);

    if (rulesError) {
      throw new Error(`Failed to fetch rules: ${rulesError.message}`);
    }

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active rules found", results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const rule of rules as AutoTicketRule[]) {
      try {
        results.processed++;

        let invoiceRefs: string[] = [];

        if (rule.rule_type === 'invoice_age') {
          // Original logic: Find old invoices within date range
          const minDate = new Date(today);
          minDate.setDate(minDate.getDate() - rule.max_days_old!);

          const maxDate = new Date(today);
          maxDate.setDate(maxDate.getDate() - rule.min_days_old!);

          const { data: invoices, error: invoicesError } = await supabase
            .from("acumatica_invoices")
            .select("reference_number, customer, balance, status, date")
            .eq("customer", rule.customer_id)
            .eq("type", "Invoice")
            .gt("balance", 0)
            .gte("date", minDate.toISOString().split("T")[0])
            .lte("date", maxDate.toISOString().split("T")[0])
            .in("status", ["Open", "open"]);

          if (invoicesError) {
            results.errors.push(`Customer ${rule.customer_id}: ${invoicesError.message}`);
            continue;
          }

          if (!invoices || invoices.length === 0) {
            continue;
          }

          invoiceRefs = invoices.map((inv: Invoice) => inv.reference_number);
        } else if (rule.rule_type === 'payment_recency') {
          // New logic: Check if customer has open invoices and no recent payment
          const { data: openInvoices, error: openInvoicesError } = await supabase
            .from("acumatica_invoices")
            .select("reference_number")
            .eq("customer", rule.customer_id)
            .eq("type", "Invoice")
            .gt("balance", 0)
            .in("status", ["Open", "open"]);

          if (openInvoicesError) {
            results.errors.push(`Customer ${rule.customer_id}: ${openInvoicesError.message}`);
            continue;
          }

          if (!openInvoices || openInvoices.length === 0) {
            continue;
          }

          // Find last payment date for this customer
          const { data: lastPayment, error: lastPaymentError } = await supabase
            .from("acumatica_payments")
            .select("application_date")
            .eq("customer_id", rule.customer_id)
            .eq("type", "Payment")
            .not("application_date", "is", null)
            .order("application_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastPaymentError) {
            results.errors.push(`Customer ${rule.customer_id}: ${lastPaymentError.message}`);
            continue;
          }

          // Calculate days since last payment
          let daysSincePayment = Infinity;
          if (lastPayment && lastPayment.application_date) {
            const lastPaymentDate = new Date(lastPayment.application_date);
            daysSincePayment = Math.floor((today.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
          }

          // Check if days since payment falls within the rule's range
          const minDays = rule.check_payment_within_days_min!;
          const maxDays = rule.check_payment_within_days_max!;

          if (daysSincePayment < minDays || daysSincePayment > maxDays) {
            continue;
          }

          // Include all open invoices for this customer
          invoiceRefs = openInvoices.map((inv) => inv.reference_number);
        } else {
          results.errors.push(`Unknown rule type: ${rule.rule_type}`);
          continue;
        }

        if (invoiceRefs.length === 0) {
          continue;
        }

        const { data: existingTickets, error: ticketsError } = await supabase
          .from("collection_tickets")
          .select("id")
          .eq("customer_id", rule.customer_id)
          .eq("assigned_collector_id", rule.assigned_collector_id)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(1);

        if (ticketsError) {
          results.errors.push(`Customer ${rule.customer_id}: ${ticketsError.message}`);
          continue;
        }

        if (existingTickets && existingTickets.length > 0) {
          const ticket = existingTickets[0];

          // Get existing invoice references for this ticket
          const { data: existingInvoices, error: existingInvoicesError } = await supabase
            .from("ticket_invoices")
            .select("invoice_reference_number")
            .eq("ticket_id", ticket.id);

          if (existingInvoicesError) {
            results.errors.push(`Get ticket invoices ${ticket.id}: ${existingInvoicesError.message}`);
            continue;
          }

          const currentInvoiceRefs = (existingInvoices || []).map((ti) => ti.invoice_reference_number);
          const newInvoices = invoiceRefs.filter((ref) => !currentInvoiceRefs.includes(ref));

          if (newInvoices.length > 0) {
            // Insert new invoice references into ticket_invoices
            const { error: insertError } = await supabase
              .from("ticket_invoices")
              .insert(
                newInvoices.map((ref) => ({
                  ticket_id: ticket.id,
                  invoice_reference_number: ref,
                }))
              );

            if (insertError) {
              results.errors.push(`Add invoices to ticket ${ticket.id}: ${insertError.message}`);
            } else {
              results.tickets_updated++;
              results.invoices_added += newInvoices.length;
            }
          }
        } else {
          const { data: customer, error: customerError } = await supabase
            .from("acumatica_customers")
            .select("customer_name")
            .eq("customer_id", rule.customer_id)
            .maybeSingle();

          if (customerError) {
            results.errors.push(`Get customer ${rule.customer_id}: ${customerError.message}`);
            continue;
          }

          const { data: newTicket, error: createError } = await supabase
            .from("collection_tickets")
            .insert({
              customer_id: rule.customer_id,
              customer_name: customer?.customer_name || rule.customer_id,
              assigned_collector_id: rule.assigned_collector_id,
              status: "open",
              ticket_type: "overdue payment",
              active: true,
              created_by: rule.assigned_collector_id,
            })
            .select("id")
            .single();

          if (createError) {
            results.errors.push(`Create ticket for ${rule.customer_id}: ${createError.message}`);
            continue;
          }

          // Insert invoice references into ticket_invoices
          const { error: invoicesInsertError } = await supabase
            .from("ticket_invoices")
            .insert(
              invoiceRefs.map((ref) => ({
                ticket_id: newTicket.id,
                invoice_reference_number: ref,
                added_by: rule.assigned_collector_id,
              }))
            );

          if (invoicesInsertError) {
            results.errors.push(`Add invoices to new ticket ${newTicket.id}: ${invoicesInsertError.message}`);
          } else {
            results.tickets_created++;
            results.invoices_added += invoiceRefs.length;
          }
        }
      } catch (error) {
        results.errors.push(`Rule ${rule.id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Auto-ticket processing completed",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing auto-ticket rules:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
