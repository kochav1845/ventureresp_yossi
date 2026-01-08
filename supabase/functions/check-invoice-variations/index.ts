import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InvoiceCheckResult {
  original: string;
  withZeros: string;
  withoutZeros: string;
  originalExists: boolean;
  withZerosExists: boolean;
  withoutZerosExists: boolean;
  foundAs: string | null;
  acumaticaData: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { invoiceNumbers } = await req.json();

    if (!invoiceNumbers || !Array.isArray(invoiceNumbers)) {
      return new Response(
        JSON.stringify({ error: "invoiceNumbers array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: credentials, error: credsError } = await supabase
      .from('acumatica_sync_credentials')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credsError || !credentials) {
      return new Response(
        JSON.stringify({ error: `No active Acumatica credentials found: ${credsError?.message || 'No credentials in database'}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let ACUMATICA_ENDPOINT = credentials.acumatica_url;
    const ACUMATICA_USERNAME = credentials.username;
    const ACUMATICA_PASSWORD = credentials.password;
    const ACUMATICA_COMPANY = credentials.company || "";
    const ACUMATICA_BRANCH = credentials.branch || "";

    if (ACUMATICA_ENDPOINT && !ACUMATICA_ENDPOINT.startsWith("http://") && !ACUMATICA_ENDPOINT.startsWith("https://")) {
      ACUMATICA_ENDPOINT = `https://${ACUMATICA_ENDPOINT}`;
    }

    if (!ACUMATICA_ENDPOINT || !ACUMATICA_USERNAME || !ACUMATICA_PASSWORD) {
      throw new Error("Missing Acumatica credentials");
    }

    // Login to Acumatica
    const loginResponse = await fetch(`${ACUMATICA_ENDPOINT}/entity/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ACUMATICA_USERNAME,
        password: ACUMATICA_PASSWORD,
        company: ACUMATICA_COMPANY,
        branch: ACUMATICA_BRANCH,
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Acumatica login failed: ${loginResponse.statusText}`);
    }

    const cookies = loginResponse.headers.get("set-cookie");
    if (!cookies) {
      throw new Error("No session cookie received from Acumatica");
    }

    const results: InvoiceCheckResult[] = [];

    // Check each invoice number
    for (const invoiceNum of invoiceNumbers) {
      const original = invoiceNum;
      const withZeros = invoiceNum.length < 6 ? invoiceNum.padStart(6, '0') : invoiceNum;
      const withoutZeros = invoiceNum.replace(/^0+/, '');

      const variations = [
        { key: 'original', value: original },
        { key: 'withZeros', value: withZeros },
        { key: 'withoutZeros', value: withoutZeros }
      ];

      const result: InvoiceCheckResult = {
        original,
        withZeros,
        withoutZeros,
        originalExists: false,
        withZerosExists: false,
        withoutZerosExists: false,
        foundAs: null,
        acumaticaData: null
      };

      // Check each variation
      for (const variation of variations) {
        try {
          const checkUrl = `${ACUMATICA_ENDPOINT}/entity/Default/24.200.001/Invoice?$filter=ReferenceNbr eq '${variation.value}'&$select=ReferenceNbr,Type,Status,Balance,Customer,Date,DueDate`;

          const checkResponse = await fetch(checkUrl, {
            method: "GET",
            headers: {
              "Cookie": cookies,
              "Accept": "application/json",
            },
          });

          if (checkResponse.ok) {
            const data = await checkResponse.json();
            if (data && Array.isArray(data) && data.length > 0) {
              if (variation.key === 'original') result.originalExists = true;
              if (variation.key === 'withZeros') result.withZerosExists = true;
              if (variation.key === 'withoutZeros') result.withoutZerosExists = true;

              if (!result.foundAs) {
                result.foundAs = variation.value;
                result.acumaticaData = data[0];
              }
            }
          }
        } catch (error) {
          console.error(`Error checking ${variation.value}:`, error);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      results.push(result);
    }

    // Logout
    await fetch(`${ACUMATICA_ENDPOINT}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    });

    return new Response(
      JSON.stringify({ results, total: results.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});