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
      .select('id, reference_number, type, status, balance, date, customer, customer_name, amount, acumatica_id')
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
        const list = Array.isArray(invoices) ? invoices : [];

        if (list.length === 0) {
          notFound++;
          continue;
        }

        // Pick the canonical "current" invoice for this reference number.
        // Strategy: prefer the most recently created (highest CreatedDateTime).
        // This reliably picks the 2025 invoice over a 2020 collision.
        const sorted = [...list].sort((a, b) => {
          const da = new Date(a.CreatedDateTime?.value || 0).getTime();
          const db = new Date(b.CreatedDateTime?.value || 0).getTime();
          return db - da;
        });
        const correctInvoice = sorted[0];

        const newStatus = correctInvoice.Status?.value;
        const newBalance = parseFloat(correctInvoice.Balance?.value ?? '0');
        const newAmount = parseFloat(correctInvoice.Amount?.value ?? '0');
        const newAcumaticaId = correctInvoice.id;
        const newCustomer = correctInvoice.Customer?.value || correctInvoice.CustomerID?.value || inv.customer;
        const newDate = (correctInvoice.Date?.value || '').split('T')[0] || inv.date;

        const dbBalance = parseFloat(inv.balance ?? '0');
        const dbAmount = parseFloat(inv.amount ?? '0');
        const idMismatch = !!newAcumaticaId && newAcumaticaId !== inv.acumatica_id;
        const statusMismatch = newStatus && newStatus !== inv.status;
        const balanceMismatch = Math.abs(newBalance - dbBalance) > 0.01;
        const amountMismatch = Math.abs(newAmount - dbAmount) > 0.01;
        const customerMismatch = newCustomer && newCustomer !== inv.customer;
        const dateMismatch = newDate && newDate !== inv.date;

        const needsUpdate = idMismatch || statusMismatch || balanceMismatch || amountMismatch || customerMismatch || dateMismatch;

        if (needsUpdate) {
          await supabase
            .from('acumatica_invoices')
            .update({
              status: newStatus ?? inv.status,
              balance: newBalance,
              amount: newAmount,
              customer: newCustomer,
              customer_name: correctInvoice.CustomerName?.value || newCustomer,
              date: newDate,
              due_date: (correctInvoice.DueDate?.value || '').split('T')[0] || null,
              post_period: correctInvoice.PostPeriod?.value || null,
              description: correctInvoice.Description?.value || '',
              tax_total: parseFloat(correctInvoice.TaxTotal?.value ?? '0'),
              terms: correctInvoice.Terms?.value || null,
              customer_order: correctInvoice.CustomerOrder?.value || null,
              acumatica_id: newAcumaticaId,
              last_modified_datetime: correctInvoice.LastModifiedDateTime?.value,
              created_datetime: correctInvoice.CreatedDateTime?.value,
              last_sync_timestamp: new Date().toISOString(),
              synced_at: new Date().toISOString(),
              raw_data: correctInvoice,
            })
            .eq('id', inv.id);
          fixed++;
          fixes.push({
            ref: refNbr,
            collisionsFound: list.length,
            oldStatus: inv.status,
            newStatus,
            oldAmount: dbAmount,
            newAmount,
            oldBalance: dbBalance,
            newBalance,
            oldAcumaticaId: inv.acumatica_id,
            newAcumaticaId,
            mismatchReasons: {
              id: idMismatch,
              status: statusMismatch,
              balance: balanceMismatch,
              amount: amountMismatch,
              customer: customerMismatch,
              date: dateMismatch,
            },
          });
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
