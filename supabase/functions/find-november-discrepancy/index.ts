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

async function getDbInvoicesForDateRange(supabase: any, startDate: string, endDate: string): Promise<any[]> {
  let allRecords: any[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from('acumatica_invoices')
      .select('reference_number, type')
      .gte('date', startDate)
      .lt('date', endDate)
      .range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allRecords = allRecords.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRecords;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const fix = body.fix === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!credentials) {
      throw new Error('No Acumatica credentials found');
    }

    let acumaticaUrl = credentials.acumatica_url;
    if (!acumaticaUrl.startsWith("http")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const creds = {
      acumaticaUrl,
      username: credentials.username,
      password: credentials.password,
      company: credentials.company || '',
      branch: credentials.branch || '',
    };

    // Scan all months from Jan 2024 to current
    const months: { startDate: string; endDate: string; label: string }[] = [];
    const now = new Date();
    for (let year = 2024; year <= now.getFullYear(); year++) {
      const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
      for (let month = 1; month <= maxMonth; month++) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDateForApi = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        months.push({ startDate, endDate: nextMonth, label: `${year}-${String(month).padStart(2, '0')}` });
      }
    }

    const allDiscrepancies: any[] = [];
    const summary: any[] = [];

    for (const monthInfo of months) {
      const dateFilter = `Date ge datetimeoffset'${monthInfo.startDate}T00:00:00' and Date le datetimeoffset'${monthInfo.endDate}T00:00:00'`;
      const lastDayOfMonth = new Date(
        parseInt(monthInfo.startDate.split('-')[0]),
        parseInt(monthInfo.startDate.split('-')[1]),
        0
      ).getDate();
      const endDateApi = `${monthInfo.startDate.substring(0, 8)}${lastDayOfMonth}`;
      const dateFilterFixed = `Date ge datetimeoffset'${monthInfo.startDate}T00:00:00' and Date le datetimeoffset'${endDateApi}T23:59:59'`;

      const listUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${dateFilterFixed}&$select=ReferenceNbr,Type,Date`;

      const response = await sessionManager.makeAuthenticatedRequest(creds, listUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        summary.push({ month: monthInfo.label, error: `API failed: ${response.status}` });
        continue;
      }

      const acumaticaData = await response.json();
      const acumaticaInvoices = Array.isArray(acumaticaData) ? acumaticaData : [];

      const dbInvoices = await getDbInvoicesForDateRange(supabase, monthInfo.startDate, monthInfo.endDate);
      const dbSet = new Set(dbInvoices.map((inv: any) => `${inv.type}:${inv.reference_number}`));

      const mismatched: any[] = [];
      for (const inv of acumaticaInvoices) {
        const ref = padRefNbr(inv.ReferenceNbr?.value || '');
        const type = inv.Type?.value || '';
        const acumaticaDate = inv.Date?.value || '';
        if (!ref || !type) continue;
        if (!dbSet.has(`${type}:${ref}`)) {
          mismatched.push({ ref, type, acumaticaDate });
        }
      }

      if (mismatched.length > 0) {
        // Look up where these actually are in our DB
        const refs = mismatched.map(m => m.ref);
        const { data: dbRecords } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, type, date')
          .in('reference_number', refs);

        const dbMap = new Map((dbRecords || []).map((r: any) => [`${r.type}:${r.reference_number}`, r.date]));

        for (const m of mismatched) {
          const ourDate = dbMap.get(`${m.type}:${m.ref}`) || 'NOT_FOUND';
          const correctDate = m.acumaticaDate.split('T')[0];
          allDiscrepancies.push({
            ref: m.ref,
            type: m.type,
            ourDate,
            correctDate,
            month: monthInfo.label,
          });
        }

        summary.push({ month: monthInfo.label, acumaticaCount: acumaticaInvoices.length, dbCount: dbInvoices.length, discrepancies: mismatched.length });
      } else {
        summary.push({ month: monthInfo.label, acumaticaCount: acumaticaInvoices.length, dbCount: dbInvoices.length, discrepancies: 0 });
      }
    }

    // Fix if requested
    let fixed = 0;
    if (fix && allDiscrepancies.length > 0) {
      for (const d of allDiscrepancies) {
        if (d.ourDate === 'NOT_FOUND') continue;
        const { error } = await supabase
          .from('acumatica_invoices')
          .update({ date: d.correctDate })
          .eq('reference_number', d.ref)
          .eq('type', d.type);
        if (!error) fixed++;
      }
    }

    return new Response(JSON.stringify({
      totalDiscrepancies: allDiscrepancies.length,
      fixed,
      discrepancies: allDiscrepancies,
      summary: summary.filter(s => s.discrepancies > 0 || s.error),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
