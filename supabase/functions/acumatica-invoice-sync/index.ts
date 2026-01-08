import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      acumaticaUrl,
      username,
      password,
      action,
      company,
      branch,
      status,
      customerId,
      count
    } = body;

    if (!acumaticaUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Missing Acumatica credentials" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const loginBody: any = {
      name: username,
      password: password,
    };

    if (company) loginBody.company = company;
    if (branch) loginBody.branch = branch;

    const loginResponse = await fetch(`${acumaticaUrl}/entity/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginBody),
    });

    if (!loginResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Authentication failed. Please check your credentials." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const setCookieHeader = loginResponse.headers.get("set-cookie");
    if (!setCookieHeader) {
      return new Response(
        JSON.stringify({ error: "No authentication cookies received" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

    if (action === "test-connection") {
      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });

      return new Response(
        JSON.stringify({ success: true, message: "Connection successful" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "fetch-customer") {
      if (!customerId) {
        return new Response(
          JSON.stringify({ error: "Customer ID is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const customerUrl = `${acumaticaUrl}/entity/Default/24.200.001/Customer/${customerId}`;

      console.log(`Fetching customer: ${customerId}`);
      console.log(`URL: ${customerUrl}`);

      const customerResponse = await fetch(customerUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookies,
        },
      });

      if (!customerResponse.ok) {
        const errorText = await customerResponse.text();
        await fetch(`${acumaticaUrl}/entity/auth/logout`, {
          method: "POST",
          headers: { "Cookie": cookies },
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: `Customer not found: ${errorText}`
          }),
          {
            status: customerResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const customerData = await customerResponse.json();

      await fetch(`${acumaticaUrl}/entity/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookies },
      });

      const customerName = customerData.CustomerName?.value || customerData.AccountName?.value || 'Unknown';

      return new Response(
        JSON.stringify({
          success: true,
          customerId: customerId,
          customerName: customerName,
          customerData: customerData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }