import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { dryRun = false, referenceNumbers = null, autoDetect = true } = body;

    let invoiceRefsToFetch: string[] = [];

    if (referenceNumbers && Array.isArray(referenceNumbers)) {
      invoiceRefsToFetch = referenceNumbers;
      console.log(`Manual mode: fetching ${invoiceRefsToFetch.length} specific invoices`);
    } else if (autoDetect) {
      console.log('Auto-detect mode: finding orphaned payment applications...');

      const { data: orphanedApps, error: queryError } = await supabase
        .rpc('execute_sql', {
          query: `
            SELECT DISTINCT pia.invoice_reference_number
            FROM payment_invoice_applications pia
            JOIN acumatica_invoices ai ON ai.reference_number = pia.invoice_reference_number
            WHERE pia.application_date >= '2025-01-01'
              AND ai.date < '2024-01-01'
              AND ai.status = 'Closed'
              AND ai.balance = 0
            ORDER BY pia.invoice_reference_number
          `
        });

      if (queryError) {
        console.log('RPC failed, using direct query...');

        const rawQuery = `
          SELECT DISTINCT pia.invoice_reference_number
          FROM payment_invoice_applications pia
          JOIN acumatica_invoices ai ON ai.reference_number = pia.invoice_reference_number
          WHERE pia.application_date >= '2025-01-01'
            AND ai.date < '2024-01-01'
            AND ai.status = 'Closed'
            AND ai.balance = 0
        `;

        const result = await supabase.rpc('query', { sql: rawQuery });
        invoiceRefsToFetch = (result.data || []).map((row: any) => row.invoice_reference_number);
      } else {
        invoiceRefsToFetch = (orphanedApps || []).map((row: any) => row.invoice_reference_number);
      }

      console.log(`Found ${invoiceRefsToFetch.length} potentially orphaned invoice references`);
    }

    if (invoiceRefsToFetch.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No orphaned invoices found',
          orphanedCount: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          orphanedInvoices: invoiceRefsToFetch,
          count: invoiceRefsToFetch.length,
          message: 'Dry run - no invoices fetched'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error(`No active credentials: ${credsError?.message}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const loginBody: any = {
      name: credentials.username,
      password: credentials.password,
    };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      throw new Error("Authentication failed");
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      throw new Error("No authentication cookies received");
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const results = {
      fetched: 0,
      replaced: 0,
      inserted: 0,
      skipped: 0,
      errors: [] as string[],
      invoiceDetails: [] as any[]
    };

    for (const refNbr of invoiceRefsToFetch) {
      try {
        const unpadded = refNbr.replace(/^0+/, '') || '0';
        const invoiceUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${unpadded}'&$select=Type,ReferenceNbr,Customer,CustomerOrder,Status,Date,DueDate,PostPeriod,Terms,Balance,Amount,Description,Hold,LocationID,TaxTotal,CreatedDateTime,LastModifiedDateTime`;

        const invoiceResponse = await fetch(invoiceUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookies,
          },
        });

        if (!invoiceResponse.ok) {
          results.errors.push(`HTTP ${invoiceResponse.status} for ${refNbr}`);
          continue;
        }

        const invoicesData = await invoiceResponse.json();
        const invoices = Array.isArray(invoicesData) ? invoicesData : [];

        if (invoices.length === 0) {
          results.errors.push(`Invoice ${refNbr} not found in Acumatica`);
          continue;
        }

        const newestInvoice = invoices.sort((a: any, b: any) => {
          const dateA = a.Date?.value ? new Date(a.Date.value).getTime() : 0;
          const dateB = b.Date?.value ? new Date(b.Date.value).getTime() : 0;
          return dateB - dateA;
        })[0];

        results.fetched++;

        const transformedInvoice: any = {
          raw_data: newestInvoice,
          synced_at: new Date().toISOString(),
        };

        if (newestInvoice.id) transformedInvoice.acumatica_id = newestInvoice.id;
        if (newestInvoice.rowNumber !== undefined) transformedInvoice.row_number = newestInvoice.rowNumber;

        const fieldMapping: any = {
          'Type': 'type',
          'ReferenceNbr': 'reference_number',
          'Customer': 'customer',
          'CustomerOrder': 'customer_order',
          'Status': 'status',
          'Date': 'date',
          'DueDate': 'due_date',
          'PostPeriod': 'post_period',
          'Terms': 'terms',
          'Balance': 'balance',
          'Amount': 'amount',
          'Description': 'description',
          'Hold': 'hold',
          'LocationID': 'location_id',
          'TaxTotal': 'tax_total',
          'CreatedDateTime': 'created_datetime',
          'LastModifiedDateTime': 'last_modified_datetime',
        };

        Object.keys(newestInvoice).forEach(key => {
          if (newestInvoice[key] && typeof newestInvoice[key] === 'object' && 'value' in newestInvoice[key]) {
            const value = newestInvoice[key].value;
            if (fieldMapping[key]) {
              const dbField = fieldMapping[key];
              if (key.toLowerCase().includes('date') && value && typeof value === 'string') {
                try {
                  transformedInvoice[dbField] = new Date(value).toISOString();
                } catch {
                  transformedInvoice[dbField] = value;
                }
              } else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
                transformedInvoice[dbField] = parseFloat(value);
              } else {
                transformedInvoice[dbField] = value;
              }
            }
          }
        });

        if (transformedInvoice.reference_number) {
          transformedInvoice.reference_number = transformedInvoice.reference_number.padStart(6, '0');
        }

        const paddedRefNbr = transformedInvoice.reference_number;
        if (!paddedRefNbr) {
          results.errors.push(`Missing reference number for invoice`);
          continue;
        }

        const { data: existing } = await supabase
          .from('acumatica_invoices')
          .select('id, date, status, balance')
          .eq('reference_number', paddedRefNbr)
          .maybeSingle();

        if (existing) {
          const existingDate = new Date(existing.date);
          const newDate = transformedInvoice.date ? new Date(transformedInvoice.date) : null;

          if (newDate && newDate > existingDate) {
            console.log(`Replacing old invoice ${paddedRefNbr} from ${existingDate.toISOString().split('T')[0]} with ${newDate.toISOString().split('T')[0]}`);

            await supabase
              .from('acumatica_invoices')
              .delete()
              .eq('id', existing.id);

            const { error: insertError } = await supabase
              .from('acumatica_invoices')
              .insert(transformedInvoice);

            if (insertError) {
              results.errors.push(`Insert error for ${paddedRefNbr}: ${insertError.message}`);
            } else {
              results.replaced++;
              results.invoiceDetails.push({
                reference_number: paddedRefNbr,
                old_date: existingDate.toISOString().split('T')[0],
                new_date: newDate.toISOString().split('T')[0],
                status: transformedInvoice.status,
                balance: transformedInvoice.balance,
                action: 'replaced'
              });
            }
          } else {
            results.skipped++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('acumatica_invoices')
            .insert(transformedInvoice);

          if (insertError) {
            results.errors.push(`Insert error for ${paddedRefNbr}: ${insertError.message}`);
          } else {
            results.inserted++;
            results.invoiceDetails.push({
              reference_number: paddedRefNbr,
              date: transformedInvoice.date?.split('T')[0],
              status: transformedInvoice.status,
              balance: transformedInvoice.balance,
              action: 'inserted'
            });
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        results.errors.push(`Error processing ${refNbr}: ${error.message}`);
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        totalOrphanedInvoices: invoiceRefsToFetch.length,
        fetched: results.fetched,
        replaced: results.replaced,
        inserted: results.inserted,
        skipped: results.skipped,
        invoiceDetails: results.invoiceDetails,
        errors: results.errors.length > 0 ? results.errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
