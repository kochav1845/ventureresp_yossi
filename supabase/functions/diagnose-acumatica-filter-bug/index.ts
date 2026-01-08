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

    const { data: credentials } = await supabase
      .from('acumatica_sync_credentials')
      .select('acumatica_url, username, password, company, branch')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!credentials) {
      return new Response(
        JSON.stringify({ error: 'No credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const acumaticaUrl = credentials.acumatica_url;
    const loginBody: any = { name: credentials.username, password: credentials.password };
    if (credentials.company) loginBody.company = credentials.company;
    if (credentials.branch) loginBody.branch = credentials.branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Auth failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cookies = loginResponse.headers.get('set-cookie')!
      .split(',').map(c => c.split(';')[0]).join('; ');

    const testTime = '2025-12-29T18:30:00';

    const incrementalUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$select=ReferenceNbr,Date,Status,Amount,Balance,LastModifiedDateTime&$filter=LastModifiedDateTime gt datetimeoffset'${testTime}'&$top=10`;
    const incrementalResponse = await fetch(incrementalUrl, {
      headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
    });
    const incrementalData = await incrementalResponse.json();

    const results = [];

    if (Array.isArray(incrementalData) && incrementalData.length > 0) {
      for (const invoice of incrementalData.slice(0, 3)) {
        const refNbr = invoice.ReferenceNbr?.value;
        if (!refNbr) continue;

        const directUrl = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$select=ReferenceNbr,Date,Status,Amount,Balance,LastModifiedDateTime&$filter=ReferenceNbr eq '${refNbr}'`;
        const directResponse = await fetch(directUrl, {
          headers: { 'Content-Type': 'application/json', 'Cookie': cookies },
        });
        const directData = await directResponse.json();

        results.push({
          referenceNumber: refNbr,
          fromIncrementalSync: {
            date: invoice.Date?.value,
            status: invoice.Status?.value,
            amount: invoice.Amount?.value,
            balance: invoice.Balance?.value,
            lastModified: invoice.LastModifiedDateTime?.value
          },
          fromDirectQuery: directData[0] ? {
            date: directData[0].Date?.value,
            status: directData[0].Status?.value,
            amount: directData[0].Amount?.value,
            balance: directData[0].Balance?.value,
            lastModified: directData[0].LastModifiedDateTime?.value
          } : null,
          dataMatches: JSON.stringify(invoice) === JSON.stringify(directData[0])
        });
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        testDescription: "Comparing incremental sync (filtered by LastModifiedDateTime) vs direct reference number queries",
        filterUsed: `LastModifiedDateTime gt datetimeoffset'${testTime}'`,
        incrementalSyncCount: incrementalData.length || 0,
        comparisons: results,
        conclusion: results.some(r => !r.dataMatches)
          ? "BUG CONFIRMED: Incremental sync returns different data than direct queries!"
          : "Data matches - no bug detected"
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});