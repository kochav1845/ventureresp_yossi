import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AcumaticaSessionManager } from "../_shared/acumatica-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: creds } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!creds) {
      return new Response(
        JSON.stringify({ error: "No Acumatica credentials found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);
    const credentials = {
      acumaticaUrl: creds.acumatica_url,
      username: creds.username,
      password: creds.password,
      company: creds.company || "",
      branch: creds.branch || "",
    };

    const body = await req.json().catch(() => ({}));
    const referenceNbr = body.referenceNbr || "041580";

    const results: Record<string, unknown> = {};

    const customFieldsUrl = `${creds.acumatica_url}/entity/Default/24.200.001/Payment/Credit Memo/${referenceNbr}?$custom=Document.DocDate,Document.FinPeriodID,Document.AdjDate,Document.AdjFinPeriodID,Document.DocDesc,Document.TranPeriodID`;
    console.log("Attempt 1 - $custom fields:", customFieldsUrl);

    const customResp = await sessionManager.makeAuthenticatedRequest(credentials, customFieldsUrl);
    if (customResp.ok) {
      const data = await customResp.json();
      results.customFields = {
        custom: data.custom,
        ApplicationDate: data.ApplicationDate,
        allKeys: Object.keys(data),
      };
    } else {
      results.customFields = { error: `HTTP ${customResp.status}`, body: await customResp.text() };
    }

    const invoiceUrl = `${creds.acumatica_url}/entity/Default/24.200.001/Invoice?$filter=Type eq 'Credit Memo' and ReferenceNbr eq '${referenceNbr}'`;
    console.log("Attempt 2 - Invoice endpoint:", invoiceUrl);

    const invoiceResp = await sessionManager.makeAuthenticatedRequest(credentials, invoiceUrl);
    if (invoiceResp.ok) {
      const data = await invoiceResp.json();
      results.invoiceEndpoint = {
        count: Array.isArray(data) ? data.length : 1,
        data: Array.isArray(data)
          ? data.map((d: Record<string, unknown>) => ({
              allKeys: Object.keys(d),
              fullData: d,
            }))
          : { allKeys: Object.keys(data), fullData: data },
      };
    } else {
      results.invoiceEndpoint = { error: `HTTP ${invoiceResp.status}`, body: await invoiceResp.text() };
    }

    const screenUrl = `${creds.acumatica_url}/entity/Default/24.200.001/Payment/Credit Memo/${referenceNbr}?$select=ApplicationDate,ReferenceNbr,Type,Status,PaymentAmount,Description,CustomerID&$custom=Document.DocDate,Document.FinPeriodID,Document.AdjDate,Document.AdjFinPeriodID`;
    console.log("Attempt 3 - $select + $custom:", screenUrl);

    const screenResp = await sessionManager.makeAuthenticatedRequest(credentials, screenUrl);
    if (screenResp.ok) {
      const data = await screenResp.json();
      results.selectPlusCustom = {
        custom: data.custom,
        ApplicationDate: data.ApplicationDate,
        allKeys: Object.keys(data),
        fullData: data,
      };
    } else {
      results.selectPlusCustom = { error: `HTTP ${screenResp.status}`, body: await screenResp.text() };
    }

    const sbApiUrl = `${creds.acumatica_url}/api/AR302000/12.000.001?Type=Credit Memo&ReferenceNbr=${referenceNbr}`;
    console.log("Attempt 4 - Screen-based API:", sbApiUrl);

    const sbResp = await sessionManager.makeAuthenticatedRequest(credentials, sbApiUrl);
    if (sbResp.ok) {
      const data = await sbResp.json();
      results.screenBasedApi = { allKeys: Object.keys(data), fullData: data };
    } else {
      results.screenBasedApi = { error: `HTTP ${sbResp.status}`, body: (await sbResp.text()).substring(0, 500) };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
