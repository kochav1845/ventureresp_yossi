import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function padRefNbr(refNbr: string): string {
  if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
    return refNbr.padStart(6, '0');
  }
  return refNbr;
}

async function updateProgress(supabase: any, jobId: string, progress: any) {
  await supabase
    .from('async_sync_jobs')
    .update({ progress })
    .eq('id', jobId);
}

async function fetchWithRetry(
  sessionManager: any,
  creds: any,
  url: string,
  retryUrls: string[] = []
): Promise<Response> {
  const response = await sessionManager.makeAuthenticatedRequest(creds, url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (response.ok) return response;

  for (const retryUrl of retryUrls) {
    const retryResponse = await sessionManager.makeAuthenticatedRequest(creds, retryUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (retryResponse.ok) return retryResponse;
  }

  return response;
}

function extractInvoiceRow(invoice: any): any {
  let refNbr = invoice.ReferenceNbr?.value;
  const type = invoice.Type?.value;
  if (!refNbr || !type) return null;

  refNbr = padRefNbr(refNbr);

  return {
    reference_number: refNbr,
    type,
    status: invoice.Status?.value || null,
    customer: invoice.CustomerID?.value || invoice.Customer?.value || null,
    customer_name: invoice.CustomerName?.value || invoice.Customer?.value || null,
    date: invoice.Date?.value || null,
    due_date: invoice.DueDate?.value || null,
    amount: invoice.Amount?.value || 0,
    balance: invoice.Balance?.value || 0,
    description: invoice.Description?.value || null,
    currency: invoice.CurrencyID?.value || null,
    last_modified_datetime: invoice.LastModifiedDateTime?.value || null,
    raw_data: invoice,
    last_sync_timestamp: new Date().toISOString(),
  };
}

async function processSync(supabase: any, jobId: string, startDate: string, endDate: string) {
  try {
    await supabase
      .from('async_sync_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', jobId);

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      throw new Error(`Missing Acumatica credentials: ${credsError?.message || 'none found'}`);
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const creds = {
      acumaticaUrl,
      username: credentials.username,
      password: credentials.password,
      company: credentials.company || '',
      branch: credentials.branch || '',
    };

    const dateFrom = `${startDate}T00:00:00`;
    const dateTo = `${endDate}T23:59:59`;
    const dateFilter = `Date ge datetimeoffset'${dateFrom}' and Date le datetimeoffset'${dateTo}'`;

    const API_V24 = 'entity/Default/24.200.001/Invoice';
    const API_V23 = 'entity/Default/23.200.001/Invoice';

    // Step 1: Get lightweight list of all invoice refs from Acumatica
    const listUrl = `${acumaticaUrl}/${API_V24}?$filter=${dateFilter}&$select=ReferenceNbr,Type`;
    console.log(`[invoice-sync] Fetching invoice list for ${startDate} to ${endDate}`);

    const listResponse = await sessionManager.makeAuthenticatedRequest(creds, listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      throw new Error(`Failed to fetch invoice list (${listResponse.status}): ${errorText.substring(0, 500)}`);
    }

    const listData = await listResponse.json();
    const acumaticaInvoices = Array.isArray(listData) ? listData : [];

    // Step 2: Check which of the Acumatica refs already exist in our DB
    // Also track dates to detect stale records that need updating
    const dbMap = new Map<string, string>(); // key: "type:ref", value: date
    const refNumbers = acumaticaInvoices.map((inv: any) => padRefNbr(inv.ReferenceNbr?.value || '')).filter(Boolean);
    const BATCH_QUERY_SIZE = 200;

    for (let i = 0; i < refNumbers.length; i += BATCH_QUERY_SIZE) {
      const batch = refNumbers.slice(i, i + BATCH_QUERY_SIZE);
      const { data: page, error: dbError } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type, date')
        .in('reference_number', batch);

      if (dbError) {
        throw new Error(`Failed to query DB invoices: ${dbError.message}`);
      }

      for (const inv of (page || [])) {
        dbMap.set(`${inv.type}:${inv.reference_number}`, inv.date || '');
      }
    }

    // Step 3: Find which invoices are missing from our DB OR have stale dates
    const missingInvoices: any[] = [];
    const staleDateInvoices: any[] = [];

    for (const inv of acumaticaInvoices) {
      const refNbr = padRefNbr(inv.ReferenceNbr?.value || '');
      const type = inv.Type?.value || '';
      if (!refNbr || !type) continue;

      const key = `${type}:${refNbr}`;
      if (!dbMap.has(key)) {
        missingInvoices.push(inv);
      } else {
        // Check if date differs
        const acumaticaDate = (inv.Date?.value || '').split('T')[0];
        const dbDate = dbMap.get(key) || '';
        if (acumaticaDate && dbDate && acumaticaDate !== dbDate) {
          staleDateInvoices.push(inv);
        }
      }
    }

    console.log(`[invoice-sync] Acumatica has ${acumaticaInvoices.length}, DB has ${dbMap.size}, missing: ${missingInvoices.length}, stale dates: ${staleDateInvoices.length}`);

    // Fix stale dates immediately (lightweight update, no full re-fetch needed)
    let staleDatesFixed = 0;
    for (const inv of staleDateInvoices) {
      const refNbr = padRefNbr(inv.ReferenceNbr?.value || '');
      const type = inv.Type?.value || '';
      const correctDate = (inv.Date?.value || '').split('T')[0];
      if (!refNbr || !type || !correctDate) continue;

      const { error } = await supabase
        .from('acumatica_invoices')
        .update({ date: correctDate })
        .eq('reference_number', refNbr)
        .eq('type', type);

      if (!error) staleDatesFixed++;
    }

    if (staleDatesFixed > 0) {
      console.log(`[invoice-sync] Fixed ${staleDatesFixed} stale dates`);
    }

    // Step 3b: Find orphaned invoices - in DB for this date range but NOT in Acumatica's response
    // These are invoices whose dates were changed in Acumatica
    const acumaticaRefSet = new Set(
      acumaticaInvoices.map((inv: any) => {
        const ref = padRefNbr(inv.ReferenceNbr?.value || '');
        const type = inv.Type?.value || '';
        return `${type}:${ref}`;
      })
    );

    // Fetch ALL DB invoices in range (paginate to overcome default 1000-row limit)
    let dbInvoicesInRange: { reference_number: string; type: string }[] = [];
    const PAGE_LIMIT = 1000;
    let rangeOffset = 0;
    let hasMoreRange = true;

    while (hasMoreRange) {
      const { data: page } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(rangeOffset, rangeOffset + PAGE_LIMIT - 1);

      const pageResults = page || [];
      dbInvoicesInRange = dbInvoicesInRange.concat(pageResults);
      if (pageResults.length < PAGE_LIMIT) {
        hasMoreRange = false;
      } else {
        rangeOffset += PAGE_LIMIT;
      }
    }

    console.log(`[invoice-sync] DB has ${dbInvoicesInRange.length} invoices in range ${startDate} to ${endDate}`);

    const orphanedInvoices = dbInvoicesInRange.filter(
      (inv) => !acumaticaRefSet.has(`${inv.type}:${inv.reference_number}`)
    );

    console.log(`[invoice-sync] Found ${orphanedInvoices.length} orphaned invoices in DB for this date range`);

    // Fix orphans by re-fetching from Acumatica to get correct date/status
    let orphansFixed = 0;
    if (orphanedInvoices.length > 0) {
      const orphanSelect = 'ReferenceNbr,Type,Status,Date,DueDate,Amount,Balance,Description,CurrencyID,LastModifiedDateTime,CustomerID,Customer';
      const ORPHAN_BATCH = 10;

      for (let i = 0; i < orphanedInvoices.length; i += ORPHAN_BATCH) {
        const batch = orphanedInvoices.slice(i, i + ORPHAN_BATCH);
        const refFilters = batch.map((inv) =>
          `(ReferenceNbr eq '${inv.reference_number}' and Type eq '${inv.type}')`
        );
        const batchFilter = refFilters.join(' or ');
        const batchUrl = `${acumaticaUrl}/${API_V24}?$filter=${batchFilter}&$select=${orphanSelect}`;

        try {
          const batchResponse = await sessionManager.makeAuthenticatedRequest(creds, batchUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });

          if (batchResponse.ok) {
            const batchData = await batchResponse.json();
            const invoices = Array.isArray(batchData) ? batchData : [];

            for (const invoice of invoices) {
              const row = extractInvoiceRow(invoice);
              if (!row) continue;

              const { error } = await supabase
                .from('acumatica_invoices')
                .upsert(row, { onConflict: 'reference_number,type' });

              if (!error) orphansFixed++;
            }

            // Invoices not returned by Acumatica at all may have been deleted
            const returnedSet = new Set(
              invoices.map((inv: any) => `${inv.Type?.value}:${padRefNbr(inv.ReferenceNbr?.value || '')}`)
            );
            for (const orphan of batch) {
              if (!returnedSet.has(`${orphan.type}:${orphan.reference_number}`)) {
                // Invoice doesn't exist in Acumatica anymore - mark as Canceled
                await supabase
                  .from('acumatica_invoices')
                  .update({ status: 'Canceled' })
                  .eq('reference_number', orphan.reference_number)
                  .eq('type', orphan.type);
                orphansFixed++;
              }
            }
          }
        } catch (e: any) {
          console.warn(`[invoice-sync] Orphan batch failed: ${e.message}`);
        }
      }

      console.log(`[invoice-sync] Fixed ${orphansFixed} orphaned invoices`);
    }

    if (missingInvoices.length === 0) {
      await supabase
        .from('async_sync_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: { created: 0, updated: 0, total: 0, skipped: acumaticaInvoices.length, staleDatesFixed, orphansFixed, errors: [] },
        })
        .eq('id', jobId);

      console.log('[invoice-sync] No missing invoices, nothing to sync');
      return;
    }

    await updateProgress(supabase, jobId, { created: 0, updated: 0, total: missingInvoices.length, errors: [] });

    // Step 4: Fetch full details for missing invoices
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const missingSet = new Set(missingInvoices.map((inv: any) => {
      const refNbr = padRefNbr(inv.ReferenceNbr?.value || '');
      const type = inv.Type?.value || '';
      return `${type}:${refNbr}`;
    }));

    // Try fetching one invoice first to detect which API version / fields work
    const safeSelect = 'ReferenceNbr,Type,Status,Date,DueDate,Amount,Balance,Description,CurrencyID,LastModifiedDateTime';
    const fullSelect = `${safeSelect},CustomerID,Customer`;

    let workingApiPath = API_V24;
    let workingSelect = fullSelect;

    // Probe with a single invoice to find working combination
    const probeRef = missingInvoices[0].ReferenceNbr?.value;
    const probeType = missingInvoices[0].Type?.value;
    if (probeRef && probeType) {
      const probeFilter = `ReferenceNbr eq '${probeRef}' and Type eq '${probeType}'`;
      const combos = [
        { api: API_V24, select: fullSelect, label: 'v24+full' },
        { api: API_V24, select: safeSelect, label: 'v24+safe' },
        { api: API_V24, select: '', label: 'v24+noselect' },
        { api: API_V23, select: fullSelect, label: 'v23+full' },
        { api: API_V23, select: safeSelect, label: 'v23+safe' },
        { api: API_V23, select: '', label: 'v23+noselect' },
      ];

      for (const combo of combos) {
        const selectParam = combo.select ? `&$select=${combo.select}` : '';
        const probeUrl = `${acumaticaUrl}/${combo.api}?$filter=${probeFilter}${selectParam}`;
        console.log(`[invoice-sync] Probing ${combo.label}...`);

        try {
          const probeResponse = await sessionManager.makeAuthenticatedRequest(creds, probeUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });

          if (probeResponse.ok) {
            const probeData = await probeResponse.json();
            if (Array.isArray(probeData) && probeData.length > 0) {
              workingApiPath = combo.api;
              workingSelect = combo.select;
              console.log(`[invoice-sync] Probe succeeded with ${combo.label}`);
              break;
            }
          } else {
            const errText = await probeResponse.text();
            console.log(`[invoice-sync] Probe ${combo.label} failed (${probeResponse.status}): ${errText.substring(0, 100)}`);
          }
        } catch (e: any) {
          console.log(`[invoice-sync] Probe ${combo.label} error: ${e.message}`);
        }
      }
    }

    const selectParam = workingSelect ? `&$select=${workingSelect}` : '';
    console.log(`[invoice-sync] Using API: ${workingApiPath}, select: ${workingSelect || '(all fields)'}`);

    const USE_DATE_RANGE_THRESHOLD = 100;

    if (missingInvoices.length > USE_DATE_RANGE_THRESHOLD) {
      console.log(`[invoice-sync] ${missingInvoices.length} missing invoices, using paginated date range fetch`);
      const PAGE_SIZE_API = 100;
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const pageUrl = `${acumaticaUrl}/${workingApiPath}?$filter=${dateFilter}${selectParam}&$top=${PAGE_SIZE_API}&$skip=${skip}`;
        console.log(`[invoice-sync] Fetching page at skip=${skip}`);

        const pageResponse = await sessionManager.makeAuthenticatedRequest(creds, pageUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!pageResponse.ok) {
          const errorText = await pageResponse.text();
          errors.push(`Page fetch failed at skip=${skip} (${pageResponse.status}): ${errorText.substring(0, 200)}`);
          break;
        }

        const pageData = await pageResponse.json();
        const invoices = Array.isArray(pageData) ? pageData : [];

        for (const invoice of invoices) {
          try {
            const row = extractInvoiceRow(invoice);
            if (!row) continue;
            if (!missingSet.has(`${row.type}:${row.reference_number}`)) continue;

            const { error } = await supabase
              .from('acumatica_invoices')
              .upsert(row, {
                onConflict: 'reference_number,type',
                count: 'exact',
              });

            if (error) {
              errors.push(`Upsert ${row.type} ${row.reference_number}: ${error.message}`);
            } else {
              created++;
            }
          } catch (error: any) {
            errors.push(`Error ${invoice.ReferenceNbr?.value}: ${error.message}`);
          }
        }

        await updateProgress(supabase, jobId, {
          created,
          updated,
          total: missingInvoices.length,
          processed: created + updated + errors.length,
          errors: errors.slice(0, 10),
        });

        if (invoices.length < PAGE_SIZE_API) {
          hasMore = false;
        } else {
          skip += PAGE_SIZE_API;
        }
      }
    } else {
      const BATCH_SIZE = 10;

      for (let batchStart = 0; batchStart < missingInvoices.length; batchStart += BATCH_SIZE) {
        const batch = missingInvoices.slice(batchStart, batchStart + BATCH_SIZE);

        const refFilters = batch.map((inv: any) => {
          const refNbr = inv.ReferenceNbr?.value;
          const type = inv.Type?.value;
          return `(ReferenceNbr eq '${refNbr}' and Type eq '${type}')`;
        });

        const batchFilter = refFilters.join(' or ');
        const batchUrl = `${acumaticaUrl}/${workingApiPath}?$filter=${batchFilter}${selectParam}`;

        console.log(`[invoice-sync] Fetching batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (${batch.length} invoices)`);

        const batchResponse = await sessionManager.makeAuthenticatedRequest(creds, batchUrl, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!batchResponse.ok) {
          const errorText = await batchResponse.text();
          errors.push(`Batch fetch failed (${batchResponse.status}): ${errorText.substring(0, 200)}`);
          continue;
        }

        const batchData = await batchResponse.json();
        const invoices = Array.isArray(batchData) ? batchData : [];

        for (const invoice of invoices) {
          try {
            const row = extractInvoiceRow(invoice);
            if (!row) continue;

            const { error } = await supabase
              .from('acumatica_invoices')
              .upsert(row, {
                onConflict: 'reference_number,type',
                count: 'exact',
              });

            if (error) {
              errors.push(`Upsert ${row.type} ${row.reference_number}: ${error.message}`);
            } else {
              created++;
            }
          } catch (error: any) {
            errors.push(`Error ${invoice.ReferenceNbr?.value}: ${error.message}`);
          }
        }

        await updateProgress(supabase, jobId, {
          created,
          updated,
          total: missingInvoices.length,
          processed: created + updated + errors.length,
          errors: errors.slice(0, 10),
        });
      }
    }

    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          created,
          updated,
          total: missingInvoices.length,
          skipped: acumaticaInvoices.length - missingInvoices.length,
          errors: errors.slice(0, 10),
          apiVersion: workingApiPath,
          selectFields: workingSelect || '(all)',
        },
      })
      .eq('id', jobId);

    try {
      await supabase.rpc('refresh_invoice_month_summary');
    } catch (refreshErr: any) {
      console.warn('[invoice-sync] Matview refresh failed:', refreshErr.message);
    }

    console.log(`[invoice-sync] Completed: ${created} created, ${updated} updated, ${errors.length} errors (skipped ${acumaticaInvoices.length - missingInvoices.length} existing)`);
  } catch (error: any) {
    console.error(`[invoice-sync] Job ${jobId} failed:`, error.message);
    await supabase
      .from('async_sync_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || '';
      const isInternalCall = token === supabaseKey || token === anonKey;
      if (!isInternalCall) {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        userId = user.id;
      }
    }

    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Start date and end date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from('async_sync_jobs')
      .insert({
        entity_type: 'invoice',
        start_date: startDate,
        end_date: endDate,
        status: 'pending',
        created_by: userId,
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create sync job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    EdgeRuntime.waitUntil(processSync(supabase, job.id, startDate, endDate));

    return new Response(
      JSON.stringify({ success: true, async: true, jobId: job.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[invoice-sync] Fatal error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
