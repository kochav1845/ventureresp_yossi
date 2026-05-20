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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    // Fetch all November refs from Acumatica
    const dateFilter = `Date ge datetimeoffset'2025-11-01T00:00:00' and Date le datetimeoffset'2025-11-30T23:59:59'`;
    const listUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${dateFilter}&$select=ReferenceNbr,Type,Date,Status`;

    const response = await sessionManager.makeAuthenticatedRequest(creds, listUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Acumatica API failed: ${response.status} - ${err.substring(0, 500)}`);
    }

    const acumaticaData = await response.json();
    const acumaticaInvoices = Array.isArray(acumaticaData) ? acumaticaData : [];

    // Build set of all ref+type from Acumatica
    const acumaticaRefs = acumaticaInvoices.map((inv: any) => ({
      ref: padRefNbr(inv.ReferenceNbr?.value || ''),
      type: inv.Type?.value || '',
      date: inv.Date?.value || '',
      status: inv.Status?.value || '',
    }));

    // Get our DB November invoices (paginated to avoid 1000 row limit)
    let dbNovInvoices: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type')
        .gte('date', '2025-11-01')
        .lt('date', '2025-12-01')
        .range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      dbNovInvoices = dbNovInvoices.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const dbNovSet = new Set((dbNovInvoices || []).map((inv: any) => `${inv.type}:${inv.reference_number}`));

    // Find refs from Acumatica that are NOT in our November set
    const notInNov = acumaticaRefs.filter((inv: any) => !dbNovSet.has(`${inv.type}:${inv.ref}`));

    // For those missing from November, check if they exist in DB with a different date
    const missingRefs = notInNov.map((inv: any) => inv.ref).filter(Boolean);

    let existElsewhere: any[] = [];
    if (missingRefs.length > 0) {
      const { data: found } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, type, date, status, customer_name')
        .in('reference_number', missingRefs);
      existElsewhere = found || [];
    }

    return new Response(JSON.stringify({
      acumaticaTotal: acumaticaInvoices.length,
      dbNovemberTotal: dbNovInvoices?.length || 0,
      notInNovember: notInNov,
      existInDbWithDifferentDate: existElsewhere,
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
