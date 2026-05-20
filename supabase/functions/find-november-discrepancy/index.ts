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

async function getDbInvoicesForDateRange(supabase: any, startDate: string, endDate: string, includeAmounts = false): Promise<any[]> {
  let allRecords: any[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  const selectFields = includeAmounts ? 'reference_number, type, amount, balance' : 'reference_number, type';
  while (true) {
    const { data: page } = await supabase
      .from('acumatica_invoices')
      .select(selectFields)
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
    const targetMonth = body.month;
    const compareAmounts = body.compareAmounts === true;

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

    // Scan all months from Jan 2024 to current, or just one if specified
    const months: { startDate: string; endDate: string; label: string }[] = [];
    const now = new Date();

    if (targetMonth) {
      const [y, m] = targetMonth.split('-').map(Number);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      months.push({ startDate, endDate: nextMonth, label: targetMonth });
    } else {
      for (let year = 2024; year <= now.getFullYear(); year++) {
        const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
        for (let month = 1; month <= maxMonth; month++) {
          const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
          const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
          months.push({ startDate, endDate: nextMonth, label: `${year}-${String(month).padStart(2, '0')}` });
        }
      }
    }

    const allDiscrepancies: any[] = [];
    const allAmountMismatches: any[] = [];
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

      const selectFields = compareAmounts ? 'ReferenceNbr,Type,Date,Amount,Balance,Status' : 'ReferenceNbr,Type,Date';
      const listUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${dateFilterFixed}&$select=${selectFields}`;

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

      const dbInvoices = await getDbInvoicesForDateRange(supabase, monthInfo.startDate, monthInfo.endDate, compareAmounts);
      const dbSet = new Set(dbInvoices.map((inv: any) => `${inv.type}:${inv.reference_number}`));
      const dbAmountMap = new Map(dbInvoices.map((inv: any) => [
        `${inv.type}:${inv.reference_number}`,
        { amount: parseFloat(inv.amount || '0'), balance: parseFloat(inv.balance || '0') }
      ]));

      const mismatched: any[] = [];
      const amountMismatches: any[] = [];
      for (const inv of acumaticaInvoices) {
        const ref = padRefNbr(inv.ReferenceNbr?.value || '');
        const type = inv.Type?.value || '';
        const acumaticaDate = inv.Date?.value || '';
        if (!ref || !type) continue;
        const key = `${type}:${ref}`;
        if (!dbSet.has(key)) {
          mismatched.push({ ref, type, acumaticaDate });
        } else if (compareAmounts) {
          const acuAmount = parseFloat(inv.Amount?.value || '0');
          const acuBalance = parseFloat(inv.Balance?.value || '0');
          const dbVals = dbAmountMap.get(key);
          if (dbVals && (Math.abs(dbVals.amount - acuAmount) > 0.001 || Math.abs(dbVals.balance - acuBalance) > 0.001)) {
            amountMismatches.push({
              ref, type,
              dbAmount: dbVals.amount, acuAmount,
              dbBalance: dbVals.balance, acuBalance,
              status: inv.Status?.value || '',
            });
          }
        }
      }

      if (mismatched.length > 0) {
        const refs = mismatched.map(m => m.ref);
        const { data: dbRecords } = await supabase
          .from('acumatica_invoices')
          .select('reference_number, type, date')
          .in('reference_number', refs);

        const dbDateMap = new Map((dbRecords || []).map((r: any) => [`${r.type}:${r.reference_number}`, r.date]));

        for (const m of mismatched) {
          const ourDate = dbDateMap.get(`${m.type}:${m.ref}`) || 'NOT_FOUND';
          const correctDate = m.acumaticaDate.split('T')[0];
          allDiscrepancies.push({
            ref: m.ref,
            type: m.type,
            ourDate,
            correctDate,
            month: monthInfo.label,
          });
        }
      }

      for (const m of amountMismatches) {
        allAmountMismatches.push({ ...m, month: monthInfo.label });
      }

      summary.push({
        month: monthInfo.label,
        acumaticaCount: acumaticaInvoices.length,
        dbCount: dbInvoices.length,
        discrepancies: mismatched.length,
        amountMismatches: amountMismatches.length,
      });
    }

    // Fix if requested
    let fixed = 0;
    let amountsFixed = 0;
    if (fix) {
      for (const d of allDiscrepancies) {
        if (d.ourDate === 'NOT_FOUND') continue;
        const { error } = await supabase
          .from('acumatica_invoices')
          .update({ date: d.correctDate })
          .eq('reference_number', d.ref)
          .eq('type', d.type);
        if (!error) fixed++;
      }
      for (const m of allAmountMismatches) {
        const { error } = await supabase
          .from('acumatica_invoices')
          .update({ amount: m.acuAmount, balance: m.acuBalance })
          .eq('reference_number', m.ref)
          .eq('type', m.type);
        if (!error) amountsFixed++;
      }
    }

    return new Response(JSON.stringify({
      totalDiscrepancies: allDiscrepancies.length,
      totalAmountMismatches: allAmountMismatches.length,
      fixed,
      amountsFixed,
      discrepancies: allDiscrepancies,
      amountMismatches: allAmountMismatches,
      summary: summary.filter(s => (s.discrepancies > 0) || (s.amountMismatches > 0) || s.error),
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
