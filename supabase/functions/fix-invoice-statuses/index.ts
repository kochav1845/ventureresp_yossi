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

    const { acumaticaUrl, username, password, referenceNumbers } = await req.json();

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

    const updates = [];

    for (const refNumber of referenceNumbers) {
      const url = `${acumaticaUrl}/entity/Default/24.200.001/Invoice?$filter=${encodeURIComponent(`ReferenceNbr eq '${refNumber}'`)}&$select=ReferenceNbr,Status,Balance`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookies,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const invoice = data[0];
          const actualStatus = invoice.Status?.value;
          const actualBalance = parseFloat(invoice.Balance?.value || '0');

          if (actualStatus && actualStatus !== 'Open') {
            const { error } = await supabase
              .from('acumatica_invoices')
              .update({
                status: actualStatus,
                balance: actualBalance,
                updated_at: new Date().toISOString(),
              })
              .eq('reference_number', refNumber);

            updates.push({
              referenceNumber: refNumber,
              oldStatus: 'Open',
              newStatus: actualStatus,
              newBalance: actualBalance,
              success: !error,
              error: error?.message,
            });
          }
        }
      }
    }

    await fetch(`${acumaticaUrl}/entity/auth/logout`, {
      method: "POST",
      headers: { "Cookie": cookies },
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        updatedCount: updates.filter(u => u.success).length,
        updates,
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
