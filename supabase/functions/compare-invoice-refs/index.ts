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

    const { acumaticaUrl, username, password } = await req.json();

    const loginBody = { name: username, password: password };
    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Authentication failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    const cookies = setCookieHeader!.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    const acumaticaRefs = new Set<string>();
    let skip = 0;
    const pageSize = 1000;

    while (skip < 12000) {
      const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${encodeURIComponent("Status eq 'Open'")}&$top=${pageSize}&$skip=${skip}&$select=ReferenceNbr`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookies,
        },
      });

      if (!response.ok) break;

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) break;

      data.forEach((invoice: any) => {
        if (invoice.ReferenceNbr?.value) {
          const ref = invoice.ReferenceNbr.value.trim();
          const paddedRef = ref.padStart(6, '0');
          acumaticaRefs.add(paddedRef);
        }
      });

      if (data.length < pageSize) break;
      skip += pageSize;
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    }).catch(() => {});

    let dbInvoices: any[] = [];
    let hasMore = true;
    let offset = 0;
    const limit = 1000;

    while (hasMore) {
      const { data, error } = await supabase
        .from('acumatica_invoices')
        .select('reference_number, status, balance, date')
        .eq('status', 'Open')
        .range(offset, offset + limit - 1);

      if (error || !data || data.length === 0) {
        hasMore = false;
      } else {
        dbInvoices = dbInvoices.concat(data);
        if (data.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
    }

    const dbRefs = new Set(dbInvoices?.map(inv => inv.reference_number.padStart(6, '0')) || []);

    const inDbNotInAcumatica = dbInvoices?.filter(
      inv => {
        const paddedRef = inv.reference_number.padStart(6, '0');
        return !acumaticaRefs.has(paddedRef);
      }
    ) || [];

    const inAcumaticaNotInDb = Array.from(acumaticaRefs).filter(
      ref => {
        const paddedRef = ref.padStart(6, '0');
        return !dbRefs.has(paddedRef);
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        acumaticaCount: acumaticaRefs.size,
        dbCount: dbRefs.size,
        difference: dbRefs.size - acumaticaRefs.size,
        inDbNotInAcumatica: inDbNotInAcumatica.slice(0, 50),
        inAcumaticaNotInDb: inAcumaticaNotInDb.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
