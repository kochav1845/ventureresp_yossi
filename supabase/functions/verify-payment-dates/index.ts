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
    const { startDate, endDate, fix } = body;

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

    const nonCmUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment?$filter=Type ne 'Credit Memo' and ApplicationDate ge datetimeoffset'${filterStart}' and ApplicationDate le datetimeoffset'${filterEnd}'&$select=ReferenceNbr,Type,ApplicationDate,LastModifiedDateTime,PaymentAmount,Status`;
    console.log(`[verify-dates] Fetching non-CM payments from Acumatica`);
    const nonCmResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, nonCmUrl);
    if (!nonCmResponse.ok) {
      const errText = await nonCmResponse.text();
      throw new Error(`Acumatica API error: ${nonCmResponse.status} - ${errText.substring(0, 300)}`);
    }
    const nonCmData = await nonCmResponse.json();
    for (const p of (Array.isArray(nonCmData) ? nonCmData : [])) {
      let refNbr = p.ReferenceNbr?.value;
      if (!refNbr) continue;
      if (/^[0-9]+$/.test(refNbr) && refNbr.length < 6) refNbr = refNbr.padStart(6, '0');
      const type = p.Type?.value || '';
      acumaticaMap.set(`${type}:${refNbr}`, {
        date: p.ApplicationDate?.value || '',
        type,
        amount: p.PaymentAmount?.value || 0,
        status: p.Status?.value || '',
      });
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

    const { data: dbNonCm } = await supabase
      .from('acumatica_payments')
      .select('id, reference_number, type, application_date, doc_date, payment_amount, status, customer_name')
      .neq('type', 'Credit Memo')
      .gte('application_date', `${startDate}T00:00:00`)
      .lte('application_date', `${endDate}T23:59:59`);

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
    const errors: string[] = [];

    for (const { key, payment } of inDbNotAcumatica) {
      const [type, refNbr] = key.split(':');
      let realDate: string | null = null;

      try {
        const lookupUrl = `${acumaticaUrl}/entity/Default/24.200.001/Payment/${encodeURIComponent(type)}/${encodeURIComponent(refNbr)}?$select=ReferenceNbr,Type,ApplicationDate,LastModifiedDateTime,PaymentAmount,Status`;
        const lookupResponse = await sessionManager.makeAuthenticatedRequest(credentialsObj, lookupUrl);

        if (lookupResponse.ok) {
          const lookupData = await lookupResponse.json();
          realDate = lookupData.ApplicationDate?.value || null;
          const realStatus = lookupData.Status?.value || null;

          stalePayments.push({
            reference_number: refNbr,
            type,
            customer_name: payment.customer_name,
            db_date: payment.application_date,
            acumatica_date: realDate,
            acumatica_status: realStatus,
            amount: payment.payment_amount,
          });

          if (fix && realDate) {
            const { error: updateError } = await supabase
              .from('acumatica_payments')
              .update({
                application_date: realDate,
                status: realStatus || payment.status,
                last_sync_timestamp: new Date().toISOString(),
              })
              .eq('reference_number', refNbr)
              .eq('type', type);

            if (updateError) {
              errors.push(`Failed to fix ${refNbr}: ${updateError.message}`);
            } else {
              fixedPayments.push({ reference_number: refNbr, type, old_date: payment.application_date, new_date: realDate });
            }
          }
        } else if (lookupResponse.status === 404 || lookupResponse.status === 500) {
          stalePayments.push({
            reference_number: refNbr,
            type,
            customer_name: payment.customer_name,
            db_date: payment.application_date,
            acumatica_date: null,
            acumatica_status: 'NOT FOUND IN ACUMATICA',
            amount: payment.payment_amount,
          });
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
        inAcumaticaNotDb: inAcumaticaNotDb.length,
        inDbNotAcumatica: inDbNotAcumatica.length,
        stalePayments,
        fixedPayments: fix ? fixedPayments : [],
        fixMode: !!fix,
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
