import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { referenceNumbers } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!referenceNumbers || !Array.isArray(referenceNumbers) || referenceNumbers.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'referenceNumbers array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the DB records for these reference numbers
    const { data: affected, error: affError } = await supabase
      .from('acumatica_invoices')
      .select('id, reference_number, type, status, balance, date, customer, amount')
      .in('reference_number', referenceNumbers)
      .eq('type', 'Invoice');

    if (affError) throw new Error(`DB query failed: ${affError.message}`);
    if (!affected || affected.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No matching invoices found', totalRemaining: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials
    const { data: config } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!config) throw new Error('No Acumatica credentials configured');

    let acumaticaUrl = config.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || "",
      branch: config.branch || "",
    };

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    let fixed = 0;
    let alreadyCorrect = 0;
    let notFound = 0;
    const errors: string[] = [];
    const fixes: any[] = [];

    for (const inv of affected) {
      try {
        // Fetch this specific invoice from Acumatica
        const refNbr = inv.reference_number;
        const filter = `ReferenceNbr eq '${refNbr}'`;
        const url = `${acumaticaUrl}/entity/Default/23.200.001/Invoice?$filter=${filter}`;

        const response = await sessionManager.makeAuthenticatedRequest(credentials, url, {
          headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
          errors.push(`Failed to fetch ${refNbr}: ${response.status}`);
          continue;
        }

        const invoices = await response.json();

        // Find the correct 2024+ invoice (not the old 2020 one)
        const correctInvoice = (invoices || []).find((i: any) => {
          const created = i.CreatedDateTime?.value;
          if (!created) return false;
          return new Date(created).getFullYear() >= 2024;
        });

        if (!correctInvoice) {
          // All results are old invoices - the 2025 version might not exist in Acumatica
          // Or it could be under a different endpoint. Check if any match our date.
          const anyMatch = (invoices || []).find((i: any) => {
            const d = (i.Date?.value || '').split('T')[0];
            return d === inv.date;
          });

          if (anyMatch) {
            // Found by date match
            const newStatus = anyMatch.Status?.value;
            const newBalance = anyMatch.Balance?.value;
            if (newStatus !== inv.status || newBalance != inv.balance) {
              await supabase
                .from('acumatica_invoices')
                .update({
                  status: newStatus,
                  balance: newBalance,
                  amount: anyMatch.Amount?.value || inv.amount,
                  last_modified_datetime: anyMatch.LastModifiedDateTime?.value,
                  last_sync_timestamp: new Date().toISOString(),
                  created_datetime: anyMatch.CreatedDateTime?.value,
                  raw_data: anyMatch,
                })
                .eq('id', inv.id);
              fixed++;
              fixes.push({ ref: refNbr, oldStatus: 'Closed', newStatus, newBalance });
            } else {
              alreadyCorrect++;
            }
          } else {
            notFound++;
          }
          continue;
        }

        const newStatus = correctInvoice.Status?.value;
        const newBalance = correctInvoice.Balance?.value;

        if (newStatus !== inv.status || newBalance != inv.balance) {
          await supabase
            .from('acumatica_invoices')
            .update({
              status: newStatus,
              balance: newBalance,
              amount: correctInvoice.Amount?.value,
              customer: correctInvoice.Customer?.value || correctInvoice.CustomerID?.value || inv.customer,
              customer_name: correctInvoice.CustomerName?.value || correctInvoice.Customer?.value || inv.customer,
              date: (correctInvoice.Date?.value || '').split('T')[0] || inv.date,
              due_date: (correctInvoice.DueDate?.value || '').split('T')[0] || null,
              last_modified_datetime: correctInvoice.LastModifiedDateTime?.value,
              last_sync_timestamp: new Date().toISOString(),
              created_datetime: correctInvoice.CreatedDateTime?.value,
              raw_data: correctInvoice,
            })
            .eq('id', inv.id);
          fixed++;
          fixes.push({ ref: refNbr, oldStatus: 'Closed', newStatus, newBalance });
        } else {
          alreadyCorrect++;
        }
      } catch (e: any) {
        errors.push(`Error for ${inv.reference_number}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: affected.length,
        fixed,
        alreadyCorrect,
        notFound,
        errors,
        fixes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
