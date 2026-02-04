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
  min_days_old: number;
  max_days_old: number;
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

        const minDate = new Date(today);
        minDate.setDate(minDate.getDate() - rule.max_days_old);

        const maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() - rule.min_days_old);

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

        const invoiceRefs = invoices.map((inv: Invoice) => inv.reference_number);

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
              ticket_type: "auto",
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
