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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { startDate, endDate, fix, deleteExtras } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credentials) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http")) acumaticaUrl = `https://${acumaticaUrl}`;

    const credentialsObj = {
      acumaticaUrl,
      username: credentials.username,
      password: credentials.password,
      company: credentials.company,
      branch: credentials.branch,
    };

    const filterStart = new Date(startDate).toISOString().split('.')[0];
    const filterEnd = new Date(endDate + 'T23:59:59').toISOString().split('.')[0];

    const acumaticaMap = new Map<string, { date: string; type: string; amount: number; status: string }>();

    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    const nonCmUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=Type ne 'Credit Memo' and ApplicationDate ge datetimeoffset'${filterStart}' and ApplicationDate le datetimeoffset'${filterEnd}'&$select=ReferenceNbr,Type,ApplicationDate,LastModifiedDateTime,PaymentAmount,Status&$custom=Document.DocDate`;
    console.log(`[verify-dates] Fetching non-CM payments from Acumatica (with DocDate)`);
    const nonCmResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, nonCmUrl);
    if (!nonCmResponse.ok) {
      const errText = await nonCmResponse.text();
      throw new Error(`Acumatica API error: ${nonCmResponse.status} - ${errText.substring(0, 300)}`);
    }
    const nonCmData = await nonCmResponse.json();
    let nonCmSkipped = 0;
    for (const p of (Array.isArray(nonCmData) ? nonCmData : [])) {
      let refNbr = p.ReferenceNbr?.value;
      if (!refNbr) continue;
      if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) refNbr = refNbr.padStart(6, '0');
      const type = p.Type?.value || '';
      const docDate = p.custom?.Document?.DocDate?.value || null;
      const effectiveDate = docDate || p.ApplicationDate?.value || '';

      if (effectiveDate) {
        const effDateObj = new Date(effectiveDate);
        if (effDateObj < rangeStart || effDateObj > rangeEnd) {
          nonCmSkipped++;
          continue;
        }
      }

      acumaticaMap.set(`${type}:${refNbr}`, {
        date: effectiveDate,
        type,
        amount: p.PaymentAmount?.value || 0,
        status: p.Status?.value || '',
      });
    }
    if (nonCmSkipped > 0) {
      console.log(`[verify-dates] Skipped ${nonCmSkipped} non-CM payments whose DocDate is outside ${startDate} to ${endDate}`);
    }

    const cmUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=Type eq 'Credit Memo' and Date ge datetimeoffset'${filterStart}' and Date le datetimeoffset'${filterEnd}'&$select=ReferenceNbr,Type,Date,Amount,Status`;
    console.log(`[verify-dates] Fetching Credit Memos by DocDate from Invoice endpoint`);
    const cmResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, cmUrl);
    if (cmResponse.ok) {
      const cmData = await cmResponse.json();
      for (const p of (Array.isArray(cmData) ? cmData : [])) {
        let refNbr = p.ReferenceNbr?.value;
        if (!refNbr) continue;
        if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) refNbr = refNbr.padStart(6, '0');
        acumaticaMap.set(`Credit Memo:${refNbr}`, {
          date: p.Date?.value || '',
          type: 'Credit Memo',
          amount: p.Amount?.value || 0,
          status: p.Status?.value || '',
        });
      }
    }

    console.log(`[verify-dates] Acumatica has ${acumaticaMap.size} payments in range`);

    const { data: dbNonCmWithDocDate } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, application_date, doc_date, payment_amount, status, customer_name')
      .neq('type', 'Credit Memo')
      .not('doc_date', 'is', null)
      .gte('doc_date', `${startDate}T00:00:00`)
      .lte('doc_date', `${endDate}T23:59:59`);

    const { data: dbNonCmNoDocDate } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, application_date, doc_date, payment_amount, status, customer_name')
      .neq('type', 'Credit Memo')
      .is('doc_date', null)
      .gte('application_date', `${startDate}T00:00:00`)
      .lte('application_date', `${endDate}T23:59:59`);

    const dbNonCm = [...(dbNonCmWithDocDate || []), ...(dbNonCmNoDocDate || [])];

    const { data: dbCm } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, application_date, doc_date, payment_amount, status, customer_name')
      .eq('type', 'Credit Memo')
      .gte('doc_date', `${startDate}T00:00:00`)
      .lte('doc_date', `${endDate}T23:59:59`);

    const dbMap = new Map<string, any>();
    for (const p of [...(dbNonCm || []), ...(dbCm || [])]) {
      dbMap.set(`${p.type}:${p.reference_number}`, p);
    }

    console.log(`[verify-dates] DB has ${dbMap.size} payments in range`);

    const inAcumaticaNotDb: string[] = [];
    for (const [key] of acumaticaMap) {
      if (!dbMap.has(key)) inAcumaticaNotDb.push(key);
    }

    const inDbNotAcumatica: { key: string; payment: any }[] = [];
    for (const [key, payment] of dbMap) {
      if (!acumaticaMap.has(key)) {
        inDbNotAcumatica.push({ key, payment });
      }
    }

    console.log(`[verify-dates] In Acumatica but not DB: ${inAcumaticaNotDb.length}`);
    console.log(`[verify-dates] In DB but not Acumatica (stale dates): ${inDbNotAcumatica.length}`);

    const stalePayments: any[] = [];
    const fixedPayments: any[] = [];
    const deletedPayments: any[] = [];
    const errors: string[] = [];
    const shouldFix = fix || deleteExtras;

    for (const { key, payment } of inDbNotAcumatica) {
      const [type, refNbr] = key.split(':');
      const isCM = type === 'Credit Memo';
      let realDate: string | null = null;
      let realAppDate: string | null = null;
      let realStatus: string | null = null;
      let found = false;

      try {
        const lookupUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(refNbr)}?$select=ReferenceNbr,Type,ApplicationDate,LastModifiedDateTime,PaymentAmount,Status&$custom=Document.DocDate`;
        const lookupResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, lookupUrl);

        if (lookupResponse.ok) {
          found = true;
          const lookupData = await lookupResponse.json();
          realStatus = lookupData.Status?.value || null;
          realAppDate = lookupData.ApplicationDate?.value || null;
          realDate = lookupData.custom?.Document?.DocDate?.value || realAppDate;
        }

        if (!found || (isCM && !realDate)) {
          try {
            const invUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice/${encodeURIComponent(refNbr)}?$select=ReferenceNbr,Type,Date,Status`;
            const invResp = await sessionManager.makeAuthenticatedRequest(credentialsObj, invUrl);
            if (invResp.ok) {
              found = true;
              const invData = await invResp.json();
              realDate = invData.Date?.value || realDate;
              realStatus = invData.Status?.value || realStatus;
            }
          } catch (_invErr) {}
        }

        const dbDate = payment.doc_date || payment.application_date;

        if (found) {
          stalePayments.push({
            reference_number: refNbr,
            type,
            customer_name: payment.customer_name,
            db_date: dbDate,
            acumatica_date: realDate,
            acumatica_status: realStatus,
            amount: payment.payment_amount,
          });

          if (shouldFix && realDate) {
            const updateFields: any = {
              last_sync_timestamp: new Date().toISOString(),
              status: realStatus || payment.status,
              doc_date: realDate,
            };
            if (!isCM && realAppDate) {
              updateFields.application_date = realAppDate;
            }

            const { error: updateError } = await supabase
              .from('acumatica_payments')
              .update(updateFields)
              .eq('reference_number', refNbr)
              .eq('type', type);

            if (updateError) {
              errors.push(`Failed to fix ${refNbr}: ${updateError.message}`);
            } else {
              fixedPayments.push({ reference_number: refNbr, type, old_date: dbDate, new_date: realDate });
            }
          }
        } else {
          stalePayments.push({
            reference_number: refNbr,
            type,
            customer_name: payment.customer_name,
            db_date: dbDate,
            acumatica_date: null,
            acumatica_status: 'NOT FOUND IN ACUMATICA',
            amount: payment.payment_amount,
          });

          if (deleteExtras) {
            const paymentId = payment.id;
            await supabase.from('payment_invoice_applications').delete().eq('payment_id', paymentId);
            await supabase.from('payment_change_log').delete().eq('payment_id', paymentId);
            await supabase.from('payment_attachments').delete().eq('payment_id', paymentId);
            await supabase.from('payment_application_fetch_logs').delete().eq('payment_id', paymentId);
            const { error: delError } = await supabase.from('acumatica_payments').delete().eq('id', paymentId);
            if (delError) {
              errors.push(`Failed to delete ${refNbr}: ${delError.message}`);
            } else {
              deletedPayments.push({ reference_number: refNbr, type, customer_name: payment.customer_name });
            }
          }
        }
      } catch (err: any) {
        errors.push(`Lookup failed for ${refNbr}: ${err.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dateRange: { startDate, endDate },
        acumaticaCount: acumaticaMap.size,
        dbCount: dbMap.size,
        nonCmSkippedByDocDate: nonCmSkipped,
        inAcumaticaNotDb: inAcumaticaNotDb.length,
        inDbNotAcumatica: inDbNotAcumatica.length,
        stalePayments,
        fixedPayments: shouldFix ? fixedPayments : [],
        deletedPayments: deleteExtras ? deletedPayments : [],
        fixMode: !!fix,
        deleteMode: !!deleteExtras,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error('[verify-dates] Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
