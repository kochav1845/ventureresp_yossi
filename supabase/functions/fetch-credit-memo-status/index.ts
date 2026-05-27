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
    const { referenceNumbers } = await req.json();

    if (!referenceNumbers || !Array.isArray(referenceNumbers) || referenceNumbers.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "referenceNumbers array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load credentials from database (same as other sync functions)
    const { data: config } = await supabase
      .from("acumatica_sync_credentials")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: "No Acumatica credentials found in database" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let acumaticaUrl = config.acumatica_url;
    if (!acumaticaUrl.startsWith("http://") && !acumaticaUrl.startsWith("https://")) {
      acumaticaUrl = `https://${acumaticaUrl}`;
    }

    const credentials = {
      acumaticaUrl,
      username: config.username,
      password: config.password,
      company: config.company || "",
      branch: config.branch || "",
    };

    // Use session manager like other functions
    const sessionManager = new AcumaticaSessionManager(supabaseUrl, supabaseKey);
    let cookies: string;
    try {
      cookies = await sessionManager.getSession(credentials);
    } catch {
      // Fallback to direct login
      const loginBody: Record<string, string> = {
        name: credentials.username,
        password: credentials.password,
      };
      if (credentials.company) loginBody.company = credentials.company;
      if (credentials.branch) loginBody.branch = credentials.branch;

      const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginBody),
      });

      if (!loginResponse.ok) {
        const errText = await loginResponse.text();
        throw new Error(`Login failed: ${loginResponse.status} - ${errText}`);
      }

      cookies = loginResponse.headers.get("set-cookie") || "";
      if (!cookies) throw new Error("No session cookie received");
    }

    const results: Record<string, any> = {};

    for (const refNbr of referenceNumbers) {
      const paddedRef = refNbr.toString().padStart(6, "0");

      // Try fetching as Credit Memo first
      const cmUrl = `${acumaticaUrl}/entity/Default/23.200.001/CreditMemo?$filter=ReferenceNbr eq '${paddedRef}'`;
      const cmResponse = await fetch(cmUrl, {
        headers: { Cookie: cookies, Accept: "application/json" },
      });

      let cmData = null;
      if (cmResponse.ok) {
        const cmList = await cmResponse.json();
        if (cmList && cmList.length > 0) {
          cmData = cmList[0];
        }
      }

      // Also try as Invoice
      const invUrl = `${acumaticaUrl}/entity/Default/23.200.001/Invoice?$filter=ReferenceNbr eq '${paddedRef}'`;
      const invResponse = await fetch(invUrl, {
        headers: { Cookie: cookies, Accept: "application/json" },
      });

      let invData = null;
      if (invResponse.ok) {
        const invList = await invResponse.json();
        if (invList && invList.length > 0) {
          invData = invList[0];
        }
      }

      // Get our DB record
      const { data: dbRecords } = await supabase
        .from("acumatica_invoices")
        .select("reference_number, doc_type, status, balance, amount, customer_name, last_modified_at")
        .eq("reference_number", paddedRef);

      const acumaticaRecord = cmData || invData;
      results[paddedRef] = {
        acumatica: acumaticaRecord
          ? {
              type: cmData ? "Credit Memo" : "Invoice",
              referenceNbr: acumaticaRecord.ReferenceNbr?.value,
              status: acumaticaRecord.Status?.value,
              balance: acumaticaRecord.Balance?.value,
              amount: acumaticaRecord.Amount?.value,
              customer: acumaticaRecord.Customer?.value || acumaticaRecord.CustomerID?.value,
              date: acumaticaRecord.Date?.value,
              lastModified: acumaticaRecord.LastModifiedDateTime?.value,
            }
          : null,
        database: dbRecords || [],
      };
    }

    // Logout
    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
