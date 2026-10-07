import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function fetchAndUpsertMissingInvoice(
  supabase: any,
  sessionManager: AcumaticaSessionManager,
  credentials: any,
  invoiceRefNbr: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    console.log(`[FETCH-MISSING-INVOICE] Fetching invoice ${invoiceRefNbr} from Acumatica...`);

    const invoiceUrl = `${credentials.acumaticaUrl}/entity/Default/24.200.001/Invoice/${invoiceRefNbr}`;
    const response = await sessionManager.makeAuthenticatedRequest(credentials, invoiceUrl);

    if (!response.ok) {
      if (response.status === 404 || response.status === 500) {
        console.log(`[FETCH-MISSING-INVOICE] Invoice ${invoiceRefNbr} not found in Acumatica (may be deleted or credit memo)`);
        return { success: false, error: 'Invoice not found in Acumatica' };
      }
      throw new Error(`Failed to fetch invoice: ${response.status}`);
    }

    const invoice = await response.json();
    console.log(`[FETCH-MISSING-INVOICE] Successfully fetched invoice ${invoiceRefNbr} from Acumatica`);

    const invoiceData = {
      type: invoice.Type?.value || 'Invoice',
      reference_number: invoice.ReferenceNbr?.value,
      customer_id: invoice.CustomerID?.value,
      customer_name: invoice.Customer?.value,
      status: invoice.Status?.value,
      date: invoice.Date?.value,
      due_date: invoice.DueDate?.value,
      invoice_amount: parseFloat(invoice.Amount?.value || 0),
      balance: parseFloat(invoice.Balance?.value || 0),
      description: invoice.Description?.value || null,
      customer_order: invoice.CustomerOrder?.value || null,
      terms: invoice.Terms?.value || null,
      location_id: invoice.LocationID?.value || null,
      currency: invoice.CurrencyID?.value || null,
      post_period: invoice.PostPeriod?.value || null,
      last_modified_date_time: invoice.LastModifiedDateTime?.value || new Date().toISOString(),
      created_date_time: invoice.CreatedDateTime?.value || null,
      last_sync_timestamp: new Date().toISOString(),
    };

    const { data: upsertedInvoice, error: upsertError } = await supabase
      .from('acumatica_invoices')
      .upsert(invoiceData, {
        onConflict: 'reference_number',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (upsertError) {
      console.error(`[FETCH-MISSING-INVOICE] Failed to upsert invoice ${invoiceRefNbr}:`, upsertError.message);
      return { success: false, error: upsertError.message };
    }

    console.log(`[FETCH-MISSING-INVOICE] ✓ Successfully upserted invoice ${invoiceRefNbr} into database`);
    return { success: true, invoiceId: upsertedInvoice.id };
  } catch (error: any) {
    console.error(`[FETCH-MISSING-INVOICE] Error fetching invoice ${invoiceRefNbr}:`, error.message);
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const fnStart = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize session manager
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const requestBody = await req.json().catch(() => ({}));
    const {
      lookbackMinutes: lookbackFromRequest,
      acumaticaUrl: urlFromRequest,
      username: usernameFromRequest,
      password: passwordFromRequest,
      company: companyFromRequest,
      branch: branchFromRequest
    } = requestBody;

    let acumaticaUrl = urlFromRequest;
    let username = usernameFromRequest;
    let password = passwordFromRequest;
    let company = companyFromRequest || "";
    let branch = branchFromRequest || "";
    let lookbackMinutes = lookbackFromRequest;

    // Load sync configuration from database if not provided
    if (!acumaticaUrl || !username || !password || !lookbackMinutes) {
      console.log('Loading configuration from database...');

      const { data: config, error: configError } = await supabase
        .from('acumatica_sync_credentials')
        .select('*')
        .limit(1)
        .maybeSingle();

      const { data: syncConfig, error: syncError } = await supabase
        .from('sync_status')
        .select('lookback_minutes')
        .eq('entity_type', 'payment')
        .maybeSingle();

      if (configError) {
        console.error('Error loading credentials from database:', configError);
      }

      if (syncError) {
        console.error('Error loading sync config from database:', syncError);
      }

      if (config) {
        acumaticaUrl = acumaticaUrl || config.acumatica_url;
        username = username || config.username;
        password = password || config.password;
        company = company || config.company || "";
        branch = branch || config.branch || "";
        console.log('Loaded credentials from database');
      }

      if (syncConfig) {
        lookbackMinutes = lookbackMinutes || syncConfig.lookback_minutes || 10000;
        console.log(`Loaded lookback from database: ${lookbackMinutes} minutes`);
      }
    }

    // Ensure lookback has a sensible default if still not set
    if (!lookbackMinutes) {
      lookbackMinutes = 10000;
      console.log('Using default lookback: 10000 minutes');
    }

    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials. Please configure sync settings first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = {
      acumaticaUrl,
      username,
      password,
      company,
      branch
    };

    // Get session cookie using session manager
    console.log('Getting Acumatica session...');
    const sessionCookie = await sessionManager.getSession(credentials);
    console.log('Session obtained successfully');

    const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const filterDate = cutoffTime.toISOString().split('.')[0];

    const baseFilter = `LastModifiedDateTime gt datetimeoffset'${filterDate}'`;
    console.log(`Fetching payments modified after ${filterDate} (last ${lookbackMinutes} minutes)`);

    // Paginate with $top/$skip so large lookback windows (e.g. multi-day catch-up)
    // don't overrun a single un-paginated request.
    const PAGE_SIZE = 100;
    let payments: any[] = [];
    let skip = 0;

    while (true) {
      const pageUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$expand=files&$filter=${baseFilter}&$custom=Document.DocDate,Document.FinPeriodID&$top=${PAGE_SIZE}&$skip=${skip}`;

      const pageResponse = await fetch(pageUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Cookie": sessionCookie,
        },
      });

      if (!pageResponse.ok) {
        const errorText = await pageResponse.text();
        throw new Error(`Failed to fetch payments (skip=${skip}): ${pageResponse.status} ${pageResponse.statusText}. Details: ${errorText.substring(0, 500)}`);
      }

      const responseText = await pageResponse.text();
      if (responseText.trim().startsWith('<')) {
        throw new Error(`Received HTML response instead of JSON at skip=${skip}. This usually indicates an Acumatica error or session timeout.`);
      }

      let page;
      try {
        page = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Failed to parse payment response at skip=${skip}: ${parseError.message}`);
      }

      const batch = Array.isArray(page) ? page : [];
      payments = payments.concat(batch);
      console.log(`Fetched page skip=${skip}: ${batch.length} payments (running total ${payments.length})`);

      if (batch.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    let created = 0;
    let updated = 0;
    let applicationsSynced = 0;
    let filesSynced = 0;
    const errors: string[] = [];

    console.log(`Processing ${payments.length} payments...`);

    // --- Map + de-duplicate --------------------------------------------------
    // The 24h window returns ~100-300 payments per run, but only a handful
    // actually changed since the previous 5-min run. The old loop processed
    // EVERY one sequentially, including a ~2s Acumatica ApplicationHistory GET
    // per payment, so a busy window ran past the 150s wall clock (504
    // IDLE_TIMEOUT) and took acumatica-master-sync down with it.
    // Now: map once, bulk-load stored rows + attachment keys, skip payments
    // whose LastModifiedDateTime/status/amount/balance are unchanged (and that
    // have no missing attachment / Voided Payment record), and process the rest
    // with bounded concurrency under a per-run cap + time budget.
    const syncStamp = new Date().toISOString();
    const keyOf = (ref: string, type: string) => `${ref}\u0001${type}`;
    const toMs = (v: unknown) => {
      if (v === null || v === undefined || v === '') return NaN;
      return new Date(v as string).getTime();
    };
    const sameNum = (a: unknown, b: unknown) =>
      (a === null || a === undefined) && (b === null || b === undefined)
        ? true
        : Number(a) === Number(b);

    const mappedByKey = new Map<string, { payment: any; refNbr: string; type: string; paymentData: any }>();

    for (const payment of payments) {
      let refNbr = payment.ReferenceNbr?.value;
      const type = payment.Type?.value;

      if (!refNbr || !type) {
        continue;
      }

      if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) {
        refNbr = refNbr.padStart(6, '0');
      }

      const customDoc = payment.custom?.Document;
      const paymentData: any = {
        reference_number: refNbr,
        type: type,
        status: payment.Status?.value || null,
        hold: payment.Hold?.value || false,
        application_date: payment.ApplicationDate?.value || payment.PaymentDate?.value || null,
        doc_date: customDoc?.DocDate?.value || null,
        financial_period: customDoc?.FinPeriodID?.value || null,
        payment_amount: payment.PaymentAmount?.value || 0,
        available_balance: payment.UnappliedBalance?.value || 0,
        customer_id: payment.CustomerID?.value || null,
        customer_name: payment.CustomerName?.value || null,
        payment_method: payment.PaymentMethod?.value || null,
        cash_account: payment.CashAccount?.value || null,
        payment_ref: payment.PaymentRef?.value || null,
        description: payment.Description?.value || null,
        currency_id: payment.CurrencyID?.value || null,
        last_modified_datetime: payment.LastModifiedDateTime?.value || null,
        raw_data: payment,
        last_sync_timestamp: syncStamp
      };

      // $skip paging over a live result set can return the same payment twice;
      // keep the most recently modified copy.
      const k = keyOf(refNbr, type);
      const prev = mappedByKey.get(k);
      if (!prev || !(toMs(prev.paymentData.last_modified_datetime) > toMs(paymentData.last_modified_datetime))) {
        mappedByKey.set(k, { payment, refNbr, type, paymentData });
      }
    }

    // --- Bulk-load what we already have --------------------------------------
    const allRefs = [...new Set([...mappedByKey.values()].map((m) => m.refNbr))];
    const LOOKUP_CHUNK = 150;
    const existingByKey = new Map<string, any>();
    for (let i = 0; i < allRefs.length; i += LOOKUP_CHUNK) {
      const chunk = allRefs.slice(i, i + LOOKUP_CHUNK);
      const { data: rows, error: lookupError } = await supabase
        .from('acumatica_payments')
        .select('id, reference_number, type, status, payment_amount, available_balance, last_modified_datetime')
        .in('reference_number', chunk);
      if (lookupError) {
        throw new Error(`Failed to load existing payments: ${lookupError.message}`);
      }
      for (const row of rows || []) existingByKey.set(keyOf(row.reference_number, row.type), row);
    }

    // Attachments we already stored (payment_reference_number + file_id). A file
    // with a payment_attachments row is NEVER downloaded/uploaded again.
    const fileKey = (ref: string, fileId: string) => `${ref}\u0001${fileId}`;
    const existingFiles = new Set<string>();
    const refsWithFiles = [...new Set([...mappedByKey.values()]
      .filter((m) => Array.isArray(m.payment.files) && m.payment.files.length > 0)
      .map((m) => m.refNbr))];
    const FILE_LOOKUP_CHUNK = 50;
    for (let i = 0; i < refsWithFiles.length; i += FILE_LOOKUP_CHUNK) {
      const chunk = refsWithFiles.slice(i, i + FILE_LOOKUP_CHUNK);
      const { data: rows, error: attError } = await supabase
        .from('payment_attachments')
        .select('payment_reference_number, file_id')
        .in('payment_reference_number', chunk)
        .limit(5000);
      if (attError) {
        throw new Error(`Failed to load existing payment attachments: ${attError.message}`);
      }
      for (const row of rows || []) existingFiles.add(fileKey(row.payment_reference_number, row.file_id));
    }

    const fileInfo = (file: any) => ({
      fileId: file.id?.value || file.id,
      fileName: file.filename?.value || file.filename || file.name?.value || file.name,
    });
    const hasMissingFile = (m: { payment: any; refNbr: string }) =>
      Array.isArray(m.payment.files) && m.payment.files.some((f: any) => {
        const { fileId, fileName } = fileInfo(f);
        return fileId && fileName && !existingFiles.has(fileKey(m.refNbr, fileId));
      });
    const voidedRecordKnown = (refNbr: string) =>
      existingByKey.has(keyOf(refNbr, 'Voided Payment')) || mappedByKey.has(keyOf(refNbr, 'Voided Payment'));

    type WorkItem = { payment: any; refNbr: string; type: string; paymentData: any; existing: any; changed: boolean };
    const work: WorkItem[] = [];
    let unchanged = 0;
    for (const [k, m] of mappedByKey) {
      const existing = existingByKey.get(k) || null;
      const changed = !(
        existing &&
        m.paymentData.last_modified_datetime !== null &&
        toMs(existing.last_modified_datetime) === toMs(m.paymentData.last_modified_datetime) &&
        existing.status === m.paymentData.status &&
        sameNum(existing.payment_amount, m.paymentData.payment_amount) &&
        sameNum(existing.available_balance, m.paymentData.available_balance)
      );
      const needsVoided = m.paymentData.status === 'Voided' && m.type === 'Payment' && !voidedRecordKnown(m.refNbr);
      if (!changed && !needsVoided && !hasMissingFile(m)) {
        unchanged++;
        continue;
      }
      work.push({ ...m, existing, changed });
    }

    // Oldest modification first, so a capped run makes ordered progress.
    work.sort((a, b) =>
      (toMs(a.paymentData.last_modified_datetime) || 0) - (toMs(b.paymentData.last_modified_datetime) || 0));

    // Per-run cap + time budget (wall-clock safety: each changed payment costs an
    // Acumatica round-trip of ~2s, and acumatica-master-sync must get its answer
    // well inside its own 150s limit). Anything left over is picked up by the next
    // cron run: we report success:false so the master does NOT advance
    // last_successful_sync, the window still covers the remainder, and payments
    // already written are skipped by the unchanged-check above.
    const MAX_ITEMS_PER_RUN = 150;
    const WORK_CONCURRENCY = 4;
    const START_BUDGET_MS = 70_000;
    const toProcess = work.slice(0, MAX_ITEMS_PER_RUN);
    console.log(`Diff: ${mappedByKey.size} unique fetched, ${unchanged} unchanged, ${work.length} to process (${work.filter((w) => w.changed).length} changed)`);

    const processOne = async ({ payment, refNbr, type, paymentData, existing, changed }: WorkItem) => {
        try {
          let paymentDbId: number | null = null;

          if (!changed) {
            // Unchanged payment: only here for a missing attachment and/or a
            // missing "Voided Payment" record (handled below).
          } else if (existing) {
            const oldStatus = existing.status;
            const { error } = await supabase
              .from('acumatica_payments')
              .update(paymentData)
              .eq('reference_number', refNbr)
              .eq('type', type);

            if (error) {
              errors.push(`Update failed for ${refNbr}: ${error.message}`);
            } else {
              updated++;
              paymentDbId = existing.id;
              let actionType = 'updated';
              let changeSummary = `Payment ${refNbr} was updated`;

              if (oldStatus !== paymentData.status) {
                actionType = 'status_changed';
                changeSummary = `Payment ${refNbr} status changed from ${oldStatus} to ${paymentData.status}`;
              }

              await supabase.rpc('log_sync_change', {
                p_sync_type: 'payment',
                p_action_type: actionType,
                p_entity_id: existing.id,
                p_entity_reference: refNbr,
                p_entity_name: `Payment ${refNbr} - $${paymentData.payment_amount || 0}`,
                p_change_summary: changeSummary,
                p_change_details: {
                  old_status: oldStatus,
                  new_status: paymentData.status,
                  payment_amount: paymentData.payment_amount,
                  available_balance: paymentData.available_balance
                },
                p_sync_source: 'scheduled_sync'
              });
            }
          } else {
            const { data: inserted, error } = await supabase
              .from('acumatica_payments')
              .insert(paymentData)
              .select('id')
              .single();

            if (error) {
              errors.push(`Insert failed for ${refNbr}: ${error.message}`);
            } else {
              created++;
              if (inserted) {
                paymentDbId = inserted.id;
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment',
                  p_action_type: 'created',
                  p_entity_id: inserted.id,
                  p_entity_reference: refNbr,
                  p_entity_name: `Payment ${refNbr} - $${paymentData.payment_amount || 0}`,
                  p_change_summary: `New payment ${refNbr} was created`,
                  p_change_details: {
                    status: paymentData.status,
                    payment_amount: paymentData.payment_amount,
                    available_balance: paymentData.available_balance
                  },
                  p_sync_source: 'scheduled_sync'
                });
              }
            }
          }

          // If the payment status is "Voided", automatically fetch the "Voided Payment" record
          if (paymentData.status === 'Voided' && type === 'Payment') {
            console.log(`[VOIDED-PAYMENT] Payment ${refNbr} is voided, checking for "Voided Payment" record...`);

            // Bulk-loaded above; also true when this run's batch itself carries the
            // "Voided Payment" document (it is written by its own work item).
            const voidedExists = voidedRecordKnown(refNbr);

            if (!voidedExists) {
              console.log(`[VOIDED-PAYMENT] "Voided Payment" record not found for ${refNbr}, fetching from Acumatica...`);

              try {
                const voidedPaymentUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/Voided Payment/${encodeURIComponent(refNbr)}?$expand=ApplicationHistory,files`;
                const voidedResponse = await sessionManager.makeAuthenticatedRequest(credentials, voidedPaymentUrl);

                if (voidedResponse.ok) {
                  const voidedPayment = await voidedResponse.json();
                  console.log(`[VOIDED-PAYMENT] ✓ Found "Voided Payment" record for ${refNbr} in Acumatica`);

                  const voidedPaymentData: any = {
                    reference_number: refNbr,
                    type: 'Voided Payment',
                    status: voidedPayment.Status?.value || null,
                    hold: voidedPayment.Hold?.value || false,
                    application_date: voidedPayment.ApplicationDate?.value || voidedPayment.PaymentDate?.value || null,
                    payment_amount: voidedPayment.PaymentAmount?.value || 0,
                    available_balance: voidedPayment.UnappliedBalance?.value || 0,
                    customer_id: voidedPayment.CustomerID?.value || null,
                    customer_name: voidedPayment.CustomerName?.value || null,
                    payment_method: voidedPayment.PaymentMethod?.value || null,
                    cash_account: voidedPayment.CashAccount?.value || null,
                    payment_ref: voidedPayment.PaymentRef?.value || null,
                    description: voidedPayment.Description?.value || null,
                    currency_id: voidedPayment.CurrencyID?.value || null,
                    last_modified_datetime: voidedPayment.LastModifiedDateTime?.value || null,
                    raw_data: voidedPayment,
                    last_sync_timestamp: new Date().toISOString()
                  };

                  const { data: insertedVoided, error: voidedError } = await supabase
                    .from('acumatica_payments')
                    .insert(voidedPaymentData)
                    .select('id')
                    .single();

                  if (voidedError) {
                    console.error(`[VOIDED-PAYMENT] ✗ Failed to insert "Voided Payment" ${refNbr}:`, voidedError.message);
                    errors.push(`Failed to insert Voided Payment ${refNbr}: ${voidedError.message}`);
                  } else {
                    console.log(`[VOIDED-PAYMENT] ✓ Successfully inserted "Voided Payment" record for ${refNbr}`);
                    created++;

                    await supabase.rpc('log_sync_change', {
                      p_sync_type: 'payment',
                      p_action_type: 'created',
                      p_entity_id: insertedVoided.id,
                      p_entity_reference: refNbr,
                      p_entity_name: `Payment ${refNbr} - $${voidedPaymentData.payment_amount || 0}`,
                      p_change_summary: `New "Voided Payment" ${refNbr} was created (auto-fetched due to voided status)`,
                      p_change_details: {
                        status: voidedPaymentData.status,
                        payment_amount: voidedPaymentData.payment_amount,
                        available_balance: voidedPaymentData.available_balance,
                        triggered_by: 'voided_status_detected'
                      },
                      p_sync_source: 'scheduled_sync'
                    });
                  }
                } else {
                  console.log(`[VOIDED-PAYMENT] ⚠ "Voided Payment" record not found in Acumatica for ${refNbr} (${voidedResponse.status})`);
                }
              } catch (voidedError: any) {
                console.error(`[VOIDED-PAYMENT] Error fetching "Voided Payment" for ${refNbr}:`, voidedError.message);
                errors.push(`Failed to fetch Voided Payment ${refNbr}: ${voidedError.message}`);
              }
            } else {
              console.log(`[VOIDED-PAYMENT] ✓ "Voided Payment" record already exists for ${refNbr}`);
            }
          }

          let applicationHistory: any[] = [];
          if (paymentDbId) {
            try {
              const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(refNbr)}?$expand=ApplicationHistory`;
              console.log(`[APP-HISTORY] Fetching ApplicationHistory for ${type} ${refNbr} via direct endpoint`);

              const detailResponse = await sessionManager.makeAuthenticatedRequest(credentials, directUrl);

              if (detailResponse.ok) {
                const detailData = await detailResponse.json();

                if (detailData.ApplicationHistory && Array.isArray(detailData.ApplicationHistory)) {
                  applicationHistory = detailData.ApplicationHistory;
                  console.log(`[APP-HISTORY] Found ${applicationHistory.length} applications for ${refNbr} via direct endpoint`);
                } else if (Array.isArray(detailData) && detailData.length > 0 && detailData[0].ApplicationHistory) {
                  applicationHistory = detailData[0].ApplicationHistory;
                  console.log(`[APP-HISTORY] Found ${applicationHistory.length} applications for ${refNbr} via array response`);
                } else {
                  console.log(`[APP-HISTORY] No ApplicationHistory found for ${refNbr}. Response keys: ${Object.keys(detailData || {}).join(', ')}`);
                }
              } else {
                console.error(`[APP-HISTORY] Failed to fetch for ${refNbr}: ${detailResponse.status} ${detailResponse.statusText}`);

                const filterUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$expand=ApplicationHistory&$filter=ReferenceNbr eq '${refNbr}' and Type eq '${type}'`;
                console.log(`[APP-HISTORY] Trying filter-based fallback for ${refNbr}`);

                const fallbackResponse = await sessionManager.makeAuthenticatedRequest(credentials, filterUrl);

                if (fallbackResponse.ok) {
                  const fallbackData = await fallbackResponse.json();
                  if (Array.isArray(fallbackData) && fallbackData.length > 0 && fallbackData[0].ApplicationHistory) {
                    applicationHistory = fallbackData[0].ApplicationHistory;
                    console.log(`[APP-HISTORY] Found ${applicationHistory.length} applications via fallback for ${refNbr}`);
                  }
                }
              }
            } catch (historyError: any) {
              console.error(`[APP-HISTORY] Error fetching ApplicationHistory for ${refNbr}:`, historyError.message);
            }
          }

          if (paymentDbId && applicationHistory.length > 0) {
            const applications = applicationHistory;

            console.log(`Processing ${applications.length} applications for payment ${refNbr}`);

            for (const app of applications) {
              let invoiceRefNbr = app.DisplayRefNbr?.value || app.ReferenceNbr?.value || app.AdjustedRefNbr?.value;
              const amountPaid = app.AmountPaid?.value;
              const appDate = app.ApplicationDate?.value || app.Date?.value;
              const docType = app.DisplayDocType?.value || app.DocType?.value || app.AdjustedDocType?.value || 'Invoice';

              if (!invoiceRefNbr) {
                console.warn(`[PAYMENT-SYNC] Skipping application with no reference number for payment ${refNbr}`);
                continue;
              }

              const originalInvoiceRef = invoiceRefNbr;
              let wasPadded = false;
              if (/^[0-9]+$/.test(invoiceRefNbr) && invoiceRefNbr.length < 6) {
                invoiceRefNbr = invoiceRefNbr.padStart(6, '0');
                wasPadded = true;
                console.log(`[PAYMENT-SYNC] Normalized invoice ref: ${originalInvoiceRef} -> ${invoiceRefNbr}`);
              }

              const { data: invoiceExists } = await supabase
                .from('acumatica_invoices')
                .select('id, reference_number, customer')
                .eq('reference_number', invoiceRefNbr)
                .maybeSingle();

              // Skip if reference was padded and invoice belongs to a different customer (reference number collision)
              if (wasPadded && invoiceExists && invoiceExists.customer && paymentData.customer_id && invoiceExists.customer !== paymentData.customer_id) {
                console.warn(`[PAYMENT-SYNC] Skipping collision: payment ${refNbr} (customer ${paymentData.customer_id}) -> invoice ${invoiceRefNbr} (customer ${invoiceExists.customer})`);
                continue;
              }

              if (!invoiceExists && docType === 'Invoice') {
                console.warn(`[PAYMENT-SYNC] Invoice ${invoiceRefNbr} not found in database! Attempting to fetch from Acumatica...`);

                const fetchResult = await fetchAndUpsertMissingInvoice(
                  supabase,
                  sessionManager,
                  credentials,
                  invoiceRefNbr
                );

                if (fetchResult.success) {
                  console.log(`[PAYMENT-SYNC] ✓ Successfully fetched and stored missing invoice ${invoiceRefNbr}`);
                } else {
                  console.warn(`[PAYMENT-SYNC] ✗ Could not fetch invoice ${invoiceRefNbr}: ${fetchResult.error}`);
                  errors.push(`Invoice ${invoiceRefNbr} not found in database or Acumatica for payment ${refNbr}`);
                }
              }

              try {
                await supabase
                  .from('payment_invoice_applications')
                  .upsert({
                    payment_id: paymentDbId,
                    payment_reference_number: refNbr,
                    invoice_reference_number: invoiceRefNbr,
                    customer_id: paymentData.customer_id || '',
                    amount_paid: amountPaid || 0,
                    application_date: appDate || null,
                    doc_type: docType,
                    balance: app.Balance?.value || 0,
                    cash_discount_taken: app.CashDiscountTaken?.value || 0,
                    post_period: app.PostPeriod?.value || null,
                    application_period: app.ApplicationPeriod?.value || null,
                    due_date: app.DueDate?.value || null,
                    customer_order: app.CustomerOrder?.value || null,
                    description: app.Description?.value || null,
                    invoice_date: app.Date?.value || null
                  }, {
                    onConflict: 'payment_id,invoice_reference_number'
                  });

                applicationsSynced++;

                if (invoiceExists) {
                  console.log(`[PAYMENT-SYNC] ✓ Linked payment ${refNbr} to existing invoice ${invoiceRefNbr}`);
                } else {
                  console.log(`[PAYMENT-SYNC] ⚠ Stored application ${refNbr} -> ${invoiceRefNbr}, but invoice not in DB yet`);
                }

                console.log(`Logging application_fetched for ${refNbr} -> ${invoiceRefNbr}`);
                await supabase.rpc('log_sync_change', {
                  p_sync_type: 'payment_application',
                  p_action_type: 'application_fetched',
                  p_entity_id: paymentDbId,
                  p_entity_reference: `${refNbr} -> ${invoiceRefNbr}`,
                  p_entity_name: `Application: Payment ${refNbr} to Invoice ${invoiceRefNbr}`,
                  p_change_summary: `Fetched and synced application of $${amountPaid || 0} from payment ${refNbr} to invoice ${invoiceRefNbr}`,
                  p_change_details: {
                    payment_ref: refNbr,
                    invoice_ref: invoiceRefNbr,
                    amount_applied: amountPaid,
                    application_date: appDate,
                    doc_type: app.DocType?.value || app.AdjustedDocType?.value
                  },
                  p_sync_source: 'scheduled_sync'
                });
                console.log(`Successfully logged application_fetched`);
              } catch (appError: any) {
                console.error(`Failed to sync application ${refNbr} -> ${invoiceRefNbr}:`, appError.message);
                errors.push(`Application sync error for ${refNbr} -> ${invoiceRefNbr}: ${appError.message}`);
              }
            }
          } else if (paymentDbId) {
            try {
              const { data: existingApps } = await supabase
                .from('payment_invoice_applications')
                .select('invoice_reference_number, amount_paid, application_date')
                .eq('payment_id', paymentDbId);

              if (existingApps && existingApps.length > 0) {
                console.log(`Found ${existingApps.length} existing applications for payment ${refNbr}, logging them`);
                for (const app of existingApps) {
                  await supabase.rpc('log_sync_change', {
                    p_sync_type: 'payment_application',
                    p_action_type: 'application_fetched',
                    p_entity_id: paymentDbId,
                    p_entity_reference: `${refNbr} -> ${app.invoice_reference_number}`,
                    p_entity_name: `Application: Payment ${refNbr} to Invoice ${app.invoice_reference_number}`,
                    p_change_summary: `Synced existing application of $${app.amount_paid || 0} from payment ${refNbr} to invoice ${app.invoice_reference_number}`,
                    p_change_details: {
                      payment_ref: refNbr,
                      invoice_ref: app.invoice_reference_number,
                      amount_paid: app.amount_paid,
                      application_date: app.application_date,
                      source: 'existing_db_record'
                    },
                    p_sync_source: 'scheduled_sync'
                  });
                  applicationsSynced++;
                }
              }
            } catch (dbAppError: any) {
              console.error(`Failed to log existing applications for ${refNbr}:`, dbAppError.message);
            }
          }

          if (payment.files && Array.isArray(payment.files) && payment.files.length > 0) {
            console.log(`Processing ${payment.files.length} files for payment ${refNbr}`);

            for (const file of payment.files) {
              const { fileId, fileName } = fileInfo(file);

              if (!fileId || !fileName) continue;

              // Skip files we already have. Without this, every 5-min run re-downloaded
              // and re-uploaded every attachment in the 24h lookback under a NEW timestamped
              // path (~6k duplicate objects/day, 742k objects / 174 GB in the bucket) and
              // pushed the run past the 150s gateway limit. existingFiles was bulk-loaded
              // from payment_attachments; claim the key before downloading so two
              // concurrent work items (e.g. Payment + Voided Payment sharing a ref and a
              // file) can never both upload it.
              const fk = fileKey(refNbr, fileId);
              if (existingFiles.has(fk)) continue;
              existingFiles.add(fk);
              let fileStored = false;

              try {
                const fileUrl = `${acumaticaUrl}/(W(2))/Frames/GetFile.ashx?fileID=${fileId}`;
                const fileResponse = await sessionManager.makeAuthenticatedRequest(credentials, fileUrl);

                if (fileResponse.ok) {
                  const fileBlob = await fileResponse.arrayBuffer();
                  const cleanFileName = (fileName.split('\\').pop() || fileName).replace(/[#?&]/g, '_');
                  const storagePath = `payments/${refNbr}/${new Date().toISOString().replace(/[:.]/g, '-')}-${cleanFileName}`;

                  const { error: uploadError } = await supabase.storage
                    .from('payment-check-images')
                    .upload(storagePath, new Uint8Array(fileBlob), {
                      contentType: fileResponse.headers.get('content-type') || 'application/octet-stream',
                      upsert: true
                    });

                  if (!uploadError) {
                    fileStored = true;
                    const isCheckImage = cleanFileName.toLowerCase().includes('check') ||
                                        cleanFileName.toLowerCase().includes('.jpg') ||
                                        cleanFileName.toLowerCase().includes('.jpeg') ||
                                        cleanFileName.toLowerCase().includes('.png');

                    await supabase
                      .from('payment_attachments')
                      .upsert({
                        payment_reference_number: refNbr,
                        file_name: cleanFileName,
                        file_type: fileResponse.headers.get('content-type') || 'application/octet-stream',
                        file_size: fileBlob.byteLength,
                        storage_path: storagePath,
                        file_id: fileId,
                        is_check_image: isCheckImage,
                      }, {
                        onConflict: 'payment_reference_number,file_id'
                      });

                    filesSynced++;
                    console.log(`Synced file ${cleanFileName} for payment ${refNbr}`);

                    console.log(`Logging attachment_fetched for ${refNbr} - ${cleanFileName}`);
                    await supabase.rpc('log_sync_change', {
                      p_sync_type: 'payment_attachment',
                      p_action_type: 'attachment_fetched',
                      p_entity_id: paymentDbId || (changed ? null : existing?.id ?? null),
                      p_entity_reference: refNbr,
                      p_entity_name: `Attachment: ${cleanFileName}`,
                      p_change_summary: `Fetched and synced attachment ${cleanFileName} for payment ${refNbr}`,
                      p_change_details: {
                        payment_ref: refNbr,
                        file_name: cleanFileName,
                        file_size: fileBlob.byteLength,
                        file_type: fileResponse.headers.get('content-type') || 'application/octet-stream',
                        is_check_image: isCheckImage,
                        storage_path: storagePath
                      },
                      p_sync_source: 'scheduled_sync'
                    });
                    console.log(`Successfully logged attachment_fetched`);
                  }
                }
              } catch (fileError: any) {
                console.error(`Failed to sync file ${fileName} for payment ${refNbr}:`, fileError.message);
                errors.push(`File sync error for ${refNbr} - ${fileName}: ${fileError.message}`);
              }
              // Not stored (download/upload failed): release the claim so it is retried.
              if (!fileStored) existingFiles.delete(fk);
            }
          }
        } catch (error: any) {
          errors.push(`Error processing payment: ${error.message}`);
        }
    };

    let cursor = 0;
    let started = 0;
    const runWorker = async () => {
      while (cursor < toProcess.length) {
        if (Date.now() - fnStart > START_BUDGET_MS) break;
        const item = toProcess[cursor++];
        started++;
        await processOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(WORK_CONCURRENCY, toProcess.length) }, runWorker));

    const deferred = work.length - started;
    if (deferred > 0) {
      // Partial run: leave sync_status / last_successful_sync alone so the next
      // run's window still covers the remainder.
      const msg = `Partial payment sync: processed ${started} of ${work.length} payments needing work; ${deferred} deferred to the next run`;
      console.log(msg);
      return new Response(
        JSON.stringify({
          success: false,
          partial: true,
          error: msg,
          totalFetched: payments.length,
          unchanged,
          processed: started,
          created,
          updated,
          applicationsSynced,
          filesSynced,
          deferred,
          errors: errors.slice(0, 10),
          totalErrors: errors.length
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session is automatically managed, no need to manually logout

    const syncResultData = {
      entity_type: 'payment',
      last_successful_sync: new Date().toISOString(),
      status: errors.length === 0 ? 'completed' : 'completed',
      records_synced: payments.length,
      records_updated: updated,
      records_created: created,
      errors: errors.slice(0, 150),
      last_error: errors.length > 0 ? errors[0] : null,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('sync_status')
      .update(syncResultData)
      .eq('entity_type', 'payment');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment sync completed. Found ${payments.length} payments, created ${created}, updated ${updated}, synced ${applicationsSynced} applications, synced ${filesSynced} files`,
        created,
        updated,
        unchanged,
        applicationsSynced,
        filesSynced,
        totalFetched: payments.length,
        errors: errors.slice(0, 10),
        totalErrors: errors.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('Payment sync error:', error);

    await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
      .from('sync_status')
      .update({
        status: 'failed',
        last_error: error.message,
        retry_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('entity_type', 'payment');

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
