import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function getAcumaticaSession(supabase: any, acumaticaUrl: string, credentials: any): Promise<string> {
  const { data: cachedSession } = await supabase
    .from('acumatica_session_cache')
    .select('session_cookie')
    .eq('is_valid', true)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cachedSession) {
    return cachedSession.session_cookie;
  }

  const loginBody: any = {
    name: credentials.username,
    password: credentials.password,
  };
  if (credentials.company) loginBody.company = credentials.company;
  if (credentials.branch) loginBody.branch = credentials.branch;

  const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody),
  });

  if (!loginResponse.ok) {
    const errorText = await loginResponse.text();
    throw new Error(`Authentication failed: ${errorText}`);
  }

  const setCookieHeader = loginResponse.headers.get('set-cookie');
  if (!setCookieHeader) {
    throw new Error('No authentication cookies received');
  }

  const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 2);

  await supabase
    .from('acumatica_session_cache')
    .update({ is_valid: false })
    .eq('is_valid', true);

  await supabase
    .from('acumatica_session_cache')
    .insert({
      session_cookie: cookies,
      expires_at: expiresAt.toISOString(),
      is_valid: true,
    });

  return cookies;
}

async function fetchInvoiceFromAcumatica(
  acumaticaUrl: string,
  cookies: string,
  referenceNumber: string,
  docType: string
): Promise<any | null> {
  // Map our type names to Acumatica DocType values
  const typeMap: Record<string, string> = {
    'Invoice': 'Invoice',
    'Credit Memo': 'Credit Memo',
    'Debit Memo': 'Debit Memo',
  };
  const acDocType = typeMap[docType] || docType;

  // Use the Invoice endpoint with DocType filter to get the specific document
  const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${referenceNumber}' and DocType eq '${acDocType}'&$select=ReferenceNbr,Status,Balance,Type,DocDate,CustomerID`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookies,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    const errorText = await response.text();
    if (errorText.includes('404') || errorText.includes('not found')) return null;
    throw new Error(`API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  if (Array.isArray(data) && data.length > 0) {
    return data[0];
  }
  return null;
}

async function fetchInvoiceBatch(
  acumaticaUrl: string,
  cookies: string,
  filter: string
): Promise<any[]> {
  const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${encodeURIComponent(filter)}&$top=50`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Cookie': cookies,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText.substring(0, 200)}`);
  }

  const text = await response.text();
  if (text.trim().startsWith('<')) {
    throw new Error('Received HTML instead of JSON - possible session timeout');
  }

  return JSON.parse(text);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'public' }, global: { headers: { 'x-statement-timeout': '120s' } } }
    );

    // batchSize 50 = the Acumatica $top cap (line ~112); fewer, larger batches
    // let the full open-invoice set reconcile within the 150s gateway limit
    // instead of 504-ing partway through.
    const { batchSize = 50, mode = 'full' } = await req.json().catch(() => ({}));

    console.log(`Starting invoice status reconciliation (mode: ${mode}, batchSize: ${batchSize})`);

    // Get credentials
    const { data: credentials, error: credError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (credError || !credentials) {
      throw new Error('Acumatica credentials not configured');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (acumaticaUrl && !acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    let cookies = await getAcumaticaSession(supabase, acumaticaUrl, credentials);

    const results = {
      totalChecked: 0,
      statusMismatches: 0,
      balanceMismatches: 0,
      notFoundInAcumatica: 0,
      updated: 0,
      duplicatesRemoved: 0,
      errors: [] as string[],
      details: [] as any[],
    };

    // STEP 1: Remove duplicate invoice records (null customer copies)
    const { data: duplicates } = await supabase
      .from('acumatica_invoices')
      .select('id, reference_number, type')
      .is('customer', null);

    if (duplicates && duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate records with null customer, removing...`);
      for (const dup of duplicates) {
        const { data: realRecord } = await supabase
          .from('acumatica_invoices')
          .select('id')
          .eq('reference_number', dup.reference_number)
          .not('customer', 'is', null)
          .limit(1)
          .maybeSingle();

        if (realRecord) {
          await supabase.from('acumatica_invoices').delete().eq('id', dup.id);
          results.duplicatesRemoved++;
        }
      }
      console.log(`Removed ${results.duplicatesRemoved} duplicate records`);
    }

    // STEP 2: Get invoices from our DB to check
    // Strategy: Focus on Credit Memos (most likely to have discrepancies)
    // and a sample of open invoices to stay within timeout limits
    let dbInvoices: any[] = [];

    if (mode === 'full') {
      // Full mode: All credit memos (open + closed) + open debit memos
      const { data: creditMemos, error: cmErr } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, type, status, balance, amount, customer, acumatica_id')
        .eq('type', 'Credit Memo')
        .not('customer', 'is', null)
        .order('reference_number')
        .limit(2000);

      if (cmErr) results.errors.push(`CM query error: ${cmErr.message}`);

      const { data: debitMemos, error: dmErr } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, type, status, balance, amount, customer, acumatica_id')
        .eq('type', 'Debit Memo')
        .in('status', ['Open', 'Credit Hold'])
        .not('customer', 'is', null)
        .limit(500);

      if (dmErr) results.errors.push(`DM query error: ${dmErr.message}`);

      // Check ALL open invoices (not a 500 sample) — paginate past PostgREST's
      // ~1000-row cap so stale-open invoices in the tail can't be missed (that
      // gap is exactly how refs like 096026/096359 stayed Open after a sync gap).
      const openInvoices: any[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: page, error: invErr } = await supabase
          .from('acumatica_invoices')
          .select('id, reference_number, type, status, balance, amount, customer, acumatica_id')
          .eq('type', 'Invoice')
          .in('status', ['Open', 'Credit Hold'])
          .not('customer', 'is', null)
          .order('reference_number', { ascending: true })
          .range(from, from + PAGE - 1);
        if (invErr) { results.errors.push(`Invoice query error: ${invErr.message}`); break; }
        if (!page || page.length === 0) break;
        openInvoices.push(...page);
        if (page.length < PAGE) break;
      }

      dbInvoices = [...(creditMemos || []), ...(debitMemos || []), ...(openInvoices || [])];
    } else {
      // Quick mode: Only open/credit hold credit memos and debit memos
      const { data: invoices, error: qErr } = await supabase
        .from('acumatica_invoices')
        .select('id, reference_number, type, status, balance, amount, customer, acumatica_id')
        .in('type', ['Credit Memo', 'Debit Memo'])
        .in('status', ['Open', 'Closed', 'Credit Hold'])
        .not('customer', 'is', null)
        .order('reference_number')
        .limit(2000);

      if (qErr) results.errors.push(`DB query error: ${qErr.message}`);
      dbInvoices = invoices || [];
    }

    console.log(`Found ${dbInvoices.length} invoices to reconcile`);

    // STEP 3: Process in small batches using OData filter with few items at a time
    for (let i = 0; i < dbInvoices.length; i += batchSize) {
      const batch = dbInvoices.slice(i, i + batchSize);

      // Build a short OData filter (only 20 items max so URL stays reasonable)
      const refFilter = batch.map(inv => `ReferenceNbr eq '${inv.reference_number}'`).join(' or ');

      try {
        const acumaticaInvoices = await fetchInvoiceBatch(acumaticaUrl, cookies, refFilter);

        // For each ref, pick the most recently CREATED invoice (handles 2020 vs 2025 collisions)
        const acumaticaMap = new Map<string, any>();
        const sortedAc = [...acumaticaInvoices].sort((a, b) => {
          const da = new Date(a.CreatedDateTime?.value || 0).getTime();
          const db = new Date(b.CreatedDateTime?.value || 0).getTime();
          return db - da;
        });
        for (const inv of sortedAc) {
          const refNbr = inv.ReferenceNbr?.value;
          const type = inv.Type?.value;
          if (!refNbr) continue;
          const keyTyped = `${refNbr}|${type}`;
          // Only set first (newest) — later older versions are skipped
          if (!acumaticaMap.has(keyTyped)) acumaticaMap.set(keyTyped, inv);
          if (!acumaticaMap.has(refNbr)) acumaticaMap.set(refNbr, inv);
        }

        for (const dbInv of batch) {
          results.totalChecked++;
          const acInv = acumaticaMap.get(`${dbInv.reference_number}|${dbInv.type}`) || acumaticaMap.get(dbInv.reference_number);

          if (!acInv) {
            results.notFoundInAcumatica++;
            continue;
          }

          const acStatus = acInv.Status?.value;
          const acBalance = parseFloat(acInv.Balance?.value || '0');
          const acAmount = parseFloat(acInv.Amount?.value || '0');
          const acAcumaticaId = acInv.id;
          const dbBalance = parseFloat(dbInv.balance || '0');
          const dbAmount = parseFloat(dbInv.amount || '0');

          let needsUpdate = false;
          const changes: any = {};

          if (acStatus && acStatus !== dbInv.status) {
            needsUpdate = true;
            changes.status = acStatus;
            results.statusMismatches++;
          }

          if (Math.abs(acBalance - dbBalance) > 0.01) {
            needsUpdate = true;
            changes.balance = acBalance;
            results.balanceMismatches++;
          }

          // Detect collisions: amount mismatch OR acumatica_id mismatch indicates
          // we have stale data from a different (older) invoice with same ref number.
          const amountMismatch = Math.abs(acAmount - dbAmount) > 0.01;
          const idMismatch = !!acAcumaticaId && !!dbInv.acumatica_id && acAcumaticaId !== dbInv.acumatica_id;
          if (amountMismatch || idMismatch) {
            needsUpdate = true;
            changes.amount = acAmount;
            changes.acumatica_id = acAcumaticaId;
            // Best-effort full overwrite of fields available in this batch payload
            if (acInv.Customer?.value) changes.customer = acInv.Customer.value;
            if (acInv.DocDate?.value) changes.date = (acInv.DocDate.value as string).split('T')[0];
          }

          if (needsUpdate) {
            const { error: updateError } = await supabase
              .from('acumatica_invoices')
              .update({
                ...changes,
                last_modified_at: new Date().toISOString(),
                synced_at: new Date().toISOString(),
              })
              .eq('id', dbInv.id);

            if (updateError) {
              results.errors.push(`Failed to update ${dbInv.reference_number}: ${updateError.message}`);
            } else {
              results.updated++;
              results.details.push({
                reference_number: dbInv.reference_number,
                type: dbInv.type,
                old_status: dbInv.status,
                new_status: changes.status || dbInv.status,
                old_balance: dbBalance,
                new_balance: changes.balance ?? dbBalance,
                old_amount: dbAmount,
                new_amount: changes.amount ?? dbAmount,
                collision: amountMismatch || idMismatch,
              });
            }
          }
        }

        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(dbInvoices.length / batchSize)}: ${results.updated} updates so far`);

        // Delay between batches
        if (i + batchSize < dbInvoices.length) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (batchError: any) {
        const errMsg = batchError.message?.substring(0, 200) || 'Unknown error';
        console.error(`Batch error at offset ${i}:`, errMsg);
        results.errors.push(`Batch error at offset ${i}: ${errMsg}`);

        // If session expired, try to re-authenticate
        if (batchError.message?.includes('401') || batchError.message?.includes('session')) {
          try {
            await supabase.from('acumatica_session_cache').update({ is_valid: false }).eq('is_valid', true);
            cookies = await getAcumaticaSession(supabase, acumaticaUrl, credentials);
            console.log('Re-authenticated after session error');
          } catch {
            results.errors.push('Failed to re-authenticate');
            break;
          }
        }
      }
    }

    // Log the reconciliation run
    await supabase.from('sync_change_logs').insert({
      entity_type: 'invoice_reconciliation',
      action_type: 'reconciled',
      details: {
        totalChecked: results.totalChecked,
        statusMismatches: results.statusMismatches,
        balanceMismatches: results.balanceMismatches,
        updated: results.updated,
        duplicatesRemoved: results.duplicatesRemoved,
        notFoundInAcumatica: results.notFoundInAcumatica,
        errorCount: results.errors.length,
        mode,
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Reconciliation complete in ${duration}s: ${results.updated} updates, ${results.statusMismatches} status mismatches`);

    return new Response(
      JSON.stringify({
        success: true,
        duration: `${duration}s`,
        dbInvoicesFound: dbInvoices.length,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Reconciliation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
